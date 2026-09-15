/**
 * The pieces every demonstration seeder shares: the database guard, the
 * object-store client, and the Wikimedia Commons image pipeline — find a file,
 * check its licence, upload the original to quarantine, and wait for the
 * worker to publish the renditions. One pipeline, the API's own, rather than
 * a second one that would drift from it.
 */
import { createHash, randomBytes } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createDatabaseClient } from '@adelaide-sphere/database';
import { objectKeyFor } from '@adelaide-sphere/domain';

export const need = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const databaseUrl = need('DATABASE_URL');
export const databaseName = new URL(databaseUrl.replace(/^mysql:/, 'http:')).pathname.replace(/^\//, '');
// The SRS forbids sample content in production (CFG 002), and this is sample content.
if (!/(_dev|_test|_e2e)$/.test(databaseName)) {
  throw new Error(`Refusing to seed "${databaseName}": demonstration content belongs only in a database named *_dev, *_test or *_e2e`);
}

export const db = createDatabaseClient({ url: databaseUrl, allowPublicKeyRetrieval: process.env.DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL === 'true' });

const s3 = new S3Client({
  region: process.env.MEDIA_S3_REGION ?? 'us-east-1',
  endpoint: need('MEDIA_S3_ENDPOINT'),
  forcePathStyle: true,
  credentials: { accessKeyId: need('MEDIA_S3_ACCESS_KEY_ID'), secretAccessKey: need('MEDIA_S3_SECRET_ACCESS_KEY') },
});
const quarantineBucket = process.env.MEDIA_QUARANTINE_BUCKET ?? 'adelaide-sphere-quarantine';

/** Licences a seeder will use: public domain, CC0, attribution and
 *  attribution-share-alike (user decision, 15 Sep 2026 — the same terms as the
 *  Adelaide hero and About photography). Every asset stores its credit and
 *  licence; non-commercial and no-derivatives files are never used. */
export const PERMITTED_LICENCE = /^(cc0|public domain|cc by(-sa)? (2\.0|2\.5|3\.0|4\.0))/i;

const COMMONS_AGENT = 'AdelaideSphere-dev-seed/1.0 (development content seeding)';

/** Words that appear in a query without naming its subject. */
const GENERIC = new Set(['photograph', 'photo', 'interior', 'shop', 'with', 'from', 'display', 'working', 'modern', 'small', 'fresh', 'evening', 'group', 'class', 'home', 'tools', 'table', 'counter', 'room']);
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Commons rate-limits anonymous downloads, and answers 429 once a few hundred
 * files have been pulled in a sitting. Backing off properly is the documented
 * way to behave, and the waits have to be long enough to be worth calling a
 * back-off: 3, 6, 9 seconds was still asking every few seconds, which is what
 * the limit exists to stop. This doubles instead, up to a minute, and honours
 * a `Retry-After` header when the server sends one.
 */
export async function fetchWithBackoff(url: string, attempts = 7): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(url, { headers: { 'User-Agent': COMMONS_AGENT } });
    if (response.ok) return response;
    if ((response.status !== 429 && response.status < 500) || attempt === attempts) return response;
    const askedFor = Number(response.headers.get('retry-after'));
    const wait = Number.isFinite(askedFor) && askedFor > 0 ? Math.min(askedFor * 1000, 120_000) : Math.min(5000 * 2 ** (attempt - 1), 60_000);
    console.log(`    ${response.status}; waiting ${Math.round(wait / 1000)}s`);
    await sleep(wait);
  }
}

interface CommonsInfo {
  url: string;
  thumburl?: string;
  descriptionurl?: string;
  mime?: string;
  width?: number;
  height?: number;
  extmetadata?: Record<string, { value?: string }>;
}

export interface CommonsFile {
  title: string;
  /** A scaled rendition's address, tracking parameters removed. */
  url: string;
  pageUrl: string;
  licence: string;
  /** The file's own description on Commons, as plain text. */
  description: string;
  artist: string;
}

/** Lower-cased with accents removed, so "café" and "cafe" are the same word. */
const fold = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');

const plain = (html: string | undefined): string =>
  (html ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Scans of engravings, prints and paintings are JPEGs too, and a public-domain
 * print of a plumber is on subject by every other test. A listing wants a
 * photograph, so anything Commons describes as artwork is left out.
 */
const ARTWORK = /\b(engraving|etching|lithograph|woodcut|print|drawing|painting|illustration|poster|sketch|map|diagram|logo|screenshot)\b/i;

function acceptable(info: CommonsInfo | undefined, minWidth: number, title: string): { licence: string } | null {
  if (!info?.url) return null;
  const licence = plain(info.extmetadata?.LicenseShortName?.value);
  if (!PERMITTED_LICENCE.test(licence)) return null;
  if (info.mime !== 'image/jpeg') return null;
  if ((info.width ?? 0) < minWidth) return null;
  const about = `${title} ${plain(info.extmetadata?.ImageDescription?.value)} ${plain(info.extmetadata?.Categories?.value)}`;
  if (ARTWORK.test(about)) return null;
  return { licence };
}

function toFile(title: string, info: CommonsInfo, licence: string): CommonsFile {
  // The tracking parameters Commons appends are dropped: they belong to its
  // analytics, not to the file.
  const download = new URL(info.thumburl ?? info.url);
  download.search = '';
  return {
    title,
    url: download.toString(),
    pageUrl: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
    licence,
    description: plain(info.extmetadata?.ImageDescription?.value),
    artist: plain(info.extmetadata?.Artist?.value),
  };
}

/**
 * Resolves a named Commons file, and refuses it unless the licence recorded on
 * Commons is one we may use. A note in a content file is documentation; this
 * is the check.
 */
export async function resolveCommonsFile(file: string, width = 2400): Promise<CommonsFile> {
  const api = new URL(COMMONS_API);
  // A scaled rendition, not the original: the largest variant we publish is
  // 1600px wide, so pulling a 20 MB original would be wasteful and is what
  // Commons throttles.
  api.search = new URLSearchParams({ action: 'query', format: 'json', titles: file, prop: 'imageinfo', iiprop: 'url|extmetadata|mime|size', iiurlwidth: String(width) }).toString();
  const response = await fetchWithBackoff(api.toString());
  if (!response.ok) throw new Error(`Commons lookup failed for ${file}: ${response.status}`);
  const body = (await response.json()) as { query?: { pages?: Record<string, { title: string; imageinfo?: CommonsInfo[] }> } };
  const page = Object.values(body.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info?.url) throw new Error(`Commons has no file named ${file}`);
  const licence = plain(info.extmetadata?.LicenseShortName?.value);
  if (!PERMITTED_LICENCE.test(licence)) throw new Error(`${file} is licensed "${licence}", which this seeder will not use`);
  return toFile(page!.title, info, licence);
}

/**
 * Finds photographs matching a query, keeping only JPEGs at least `minWidth`
 * wide under a permitted licence, and skipping any title in `exclude` so two
 * listings never share a picture. Returns at most `count` files, best match
 * first. An empty result is the caller's decision to make, not an error.
 */
export async function searchCommons(query: string, count: number, exclude: Set<string>, minWidth = 1200, width = 1600): Promise<CommonsFile[]> {
  const api = new URL(COMMONS_API);
  api.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: `${query} filetype:bitmap`,
    gsrlimit: '40',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|mime|size',
    iiurlwidth: String(width),
  }).toString();
  const response = await fetchWithBackoff(api.toString());
  if (!response.ok) throw new Error(`Commons search failed for "${query}": ${response.status}`);
  const body = (await response.json()) as { query?: { pages?: Record<string, { title: string; index?: number; imageinfo?: CommonsInfo[] }> } };
  const pages = Object.values(body.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  // Full-text search ranks loosely — "cafe interior" returns the café car of
  // a Spanish train — so a file is kept only when its title or description
  // actually names one of the subjects asked for.
  const subjects = fold(query)
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 3 && !GENERIC.has(word));
  // A subject named in the title outranks one mentioned somewhere in the
  // description: "Warm cup of coffee at a cafe.jpg" is a café; a photograph of
  // a building whose description mentions its café is not.
  const scored: { file: CommonsFile; score: number; index: number }[] = [];
  for (const [index, page] of pages.entries()) {
    if (exclude.has(page.title)) continue;
    const info = page.imageinfo?.[0];
    const ok = acceptable(info, minWidth, page.title);
    if (!ok) continue;
    const file = toFile(page.title, info!, ok.licence);
    const title = fold(file.title);
    const description = fold(file.description);
    const inTitle = subjects.filter((word) => title.includes(word)).length;
    const inDescription = subjects.filter((word) => description.includes(word)).length;
    const score = subjects.length === 0 ? 1 : inTitle * 2 + Math.min(inDescription, 1);
    if (score === 0) continue;
    scored.push({ file, score, index });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, count)
    .map((entry) => entry.file);
}

export interface UploadInput {
  file: CommonsFile;
  /** The name the asset is stored under; also how a re-run recognises it. */
  sourceName: string;
  alt: string;
  credit: string;
  rightsNote: string;
}

/**
 * Puts image bytes through the pipeline the upload endpoint uses: the original
 * into the quarantine bucket, a row in the library, and an outbox event for the
 * worker to make the renditions from. Whether the bytes came from Commons or
 * were drawn here makes no difference to any of that.
 */
export async function uploadBytes(input: { bytes: Buffer; mimeType: string; extension: string; sourceName: string; alt: string; credit: string; rightsNote: string }): Promise<string> {
  const already = await db.mediaAsset.findFirst({ where: { sourceName: input.sourceName, status: { in: ['ready', 'quarantined'] } }, select: { id: true } });
  if (already) {
    console.log(`  reusing        ${input.sourceName}`);
    return already.id;
  }
  const objectKey = objectKeyFor('quarantine', randomBytes(8).toString('hex'), input.extension, randomBytes(12).toString('hex'));
  await s3.send(new PutObjectCommand({ Bucket: quarantineBucket, Key: objectKey, Body: input.bytes, ContentType: input.mimeType }));
  const asset = await db.$transaction(async (tx) => {
    const row = await tx.mediaAsset.create({
      data: {
        sourceName: input.sourceName,
        mimeType: input.mimeType,
        bytes: input.bytes.byteLength,
        checksum: createHash('sha256').update(input.bytes).digest('hex'),
        objectKey,
        status: 'quarantined',
        altText: input.alt,
        credit: input.credit,
        rightsNote: input.rightsNote,
      },
      select: { id: true, version: true },
    });
    await tx.outboxEvent.create({
      data: { type: 'media.uploaded', resourceType: 'media_asset', resourceId: row.id, resourceVersion: row.version, payload: { mediaId: row.id } },
    });
    return row;
  });
  return asset.id;
}

/** Uploads one photograph and asks the worker to process it, as the API does. */
export async function uploadImage({ file, sourceName, alt, credit, rightsNote }: UploadInput): Promise<string> {
  const already = await db.mediaAsset.findFirst({ where: { sourceName, status: { in: ['ready', 'quarantined'] } }, select: { id: true } });
  if (already) {
    console.log(`  reusing        ${sourceName}`);
    return already.id;
  }
  console.log(`  ${file.licence.padEnd(14)} ${file.title}`);
  const response = await fetchWithBackoff(file.url);
  if (!response.ok) throw new Error(`Could not download ${file.url}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
  const objectKey = objectKeyFor('quarantine', randomBytes(8).toString('hex'), 'jpg', randomBytes(12).toString('hex'));

  await s3.send(new PutObjectCommand({ Bucket: quarantineBucket, Key: objectKey, Body: bytes, ContentType: mimeType }));

  const asset = await db.$transaction(async (tx) => {
    const row = await tx.mediaAsset.create({
      data: {
        sourceName,
        mimeType,
        bytes: bytes.byteLength,
        checksum: createHash('sha256').update(bytes).digest('hex'),
        objectKey,
        status: 'quarantined',
        altText: alt,
        credit,
        rightsNote,
      },
      select: { id: true, version: true },
    });
    // The same event the upload endpoint writes; the dispatcher turns it into
    // the worker's media job.
    await tx.outboxEvent.create({
      data: { type: 'media.uploaded', resourceType: 'media_asset', resourceId: row.id, resourceVersion: row.version, payload: { mediaId: row.id } },
    });
    return row;
  });
  return asset.id;
}

/** Waits for the worker to publish the renditions, so records never reference an unprocessed image. */
export async function waitUntilReady(ids: string[], timeoutMs = 300_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = await db.mediaAsset.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, rejectionReason: true } });
    const rejected = rows.filter((row) => row.status === 'rejected');
    if (rejected.length > 0) throw new Error(`Image processing refused ${rejected.length} file(s): ${rejected.map((r) => r.rejectionReason).join('; ')}`);
    const ready = rows.filter((row) => row.status === 'ready').length;
    process.stdout.write(`\r  processed ${ready}/${ids.length}`);
    if (ready === ids.length) return void process.stdout.write('\n');
    if (Date.now() > deadline) {
      throw new Error('\nImage processing did not finish. Is the worker running? Start it with: pnpm dev:worker');
    }
    await sleep(1500);
  }
}
