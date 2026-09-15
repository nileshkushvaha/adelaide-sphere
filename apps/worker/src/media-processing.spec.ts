import sharp from 'sharp';
import { processMediaAsset, type MediaProcessingDeps, type StorageAdapter } from './media-processing.js';

class MemoryStorage implements StorageAdapter {
  objects = new Map<string, Buffer>();
  deleted: string[] = [];
  failOnGet = false;
  async getBytes(bucket: 'quarantine' | 'public', key: string): Promise<Buffer> {
    if (this.failOnGet) throw new Error('not found');
    const value = this.objects.get(`${bucket}/${key}`);
    if (!value) throw new Error('not found');
    return value;
  }
  async put(bucket: 'quarantine' | 'public', key: string, body: Buffer): Promise<void> {
    this.objects.set(`${bucket}/${key}`, body);
  }
  async delete(bucket: 'quarantine' | 'public', key: string): Promise<void> {
    this.deleted.push(`${bucket}/${key}`);
    this.objects.delete(`${bucket}/${key}`);
  }
}

async function jpegWithExif(width = 2000, height = 1200): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 20, g: 40, b: 80 } } })
    // sharp's typed EXIF blocks: IFD0 carries the copyright, IFD3 the GPS tags.
    .withMetadata({ exif: { IFD0: { Copyright: 'Test', Artist: 'Someone' }, IFD3: { GPSLatitudeRef: 'S' } } })
    .jpeg()
    .toBuffer();
}

function deps(overrides: { status?: string; original?: Buffer; storage?: MemoryStorage } = {}) {
  const storage = overrides.storage ?? new MemoryStorage();
  const asset = { id: 'asset-1', objectKey: 'quarantine/asset-1/abc.jpg', status: overrides.status ?? 'quarantined', variants: [] as { objectKey: string }[] };
  const updates: Record<string, unknown>[] = [];
  const variants: Record<string, unknown>[] = [];
  if (overrides.original) storage.objects.set(`quarantine/${asset.objectKey}`, overrides.original);
  const db = {
    mediaAsset: {
      findUnique: async () => asset,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return asset;
      },
    },
    mediaVariant: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        variants.push(...data);
        return { count: data.length };
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  const dependencies = { db: db as never, storage, randomKey: (() => {
      let n = 0;
      return () => `randomkey${n++}`;
    })(), now: () => new Date('2026-09-06T00:00:00Z') } satisfies MediaProcessingDeps;
  return { dependencies, storage, updates, variants };
}

describe('media variant processing (SRS MED 001–003)', () => {
  it('produces three WebP renditions without EXIF and marks the asset ready', async () => {
    const original = await jpegWithExif();
    const { dependencies, storage, updates, variants } = deps({ original });
    expect(await processMediaAsset({ eventId: 'e1', mediaId: 'asset-1' }, dependencies)).toBe('ready');
    expect(variants.map((v) => v.kind)).toEqual(['thumbnail', 'card', 'hero']);
    expect(variants.every((v) => v.mimeType === 'image/webp')).toBe(true);
    // Never upscaled, aspect ratio preserved.
    expect(variants.map((v) => [v.width, v.height])).toEqual([[320, 192], [800, 480], [1600, 960]]);
    expect(updates.at(-1)).toMatchObject({ status: 'ready', width: 2000, height: 1200 });

    const published = [...storage.objects.entries()].filter(([key]) => key.startsWith('public/'));
    expect(published).toHaveLength(3);
    for (const [, body] of published) {
      const metadata = await sharp(body).metadata();
      expect(metadata.format).toBe('webp');
      expect(metadata.exif).toBeUndefined(); // EXIF, including GPS, is gone
    }
  });

  it('rejects an unreadable or undecodable original and publishes nothing', async () => {
    const missing = deps();
    missing.storage.failOnGet = true;
    expect(await processMediaAsset({ eventId: 'e1', mediaId: 'asset-1' }, missing.dependencies)).toBe('rejected');
    expect(missing.updates.at(-1)).toMatchObject({ status: 'rejected' });

    const garbage = deps({ original: Buffer.from('this is not an image at all') });
    expect(await processMediaAsset({ eventId: 'e1', mediaId: 'asset-1' }, garbage.dependencies)).toBe('rejected');
    expect([...garbage.storage.objects.keys()].filter((k) => k.startsWith('public/'))).toHaveLength(0);
  });

  it('skips an asset that is no longer quarantined, so repeat delivery is safe', async () => {
    const { dependencies, variants } = deps({ status: 'ready', original: await jpegWithExif() });
    expect(await processMediaAsset({ eventId: 'e1', mediaId: 'asset-1' }, dependencies)).toBe('skipped');
    expect(variants).toHaveLength(0);
  });
});

describe('documents (change log 1.16)', () => {
  it('leaves a PDF alone: the API checks and publishes documents itself', async () => {
    const storage = new MemoryStorage();
    let updated = false;
    const db = {
      mediaAsset: {
        findUnique: async () => ({ id: 'doc-1', kind: 'document', objectKey: 'quarantine/doc-1/abc.pdf', status: 'quarantined', variants: [] }),
        update: async () => {
          updated = true;
        },
      },
    };
    expect(await processMediaAsset({ eventId: 'e', mediaId: 'doc-1' }, { db: db as never, storage, randomKey: () => 'k' })).toBe('skipped');
    expect(updated).toBe(false);
    expect(storage.objects.size).toBe(0);
  });
});
