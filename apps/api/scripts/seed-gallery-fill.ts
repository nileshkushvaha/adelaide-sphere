/**
 * Tops every business listing in a demonstration database up to at least four
 * processed gallery photographs, and makes sure each has a share image
 * (SRS SEO 001).
 *
 * Photographs come through the same pipeline as every other seeder: a
 * licence-checked Wikimedia Commons search, an upload to quarantine with an
 * outbox event, and the worker's processing. A photograph already used
 * anywhere in the library is never chosen again, so galleries do not repeat
 * each other. The searches for a listing are, in order, its own hand-written
 * image searches, its trade's, and its category's, then its services by name.
 *
 * Existing photographs keep their order and cover; new ones are appended.
 * Re-running it is safe: each new photograph is stored under
 * `<slug>-g<n>.jpg`, and a listing that already has four is skipped.
 *
 *   pnpm --filter api exec tsx --env-file=.env scripts/seed-gallery-fill.ts
 *
 * The worker must be running (`pnpm dev:worker`).
 */
import { Redis } from 'ioredis';
import { CATEGORY_IMAGE_QUERIES, SEED_BUSINESSES } from './business-seed-content.js';
import { loadUsedTitles, usedTitles } from './seed-business-writer.js';
import { databaseName, db, searchCommons, sleep, uploadImage, waitUntilReady, type CommonsFile } from './seed-commons.js';
import { TRADES, TRADE_PARENTS } from './trade-seed-content.js';

const TARGET = 4;

/**
 * Commons files that pass the licence and "not artwork" checks but are still
 * not photographs of a working business: scanned book and catalogue pages,
 * museum collection objects and paintings. Checked against the title and the
 * description before a file is chosen.
 */
const NOT_A_BUSINESS_PHOTO = /\b(dpla|book no|\(page \d+\)|catalog(ue)?|museum|collection|painter|painting|portrait|engraving|chair seat|\bam \d{4}\b|\bch \d{6,}\b|19th century|18\d\d|17\d\d|article|newspaper|daily news|earth room)\b/i;

function queriesFor(business: { slug: string; primaryCategory: { slug: string; name: string; parent: { slug: string } | null }; services: { service: { name: string } }[] }): string[] {
  const category = business.primaryCategory;
  const own = SEED_BUSINESSES.find((seed) => seed.slug === business.slug)?.images ?? [];
  const trade = TRADES.find((entry) => entry.slug === category.slug)?.imageQueries ?? [];
  const parent = category.parent ? (TRADE_PARENTS.find((entry) => entry.slug === category.parent!.slug)?.imageQueries ?? []) : [];
  const categoryQuery = CATEGORY_IMAGE_QUERIES[category.slug] ?? (category.parent ? CATEGORY_IMAGE_QUERIES[category.parent.slug] : undefined);
  const services = business.services.map((entry) => `${entry.service.name} ${category.name}`.toLowerCase());
  return [...new Set([...own, ...trade, ...(categoryQuery ? [categoryQuery] : []), ...services, category.name.toLowerCase(), ...parent])];
}

/** Up to `count` unused files, one per query where possible so a gallery shows different subjects. */
async function findFiles(queries: string[], count: number): Promise<CommonsFile[]> {
  const found: CommonsFile[] = [];
  for (const passSize of [1, 3]) {
    for (const query of queries) {
      if (found.length >= count) return found;
      const words = query.split(' ');
      // The query as written, then shorter, down to two words (or one for a single-word query).
      for (let length = words.length; length >= Math.min(2, words.length); length -= 1) {
        let files: CommonsFile[];
        try {
          files = (await searchCommons(words.slice(0, length).join(' '), passSize + 2, usedTitles)).filter((file) => !NOT_A_BUSINESS_PHOTO.test(`${file.title} ${file.description}`));
        } catch (error) {
          // A dropped connection to Commons skips this search rather than ending the run.
          console.log(`  search failed (${(error as Error).message}); skipped`);
          await sleep(5_000);
          continue;
        }
        await sleep(500);
        if (files.length === 0) continue;
        for (const file of files) {
          if (found.length >= count) break;
          usedTitles.add(file.title);
          found.push(file);
        }
        break;
      }
    }
  }
  return found;
}

async function main(): Promise<void> {
  console.log(`Topping galleries up to ${TARGET} in ${databaseName}\n`);
  await loadUsedTitles();

  const businesses = await db.business.findMany({
    orderBy: { slug: 'asc' },
    select: {
      id: true,
      slug: true,
      name: true,
      ogImageMediaId: true,
      primaryCategory: { select: { slug: true, name: true, parent: { select: { slug: true } } } },
      services: { select: { service: { select: { name: true } } } },
      media: { orderBy: { sortOrder: 'asc' }, select: { mediaId: true, sortOrder: true, media: { select: { status: true } } } },
    },
  });

  let toppedUp = 0;
  let stillShort = 0;
  for (const business of businesses) {
    const ready = business.media.filter((entry) => entry.media.status === 'ready');
    const missing = TARGET - ready.length;
    if (missing <= 0) continue;

    console.log(`${business.name} — has ${ready.length}, needs ${missing}`);
    // Resume: photographs a previous run uploaded for this listing but did not attach.
    const earlier = await db.mediaAsset.findMany({
      where: { sourceName: { startsWith: `${business.slug}-g` }, status: { in: ['ready', 'quarantined'] }, businesses: { none: { businessId: business.id } } },
      select: { id: true },
      orderBy: { sourceName: 'asc' },
      take: missing,
    });
    const ids = earlier.map((row) => row.id);
    let files: CommonsFile[] = [];
    try {
      files = ids.length < missing ? await findFiles(queriesFor(business), missing - ids.length) : [];
    } catch (error) {
      console.log(`  searching failed (${(error as Error).message}); left for the next run`);
    }
    for (const file of files) {
      const index = (await db.mediaAsset.count({ where: { sourceName: { startsWith: `${business.slug}-g` } } })) + 1;
      try {
        ids.push(
          await uploadImage({
            file,
            sourceName: `${business.slug}-g${index}.jpg`,
            alt: (file.description || file.title.replace(/^File:|\.\w+$/g, '')).slice(0, 240),
            // `credit` is VARCHAR(255); some Commons artist fields are far longer.
            credit: (file.artist ? `${file.artist} via Wikimedia Commons` : 'Wikimedia Commons').slice(0, 255),
            rightsNote: `${file.licence} — ${file.pageUrl}`,
          }),
        );
      } catch (error) {
        // The first line is enough to act on; Prisma's full invocation text is not.
        console.log(`  upload failed: ${String((error as Error).message).split('\n').map((line) => line.trim()).filter(Boolean).at(-1)}`);
      }
      await sleep(800);
    }
    if (ids.length === 0) {
      console.log('  nothing usable found');
      stillShort += 1;
      continue;
    }
    try {
      await waitUntilReady(ids);
    } catch (error) {
      console.log(`  ${(error as Error).message.trim()}`);
    }

    const processed = await db.mediaAsset.findMany({ where: { id: { in: ids }, status: 'ready' }, select: { id: true } });
    let next = Math.max(-1, ...business.media.map((entry) => entry.sortOrder)) + 1;
    for (const { id } of processed) {
      await db.businessMedia.upsert({
        where: { businessId_mediaId: { businessId: business.id, mediaId: id } },
        update: {},
        create: { businessId: business.id, mediaId: id, sortOrder: next, isCover: next === 0 },
      });
      next += 1;
    }
    const total = ready.length + processed.length;
    console.log(`  now ${total}`);
    if (total >= TARGET) toppedUp += 1;
    else stillShort += 1;
  }

  // A share image for every listing: its own choice if set and processed, otherwise its cover.
  let shareImages = 0;
  for (const business of await db.business.findMany({
    select: { id: true, ogImage: { select: { status: true } }, media: { where: { media: { status: 'ready' } }, orderBy: { sortOrder: 'asc' }, take: 1, select: { mediaId: true } } },
  })) {
    if (business.ogImage?.status === 'ready' || !business.media[0]) continue;
    await db.business.update({ where: { id: business.id }, data: { ogImageMediaId: business.media[0].mediaId, version: { increment: 1 } } });
    shareImages += 1;
  }

  const url = process.env.REDIS_URL;
  if (url) {
    const redis = new Redis(url, { keyPrefix: 'ms:', lazyConnect: true, maxRetriesPerRequest: 1 });
    try {
      await redis.connect();
      await redis.incr('cache:public:ns');
    } catch {
      console.log('Redis unreachable; cached reads expire within five minutes');
    } finally {
      redis.disconnect();
    }
  }

  console.log(`\nDone. ${toppedUp} listing(s) topped up to ${TARGET}; ${stillShort} still short; ${shareImages} share image(s) set.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
