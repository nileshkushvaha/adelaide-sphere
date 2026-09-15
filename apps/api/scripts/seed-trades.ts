/**
 * Fills the directory out to a realistic size: forty-odd trade categories,
 * each with at least four published listings and its own photograph.
 *
 * A directory with twenty listings cannot be judged. Search returns
 * everything, pagination never appears, a category page is a short list and
 * the facet counts are all one. This creates enough of a tail that those
 * screens behave the way they will in use — while staying demonstration
 * content, on the same terms as the rest: invented businesses, ACMA's
 * reserved phone range, real Inner Adelaide suburbs.
 *
 * Photographs come from one pool per category rather than a search per
 * listing: four plumbers want four different pictures of plumbing, and one
 * search answers that better than four identical ones. Where Commons has
 * fewer permissively-licensed pictures of a trade than the category needs,
 * the listings that miss out show the site's own branded panel — which is
 * what a real listing without a photograph shows.
 *
 * Re-running is safe: categories and listings are matched on slug and skipped
 * if they are already there.
 *
 *   pnpm --filter api exec tsx --env-file=.env scripts/seed-trades.ts
 */
import { databaseName, db, searchCommons, sleep, uploadImage, waitUntilReady } from './seed-commons.js';
import { attachMedia, createBusiness, ensureServices, loadUsedTitles, slugify, usedTitles } from './seed-business-writer.js';
import { TRADES, TRADE_PARENTS, tradeBusinesses } from './trade-seed-content.js';

/** Where the trade listings' phone numbers start, after the hand-written ones. */
const PHONE_BASE = 2000;

/**
 * Finds and uploads up to `target` different photographs for one category,
 * spread across its subjects so the pool is not four angles on one thing.
 * A short pool is a fact about Commons, not an error: the caller hands out
 * what there is.
 */
async function imagePool(slug: string, queries: string[], target: number): Promise<{ id: string }[]> {
  // `--no-images` creates the listings and leaves the photographs for later.
  // Commons is a volunteer archive, and once it starts asking for two-minute
  // waits the courteous thing — and the quick thing — is to stop asking and
  // come back another day. A listing with no photograph shows the site's own
  // branded panel, which is what a real listing without one shows; a later run
  // fills the gaps, because everything here is matched on slug.
  if (process.argv.includes('--no-images')) return [];
  const existing = await db.mediaAsset.findMany({ where: { sourceName: { startsWith: `trade-${slug}-` }, status: { in: ['ready', 'quarantined'] } }, select: { id: true }, orderBy: { sourceName: 'asc' } });
  if (existing.length >= target) return existing;

  const wantedPerQuery = Math.ceil(target / queries.length);
  const found: { title: string; file: Awaited<ReturnType<typeof searchCommons>>[number] }[] = [];
  for (const query of queries) {
    if (found.length >= target) break;
    for (const file of await searchCommons(query, wantedPerQuery, usedTitles)) {
      if (found.some((entry) => entry.title === file.title)) continue;
      // Claimed as soon as it is chosen, so the next category cannot take it.
      usedTitles.add(file.title);
      found.push({ title: file.title, file });
    }
    await sleep(400);
  }

  const pool = [...existing];
  for (const [index, entry] of found.entries()) {
    if (pool.length >= target) break;
    try {
      const id = await uploadImage({
        file: entry.file,
        sourceName: `trade-${slug}-${existing.length + index + 1}.jpg`,
        alt: (entry.file.description || entry.file.title.replace(/^File:|\.\w+$/g, '')).slice(0, 240),
        credit: entry.file.artist ? `${entry.file.artist} via Wikimedia Commons` : 'Wikimedia Commons',
        rightsNote: `${entry.file.licence} — ${entry.file.pageUrl}`,
      });
      pool.push({ id });
    } catch (error) {
      // One file Commons would not hand over is one photograph fewer, not a
      // failed run: the listing falls back to the site's branded panel, and a
      // later run picks up where this one left off.
      console.log(`    skipped a photograph: ${(error as Error).message.slice(0, 90)}`);
    }
    // Deliberately unhurried. Several hundred files in a sitting is what
    // triggers the limit, and a seeder has nowhere to be.
    await sleep(2000);
  }
  if (pool.length > 0) await waitUntilReady(pool.map((image) => image.id));
  return pool;
}

/**
 * Rewrites the description of every trade listing to what the vocabulary
 * produces now.
 *
 * Separate, and opt-in with `--refresh-copy`, because it overwrites text: for
 * seeded copy that is the point, but it must never happen as a side effect of
 * a run somebody started to add a category.
 */
async function refreshCopy(): Promise<number> {
  let changed = 0;
  for (const [index, trade] of TRADES.entries()) {
    for (const seed of tradeBusinesses(trade, PHONE_BASE + index * 10)) {
      const current = await db.business.findUnique({ where: { slug: seed.slug }, select: { id: true, description: true } });
      if (!current || current.description === seed.description) continue;
      await db.business.update({ where: { id: current.id }, data: { description: seed.description, version: { increment: 1 } } });
      changed += 1;
    }
  }
  return changed;
}

/**
 * Finds a photograph for every trade listing and category that has none.
 *
 * Separate from the main run because it is the part that depends on someone
 * else's server: listings can be created in seconds, while a few hundred
 * photographs have to be asked for politely and slowly. Run it again after a
 * rate limit and it continues from wherever it stopped.
 */
async function fillImages(): Promise<void> {
  let added = 0;

  // The parents were created without a subject of their own, so they sat
  // pictureless while every trade under them had one.
  for (const parent of TRADE_PARENTS) {
    const row = await db.category.findUnique({ where: { slug: parent.slug }, select: { id: true, imageMediaId: true } });
    if (!row || row.imageMediaId) continue;
    console.log(`\n${parent.name} — a picture for the parent category`);
    const [image] = await imagePool(parent.slug, parent.imageQueries, 1);
    if (!image) {
      console.log('  nothing usable found');
      continue;
    }
    await db.category.update({ where: { id: row.id }, data: { imageMediaId: image.id, version: { increment: 1 } } });
  }
  for (const [index, trade] of TRADES.entries()) {
    const category = await db.category.findUnique({ where: { slug: trade.slug }, select: { id: true, imageMediaId: true } });
    if (!category) continue;
    const slugs = tradeBusinesses(trade, PHONE_BASE + index * 10).map((seed) => seed.slug);
    const rows = await db.business.findMany({ where: { slug: { in: slugs } }, select: { id: true, name: true, firstPublishedAt: true, _count: { select: { media: true } } } });
    const needy = rows.filter((row) => row._count.media === 0);
    const need = needy.length + (category.imageMediaId ? 0 : 1);
    if (need === 0) continue;

    console.log(`\n${trade.name} — ${need} photograph(s) wanted`);
    const pool = await imagePool(trade.slug, trade.imageQueries, need);
    let next = 0;
    if (!category.imageMediaId && pool[next]) {
      await db.category.update({ where: { id: category.id }, data: { imageMediaId: pool[next]!.id, version: { increment: 1 } } });
      next += 1;
    }
    for (const row of needy) {
      const image = pool[next];
      if (!image) break;
      await attachMedia(row.id, [image]);
      // Now that it has a picture it belongs on the site.
      await db.business.update({
        where: { id: row.id },
        data: { status: 'published', publishedAt: new Date(), firstPublishedAt: row.firstPublishedAt ?? new Date(), version: { increment: 1 } },
      });
      next += 1;
      added += 1;
      console.log(`  ${row.name}`);
    }
  }
  const waiting = await db.business.count({ where: { status: 'draft' } });
  console.log(`\nDone. ${added} listing(s) now have a photograph and are published; ${waiting} still waiting for one.`);
}

async function main(): Promise<void> {
  if (!process.argv.includes('--include-trade-listings')) {
    // User decision, 15 Sep 2026: the Adelaide demonstration directory keeps only the
    // twenty hand-written listings in business-seed-content.ts.
    console.log('Trade listings are not part of the Adelaide demonstration set. Pass --include-trade-listings to create them anyway.');
    return;
  }
  console.log(`Filling out the directory in ${databaseName}\n`);
  await loadUsedTitles();

  if (process.argv.includes('--fill-images')) {
    await fillImages();
    return;
  }

  if (process.argv.includes('--refresh-copy')) {
    const changed = await refreshCopy();
    console.log(`Done. ${changed} description(s) rewritten.`);
    return;
  }

  for (const parent of TRADE_PARENTS) {
    const existing = await db.category.findUnique({ where: { slug: parent.slug }, select: { id: true, description: true } });
    if (!existing) {
      await db.category.create({ data: { name: parent.name, slug: parent.slug, description: parent.description, active: true } });
      console.log(`  new parent category: ${parent.name}`);
    } else if (!existing.description) {
      await db.category.update({ where: { id: existing.id }, data: { description: parent.description, version: { increment: 1 } } });
    }
  }

  const services = await ensureServices();
  // Each trade brings services of its own — "Blocked drains", "Stump grinding" —
  // and a listing cannot offer one that is not in the taxonomy. The icon is
  // left unset: the shared library matches most of these from the name, and an
  // editor choosing one deliberately should be able to tell the difference.
  for (const name of new Set(TRADES.flatMap((trade) => trade.services))) {
    const slug = slugify(name);
    const row = await db.service.upsert({ where: { slug }, update: {}, create: { name, slug, active: true }, select: { id: true } });
    services.set(name, row.id);
  }
  console.log(`${services.size} services available`);
  const areas = new Map((await db.localArea.findMany({ where: { active: true }, select: { id: true, slug: true } })).map((row) => [row.slug, row.id]));

  let created = 0;
  for (const [tradeIndex, trade] of TRADES.entries()) {
    const parent = await db.category.findUnique({ where: { slug: trade.parent }, select: { id: true } });
    if (!parent) throw new Error(`${trade.slug}: no parent category "${trade.parent}"`);

    let category = await db.category.findUnique({ where: { slug: trade.slug }, select: { id: true, imageMediaId: true, parentId: true } });
    if (!category) {
      category = await db.category.create({
        data: { name: trade.name, slug: trade.slug, description: trade.description, parentId: parent.id, active: true },
        select: { id: true, imageMediaId: true, parentId: true },
      });
      console.log(`\n${trade.name} — new category`);
    } else {
      console.log(`\n${trade.name}`);
      // An existing category keeps its own parent: moving one silently would
      // change its breadcrumbs and what its page lists.
      if (category.parentId === null && trade.parent !== trade.slug) {
        await db.category.update({ where: { id: category.id }, data: { parentId: parent.id, version: { increment: 1 } } });
        console.log('  filed under ' + trade.parent);
      }
    }

    const wanted = tradeBusinesses(trade, PHONE_BASE + tradeIndex * 10);
    const missing: typeof wanted = [];
    for (const seed of wanted) {
      const taken = await db.business.findUnique({ where: { slug: seed.slug }, select: { id: true } });
      if (!taken) missing.push(seed);
    }
    if (missing.length === 0 && (category.imageMediaId || process.argv.includes('--no-images'))) {
      console.log('  already filled');
      continue;
    }

    // One for the category itself and one for each listing that is missing.
    // Two each would be nicer and is not worth it: Commons is a volunteer
    // archive being asked for several hundred files by a seeder, and a cover
    // photograph is what a card and a detail page actually need.
    const pool = await imagePool(trade.slug, trade.imageQueries, 1 + missing.length);
    if (pool.length === 0) console.log('  no photographs found for this trade');

    if (!category.imageMediaId && pool[0]) {
      await db.category.update({ where: { id: category.id }, data: { imageMediaId: pool[0].id, version: { increment: 1 } } });
    }

    const categories = new Map([[trade.slug, category.id]]);
    for (const [index, seed] of missing.entries()) {
      const mine = pool.slice(1 + index, 2 + index);
      await createBusiness(seed, services, categories, areas, mine);
      // A listing with no photograph does not go on the site. It is kept as a
      // draft instead of being thrown away: the copy, hours, services and
      // reviews are all written, and `--fill-images` publishes it the moment
      // it has a picture.
      if (mine.length === 0) await db.business.update({ where: { slug: seed.slug }, data: { status: 'draft', publishedAt: null } });
      created += 1;
    }
  }

  const published = await db.business.count({ where: { status: 'published' } });
  console.log(`\nDone. ${created} listing(s) added; ${published} published in total.`);
}

main()
  .catch((error: unknown) => {
    console.error('\n' + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
