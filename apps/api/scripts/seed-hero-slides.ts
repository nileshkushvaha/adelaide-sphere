/**
 * Adds the two licensed Adelaide photographs recorded in
 * `docs/content/hero-photography.md` to the media library and saves them as
 * the Home banner slides, so the home page banner comes from the database and
 * is managed in Configuration → Home page settings (SRS HERO 002).
 *
 * The same two photographs are bundled with the web app
 * (`apps/web/public/hero/`, `apps/web/src/lib/hero-assets.ts`) as pre-cropped
 * WebP files; those stay as the fallback the site shows only when no slide is
 * configured (client instruction, 13 Sep 2026). This script imports the
 * Commons originals instead, so the media library holds its own variants and
 * the stored credit and rights note come from Commons itself.
 *
 * Each photograph is named by its exact Wikimedia Commons file name and goes
 * through the normal pipeline: the licence check in `resolveCommonsFile`
 * (public domain, CC0, CC BY or CC BY-SA; both files are CC BY-SA, so the
 * credit is kept with the asset), an upload to quarantine with an outbox event,
 * and the worker's processing. A photograph that comes out portrait is
 * reported and left out, because a banner is wide. Slides are added only while
 * the banner holds nothing but this script's own photographs (topping it up to
 * the ones listed), so an administrator's own choice is never overwritten.
 * Re-running is safe: assets are matched on their stored name.
 *
 *   pnpm --filter api exec tsx --env-file=.env scripts/seed-hero-slides.ts
 *
 * The worker must be running (`pnpm dev:worker`).
 */
import { Redis } from 'ioredis';
import { DEFAULT_HOME_SETTINGS, HOME_SETTINGS_KEY, validateHomeSettings } from '../src/settings/home-settings.js';
import { databaseName, db, resolveCommonsFile, sleep, uploadImage, waitUntilReady } from './seed-commons.js';

/**
 * Alt text and captions match the bundled fallback slides
 * (`apps/web/src/lib/hero-assets.ts`): they describe what the banner shows,
 * not what the uploader wrote. The author and licence are stored as the
 * asset's credit and rights note, read from Commons at import time.
 */
const PHOTOS = [
  {
    name: 'adelaide-river-torrens',
    // Yu Chu Chin, CC BY-SA 4.0
    file: 'File:Adelaide CBD skyline across the River Torrens, July 2026 (028A8462).jpg',
    alt: 'The Adelaide city skyline and Festival Centre reflected in the River Torrens on a clear afternoon',
    caption: 'River Torrens',
    focalX: 0.45,
    focalY: 0.45,
  },
  {
    name: 'adelaide-oval-footbridge',
    // Luke Anderson, CC BY-SA 2.0
    file: 'File:Adelaide Oval Footbridge.jpg',
    alt: 'The Adelaide Oval footbridge lit at night over the River Torrens, with the Oval glowing behind',
    caption: 'Adelaide Oval footbridge',
    focalX: 0.55,
    focalY: 0.55,
  },
] as const;

async function main(): Promise<void> {
  console.log(`Home banner photographs in ${databaseName}\n`);

  const uploaded: { id: string; photo: (typeof PHOTOS)[number] }[] = [];
  for (const photo of PHOTOS) {
    try {
      const file = await resolveCommonsFile(photo.file, 2560);
      const credit = (file.artist ? `${file.artist} via Wikimedia Commons` : 'Wikimedia Commons').slice(0, 255);
      const id = await uploadImage({ file, sourceName: `home-hero-${photo.name}.jpg`, alt: photo.alt, credit, rightsNote: `${file.licence} — ${file.pageUrl}` });
      uploaded.push({ id, photo });
    } catch (error) {
      console.log(`  ${photo.name}: ${(error as Error).message}; left out`);
    }
    await sleep(1_000);
  }
  if (uploaded.length === 0) throw new Error('No banner photograph could be added');
  await waitUntilReady(uploaded.map((entry) => entry.id));

  // A banner is wide: a portrait photograph would be cropped to a sliver.
  const usable: typeof uploaded = [];
  for (const entry of uploaded) {
    const hero = await db.mediaVariant.findFirst({ where: { assetId: entry.id, kind: 'hero' }, select: { width: true, height: true } });
    if (hero && hero.width > hero.height) usable.push(entry);
    else console.log(`  ${entry.photo.name}: not landscape (${hero?.width}×${hero?.height}); left out`);
  }

  const row = await db.setting.findUnique({ where: { group_key: { group: 'website', key: HOME_SETTINGS_KEY } } });
  const current = row ? validateHomeSettings(row.data) : null;
  if (current && Object.keys(current.errors).length > 0) throw new Error(`Stored home settings do not validate: ${JSON.stringify(current.errors)}`);
  const existing = current?.value.heroSlides ?? [];
  // Slides this script added earlier may be topped up; anything an
  // administrator chose is left exactly as it is.
  const ours = new Set(usable.map((entry) => entry.id));
  if (existing.some((slide) => !ours.has(slide.mediaId))) {
    console.log(`\nThe banner has slides an administrator chose (${existing.length}); left as they are.`);
    return;
  }
  const kept = new Set(existing.map((slide) => slide.mediaId));
  const additions = usable.filter((entry) => !kept.has(entry.id)).map(({ id, photo }) => ({ mediaId: id, caption: photo.caption, focalX: photo.focalX, focalY: photo.focalY }));
  if (additions.length === 0) {
    console.log(`\nThe banner already has all ${existing.length} slide(s); nothing to add.`);
    return;
  }

  const base = current?.value ?? DEFAULT_HOME_SETTINGS;
  const next = validateHomeSettings({ ...base, heroSlides: [...existing, ...additions] });
  if (Object.keys(next.errors).length > 0) throw new Error(`New home settings do not validate: ${JSON.stringify(next.errors)}`);
  const data = JSON.parse(JSON.stringify(next.value));
  if (row) await db.setting.update({ where: { group_key: { group: 'website', key: HOME_SETTINGS_KEY } }, data: { data, version: { increment: 1 } } });
  else await db.setting.create({ data: { group: 'website', key: HOME_SETTINGS_KEY, data, version: 1 } });
  console.log(`\nSaved ${next.value.heroSlides.length} banner slide(s): ${next.value.heroSlides.map((slide) => slide.caption).join(', ')}.`);

  const url = process.env.REDIS_URL;
  if (!url) return;
  const redis = new Redis(url, { keyPrefix: 'as:', lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    await redis.incr('cache:public:ns');
    console.log('API read cache retired; the web tier refreshes within a minute.');
  } catch {
    console.log('Redis unreachable; cached reads expire within five minutes.');
  } finally {
    redis.disconnect();
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
