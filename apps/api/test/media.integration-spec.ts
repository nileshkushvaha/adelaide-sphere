import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { ObjectStoragePort, type PresignedUpload, type StoredObject } from '../src/media/storage.port.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

/** In-memory storage so the upload lifecycle is exercised without a network call. */
class MemoryStorage extends ObjectStoragePort {
  objects = new Map<string, { body: Buffer; contentType: string }>();
  deleted: string[] = [];
  async presignUpload(bucket: 'quarantine' | 'public', key: string, contentType: string): Promise<PresignedUpload> {
    return { url: `https://storage.test/${bucket}/${key}?signed=1`, headers: { 'content-type': contentType }, expiresInSeconds: 300 };
  }
  async head(bucket: 'quarantine' | 'public', key: string): Promise<StoredObject | null> {
    const object = this.objects.get(`${bucket}/${key}`);
    return object ? { bytes: object.body.byteLength, contentType: object.contentType } : null;
  }
  async getBytes(bucket: 'quarantine' | 'public', key: string): Promise<Buffer> {
    const object = this.objects.get(`${bucket}/${key}`);
    if (!object) throw new Error('not found');
    return object.body;
  }
  async put(bucket: 'quarantine' | 'public', key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(`${bucket}/${key}`, { body, contentType });
  }
  async delete(bucket: 'quarantine' | 'public', key: string): Promise<void> {
    this.deleted.push(`${bucket}/${key}`);
    this.objects.delete(`${bucket}/${key}`);
  }
  publicUrl(key: string): string {
    return `https://cdn.test/${key}`;
  }
  async ensureBuckets(): Promise<void> {}
}

/** A minimal but real 1200x800 PNG (solid colour), built without an image library. */
function pngBytes(width = 1200, height = 800): Buffer {
  const zlib = require('node:zlib') as typeof import('node:zlib');
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) raw[y * (width * 3 + 1)] = 0;
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData) >>> 0);
    return Buffer.concat([length, typeAndData, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function crc32(buffer: Buffer): number {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc;
}

describe('Media pipeline (integration)', () => {
  let app: INestApplication;
  let storage: MemoryStorage;
  let cookie: string;
  let readerCookie: string;
  let businessId: string;
  const agent = () => request(app.getHttpServer());
  const admin = (req: request.Test, c = cookie) => req.set('Origin', ORIGIN).set('Cookie', c);
  const png = pngBytes();
  const login = async (email: string, password: string, ip: string) => {
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ email, password }).expect(200);
    return ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
  };

  /** Runs the whole upload lifecycle and returns the asset id. */
  const upload = async (body: Buffer, contentType = 'image/png', altText: string | null = 'A Adelaide laneway') => {
    const ticket = (await admin(agent().post('/api/v1/admin/media/uploads')).send({ fileName: 'laneway.png', contentType, bytes: body.byteLength }).expect(201)).body.data;
    const db = testDatabase();
    const asset = await db.mediaAsset.findUniqueOrThrow({ where: { id: ticket.assetId } });
    await storage.put('quarantine', asset.objectKey, body, contentType);
    const completed = await admin(agent().post(`/api/v1/admin/media/${ticket.assetId}/complete`)).send({ checksum: createHash('sha256').update(body).digest('hex'), altText });
    return { assetId: ticket.assetId as string, ticket, completed };
  };

  beforeAll(async () => {
    await truncateApplicationTables();
    storage = new MemoryStorage();
    app = await createIntegrationApp({ overrides: [{ token: ObjectStoragePort, useValue: storage }] });
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    cookie = await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.210');
    const db = testDatabase();
    const role = await db.role.create({ data: { key: 'media_reader', name: 'Reader', description: 'test' } });
    const perm = await db.permission.findUniqueOrThrow({ where: { key: 'listings.read' } });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    await seedSuperAdmin(app, { email: 'media.reader@example.com', password: 'reader-password-12345', displayName: 'Reader' });
    const reader = await db.adminUser.findUniqueOrThrow({ where: { email: 'media.reader@example.com' } });
    await db.adminRole.deleteMany({ where: { adminId: reader.id } });
    await db.adminRole.create({ data: { adminId: reader.id, roleId: role.id } });
    readerCookie = await login('media.reader@example.com', 'reader-password-12345', '203.0.113.211');

    const category = (await admin(agent().post('/api/v1/admin/categories')).send({ name: 'Cafes' }).expect(201)).body.data.id;
    const area = (await admin(agent().post('/api/v1/admin/areas')).send({ name: 'Unley', eligibilitySource: 'council list' }).expect(201)).body.data.id;
    const business = (await admin(agent().post('/api/v1/admin/businesses')).send({ name: 'Gallery Cafe', description: 'A cafe used by the media tests, long enough to publish.', primaryCategoryId: category, localAreaId: area, publicPhone: '03 9000 7777', eligibilitySource: 'council list', contentRightsReviewed: true }).expect(201)).body.data;
    businessId = business.id;
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  let assetId: string;

  it('issues a constrained signed upload with a server-generated key', async () => {
    // A mutation without a trusted Origin is refused by the CSRF guard before authentication (SRS SEC 001).
    await agent().post('/api/v1/admin/media/uploads').expect(403);
    await agent().post('/api/v1/admin/media/uploads').set('Origin', ORIGIN).send({ fileName: 'a.png', contentType: 'image/png', bytes: 10 }).expect(401);
    await agent().get('/api/v1/admin/media').expect(401);
    await admin(agent().post('/api/v1/admin/media/uploads'), readerCookie).send({ fileName: 'a.png', contentType: 'image/png', bytes: 100 }).expect(403);
    await admin(agent().post('/api/v1/admin/media/uploads')).send({ fileName: 'a.svg', contentType: 'image/svg+xml', bytes: 100 }).expect(400);
    await admin(agent().post('/api/v1/admin/media/uploads')).send({ fileName: 'a.png', contentType: 'image/png', bytes: 11 * 1024 * 1024 }).expect(400);
    await admin(agent().post('/api/v1/admin/media/uploads')).send({ fileName: 'a.png', contentType: 'image/png', bytes: 100, objectKey: 'attacker/key.png' }).expect(400); // no client-chosen key

    const ticket = (await admin(agent().post('/api/v1/admin/media/uploads')).send({ fileName: 'laneway.png', contentType: 'image/png', bytes: png.byteLength }).expect(201)).body.data;
    expect(ticket.uploadUrl).toContain('signed=1');
    const db = testDatabase();
    const asset = await db.mediaAsset.findUniqueOrThrow({ where: { id: ticket.assetId } });
    expect(asset.objectKey).toMatch(/^quarantine\/[a-z0-9]+\/[0-9a-f]{24}\.png$/);
    expect(asset.status).toBe('quarantined');
  });

  it('validates the uploaded bytes and queues processing, exposing no public URL yet', async () => {
    const { assetId: id, completed } = await upload(png);
    expect(completed.status).toBe(200);
    assetId = id;
    expect(completed.body.data).toMatchObject({ status: 'quarantined', width: 1200, height: 800, variants: [], altText: 'A Adelaide laneway' });
    const db = testDatabase();
    expect(await db.outboxEvent.count({ where: { resourceId: assetId, type: 'media.uploaded' } })).toBe(1);
    const stored = await db.mediaAsset.findUniqueOrThrow({ where: { id: assetId } });
    expect(stored.checksum).toBe(createHash('sha256').update(png).digest('hex'));
    expect(JSON.stringify(completed.body)).not.toContain('quarantine/');
  });

  it('rejects mismatched checksums, non-images and disguised files without publishing them', async () => {
    const db = testDatabase();
    const wrongChecksum = await (async () => {
      const ticket = (await admin(agent().post('/api/v1/admin/media/uploads')).send({ fileName: 'x.png', contentType: 'image/png', bytes: png.byteLength }).expect(201)).body.data;
      const asset = await db.mediaAsset.findUniqueOrThrow({ where: { id: ticket.assetId } });
      await storage.put('quarantine', asset.objectKey, png, 'image/png');
      return admin(agent().post(`/api/v1/admin/media/${ticket.assetId}/complete`)).send({ checksum: 'f'.repeat(64) }).expect(200);
    })();
    expect(wrongChecksum.body.data).toMatchObject({ status: 'rejected', rejectionReason: expect.stringContaining('checksum') });

    const disguised = await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'), 'image/png');
    expect(disguised.completed.body.data).toMatchObject({ status: 'rejected' });
    expect(disguised.completed.body.data.rejectionReason).toMatch(/not a recognised image|do not match/);
    // Rejected originals are removed, so nothing stays addressable.
    expect(storage.deleted.some((key) => key.startsWith('quarantine/'))).toBe(true);

    const missing = (await admin(agent().post('/api/v1/admin/media/uploads')).send({ fileName: 'never.png', contentType: 'image/png', bytes: 100 }).expect(201)).body.data;
    await admin(agent().post(`/api/v1/admin/media/${missing.assetId}/complete`)).send({}).expect(409);
    await admin(agent().post(`/api/v1/admin/media/${assetId}/complete`)).send({}).expect(409); // already completed
  });

  it('refuses gallery use until the asset is processed, then records order, cover and alt overrides', async () => {
    const db = testDatabase();
    const business = await db.business.findUniqueOrThrow({ where: { id: businessId } });
    const notReady = await admin(agent().put(`/api/v1/admin/businesses/${businessId}/gallery`)).send({ expectedVersion: business.version, items: [{ mediaId: assetId }] }).expect(400);
    expect(notReady.body.error.fields.items).toEqual(['One or more images are not ready']);

    // Simulate the worker finishing.
    await db.mediaAsset.update({ where: { id: assetId }, data: { status: 'ready', readyAt: new Date() } });
    await db.mediaVariant.createMany({
      data: [
        { assetId, kind: 'thumbnail', objectKey: 'media/a/1.webp', mimeType: 'image/webp', width: 320, height: 213, bytes: 900 },
        { assetId, kind: 'card', objectKey: 'media/a/2.webp', mimeType: 'image/webp', width: 800, height: 533, bytes: 2400 },
      ],
    });
    const second = await upload(pngBytes(900, 600), 'image/png', null);
    await db.mediaAsset.update({ where: { id: second.assetId }, data: { status: 'ready', readyAt: new Date() } });

    const noAlt = await admin(agent().put(`/api/v1/admin/businesses/${businessId}/gallery`)).send({ expectedVersion: business.version, items: [{ mediaId: second.assetId }] }).expect(400);
    expect(noAlt.body.error.fields.items).toEqual(['Add alt text for each image']);
    await admin(agent().put(`/api/v1/admin/businesses/${businessId}/gallery`)).send({ expectedVersion: business.version, items: [{ mediaId: assetId }, { mediaId: assetId }] }).expect(400);
    await admin(agent().put(`/api/v1/admin/businesses/${businessId}/gallery`)).send({ expectedVersion: business.version, items: [{ mediaId: assetId, isCover: true }, { mediaId: second.assetId, altOverride: 'Second image', isCover: true }] }).expect(400);
    await admin(agent().put(`/api/v1/admin/businesses/${businessId}/gallery`), readerCookie).send({ expectedVersion: business.version, items: [] }).expect(403);

    const saved = await admin(agent().put(`/api/v1/admin/businesses/${businessId}/gallery`))
      .send({ expectedVersion: business.version, items: [{ mediaId: assetId, caption: 'Front window', isCover: true }, { mediaId: second.assetId, altOverride: 'The courtyard' }] })
      .expect(200);
    expect(saved.body.data.map((entry: { mediaId: string; alt: string; isCover: boolean; sortOrder: number }) => [entry.mediaId === assetId, entry.alt, entry.isCover, entry.sortOrder])).toEqual([
      [true, 'A Adelaide laneway', true, 0],
      [false, 'The courtyard', false, 1],
    ]);
    expect(saved.body.data[0].variants.map((v: { kind: string; url: string }) => [v.kind, v.url])).toEqual([['thumbnail', 'https://cdn.test/media/a/1.webp'], ['card', 'https://cdn.test/media/a/2.webp']]);
    await admin(agent().put(`/api/v1/admin/businesses/${businessId}/gallery`)).send({ expectedVersion: business.version, items: [] }).expect(409); // stale
  });

  it('refuses to delete an asset that is still used, and deletes an unused one with its variants', async () => {
    const inUse = await admin(agent().delete(`/api/v1/admin/media/${assetId}`)).expect(409);
    expect(inUse.body.error.code).toBe('MEDIA_IN_USE');
    const spare = await upload(pngBytes(600, 400));
    await admin(agent().delete(`/api/v1/admin/media/${spare.assetId}`)).expect(204);
    const db = testDatabase();
    expect(await db.mediaAsset.findUnique({ where: { id: spare.assetId } })).toBeNull();
    const list = await admin(agent().get('/api/v1/admin/media?status=ready')).expect(200);
    expect(list.body.data.every((asset: { status: string }) => asset.status === 'ready')).toBe(true);
    const unused = await admin(agent().get('/api/v1/admin/media?unused=true')).expect(200);
    expect(unused.body.data.every((asset: { usages: unknown[] }) => asset.usages.length === 0)).toBe(true);
    const detail = await admin(agent().get(`/api/v1/admin/media/${assetId}`)).expect(200);
    expect(detail.body.data.usages).toEqual([{ kind: 'business', id: businessId, label: 'Gallery Cafe' }]);
  });

  it('counts a testimonial, a partner and the site settings as uses, so none of their images can be deleted', async () => {
    const db = testDatabase();
    const ready = async (width: number) => {
      const { assetId: id } = await upload(pngBytes(width, 400));
      await db.mediaAsset.update({ where: { id }, data: { status: 'ready', readyAt: new Date() } });
      return id;
    };
    const portrait = await ready(610);
    const logo = await ready(620);
    const siteLogo = await ready(630);

    // Written directly: these relations are SET NULL and the settings reference
    // has no foreign key at all, so the database alone would allow each delete.
    const testimonial = await db.testimonial.create({ data: { displayName: 'Priya', quote: 'Found a plumber in an hour.', mediaId: portrait } });
    const partner = await db.partnerOrganisation.create({ data: { name: 'Unley Traders', mediaId: logo } });
    await db.setting.upsert({
      where: { group_key: { group: 'website', key: 'general' } },
      create: { group: 'website', key: 'general', data: { logoMediaId: siteLogo } },
      update: { data: { logoMediaId: siteLogo } },
    });

    for (const [id, label] of [[portrait, 'Priya'], [logo, 'Unley Traders'], [siteLogo, 'Site logo, icon or sharing image']] as const) {
      const refused = await admin(agent().delete(`/api/v1/admin/media/${id}`)).expect(409);
      expect(refused.body.error.code).toBe('MEDIA_IN_USE');
      // The refusal names the place, so the administrator knows where to go.
      expect(refused.body.error.message).toContain(label);
      expect(await db.mediaAsset.findUnique({ where: { id } })).not.toBeNull();
    }

    const detail = await admin(agent().get(`/api/v1/admin/media/${portrait}`)).expect(200);
    expect(detail.body.data.usages).toEqual([{ kind: 'testimonial', id: testimonial.id, label: 'Priya' }]);
    const partnerDetail = await admin(agent().get(`/api/v1/admin/media/${logo}`)).expect(200);
    expect(partnerDetail.body.data.usages).toEqual([{ kind: 'partner', id: partner.id, label: 'Unley Traders' }]);

    // "Unused" agrees with deletion: none of the three is offered as unused.
    const unused = (await admin(agent().get('/api/v1/admin/media?unused=true&pageSize=50')).expect(200)).body.data as { id: string }[];
    expect(unused.map((asset) => asset.id)).not.toEqual(expect.arrayContaining([portrait]));
    expect(unused.some((asset) => [portrait, logo, siteLogo].includes(asset.id))).toBe(false);

    await db.testimonial.delete({ where: { id: testimonial.id } });
    await db.partnerOrganisation.delete({ where: { id: partner.id } });
    await db.setting.delete({ where: { group_key: { group: 'website', key: 'general' } } });
  });

  it('counts an image inside an article, page or answer as a use, and lets it go once the text no longer shows it', async () => {
    const db = testDatabase();
    const { assetId: bodyImage } = await upload(pngBytes(640, 400));
    await db.mediaAsset.update({ where: { id: bodyImage }, data: { status: 'ready', readyAt: new Date(Date.now() - 400 * 86_400_000), altText: 'A tram on King William Street' } });
    const author = await db.author.create({ data: { displayName: 'Body Image Author', slug: 'body-image-author' } });
    const category = await db.blogCategory.create({ data: { name: 'Body images', slug: 'body-images' } });
    // Inserted before the editor recorded ids: recognised from the rendition address.
    const legacyHtml = `<p>Before</p><img src="https://cdn.test/media/${bodyImage}/rendition.webp" alt="A tram">`;
    const created = await admin(agent().post('/api/v1/admin/posts'))
      .send({ title: 'An article with a picture', authorId: author.id, categoryId: category.id, bodyFormat: 'html', bodyMarkdown: legacyHtml })
      .expect(201);
    const postId = created.body.data.id as string;

    const refused = await admin(agent().delete(`/api/v1/admin/media/${bodyImage}`)).expect(409);
    expect(refused.body.error.code).toBe('MEDIA_IN_USE');
    expect(refused.body.error.message).toContain('An article with a picture (inside the article)');
    const detail = await admin(agent().get(`/api/v1/admin/media/${bodyImage}`)).expect(200);
    expect(detail.body.data.usages).toEqual([{ kind: 'post', id: postId, label: 'An article with a picture (inside the article)' }]);
    // The retention task and the library's "unused" filter use the same definition.
    const unused = (await admin(agent().get('/api/v1/admin/media?unused=true&pageSize=50')).expect(200)).body.data as { id: string }[];
    expect(unused.some((asset) => asset.id === bodyImage)).toBe(false);

    // The editor's own markup names the image explicitly; an invalid id is dropped by the sanitiser.
    const tagged = await admin(agent().patch(`/api/v1/admin/posts/${postId}`))
      .send({ expectedVersion: created.body.data.version, bodyFormat: 'html', bodyMarkdown: `<img data-media-id="${bodyImage}" src="https://cdn.test/other/path.webp" alt="A tram"><img data-media-id="not an id" src="https://cdn.test/x.webp" alt="">` })
      .expect(200);
    expect(tagged.body.data.sanitizedBody).toContain(`data-media-id="${bodyImage}"`);
    expect(tagged.body.data.sanitizedBody).not.toContain('not an id');
    expect(await db.contentMediaReference.count({ where: { resourceType: 'post', resourceId: postId } })).toBe(1);

    await admin(agent().patch(`/api/v1/admin/posts/${postId}`)).send({ expectedVersion: tagged.body.data.version, bodyFormat: 'html', bodyMarkdown: '<p>No picture any more.</p>' }).expect(200);
    expect(await db.contentMediaReference.count({ where: { mediaId: bodyImage } })).toBe(0);
    await admin(agent().delete(`/api/v1/admin/media/${bodyImage}`)).expect(204);
  });

  it('edits alt text, credit and focal point with the record version', async () => {
    const current = (await admin(agent().get(`/api/v1/admin/media/${assetId}`)).expect(200)).body.data;
    const updated = await admin(agent().patch(`/api/v1/admin/media/${assetId}`)).send({ expectedVersion: current.version, altText: 'Front window of the cafe', credit: 'Photo: Alex', rightsNote: 'Licensed from the owner', focalX: 0.4, focalY: 0.6 }).expect(200);
    expect(updated.body.data).toMatchObject({ altText: 'Front window of the cafe', credit: 'Photo: Alex', focalX: 0.4, focalY: 0.6 });
    await admin(agent().patch(`/api/v1/admin/media/${assetId}`)).send({ expectedVersion: current.version, altText: 'Stale' }).expect(409);
  });
});
