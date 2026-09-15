/**
 * Loads the demonstration listings in `business-seed-content.ts` into a
 * development database — twenty fictional Adelaide businesses with their
 * services, hours, addresses, contact routes, social links, photographs and
 * approved reviews — and fills in the listings that were already there with
 * little more than a name.
 *
 * It follows the same rules as the blog seeder: it refuses any database not
 * named *_dev, *_test or *_e2e, and it does not process images itself. Each
 * photograph is uploaded to quarantine with an outbox event, exactly as the
 * upload endpoint does, and the worker publishes the renditions.
 *
 * Reviews are written the way the API writes them — the address encrypted
 * with the business id as associated data, the keyed hash the API would
 * compute, the terms version acknowledged — and then approved, with the
 * rating aggregate the public card reads updated to match.
 *
 * Re-running it is safe: businesses are matched on slug, images on their
 * stored name, and a listing that already has photographs, hours, links or
 * reviews keeps them.
 *
 *   pnpm --filter api exec tsx --env-file=.env scripts/seed-businesses.ts
 */
import { normalisePhone } from '../src/directory/business-rules.js';
import { CATEGORY_IMAGE_QUERIES, SEED_BUSINESSES, SEED_ENRICHMENT } from './business-seed-content.js';
import { databaseName, db, waitUntilReady } from './seed-commons.js';
import { attachMedia, createBusiness, ensureServices, enquiryAddress, ELIGIBILITY_SOURCE, encryption, findImages, intervals, loadUsedTitles, RIGHTS_NOTE, usedTitles, writeReviews } from './seed-business-writer.js';

/** Fills in an existing listing; keeps anything an editor has already written. */
async function enrichBusiness(slug: string, seed: (typeof SEED_ENRICHMENT)[string], services: Map<string, string>): Promise<void> {
  const current = await db.business.findUnique({
    where: { slug },
    include: { address: true, _count: { select: { media: true, openingHours: true, links: true, reviews: true, services: true } } },
  });
  if (!current) {
    console.log(`\n${slug}: not in this database; skipped`);
    return;
  }
  console.log(`\n${current.name} (existing)`);
  const data: Record<string, unknown> = {};
  if (current.description.trim().length < 200) data.description = seed.description;
  if (current.establishedYear === null) data.establishedYear = seed.established;
  if (!current.publicPhone && seed.phone) {
    data.publicPhone = seed.phone;
    data.normalizedPhone = normalisePhone(seed.phone);
  }
  if (!current.publicEmail && seed.email) data.publicEmail = seed.email;
  if (!current.publicUrl && seed.website) data.publicUrl = seed.website;
  if (!current.privateEnquiryEmailEncrypted) data.privateEnquiryEmailEncrypted = encryption.encrypt(enquiryAddress(seed.website ?? current.publicUrl ?? `https://${slug}.com.au`), current.id);
  if (current._count.openingHours === 0) {
    data.hoursMode = 'scheduled';
    data.openingHours = { create: intervals(seed.hours) };
  }
  if (current._count.links === 0) data.links = { create: seed.links.map((link, sortOrder) => ({ kind: link.kind, url: link.url, sortOrder })) };
  if (!current.address && seed.address) {
    data.address = { create: { line1: seed.address.line1, line2: seed.address.line2 ?? null, suburb: seed.address.suburb, postcode: seed.address.postcode, latitude: seed.address.lat, longitude: seed.address.lng } };
  }
  if (!current.eligibilityVerifiedAt) {
    data.eligibilityVerifiedAt = new Date();
    data.eligibilitySource = ELIGIBILITY_SOURCE;
  }
  if (!current.contentRightsReviewedAt) {
    data.contentRightsReviewedAt = new Date();
    data.contentRightsNote = RIGHTS_NOTE;
  }
  if (current._count.services < seed.services.length) {
    const wanted = seed.services.map((name) => {
      const id = services.get(name);
      if (!id) throw new Error(`${slug}: no service "${name}"`);
      return id;
    });
    const held = new Set((await db.businessService.findMany({ where: { businessId: current.id }, select: { serviceId: true } })).map((row) => row.serviceId));
    data.services = { create: wanted.filter((id) => !held.has(id)).map((serviceId) => ({ serviceId })) };
  }
  if (Object.keys(data).length > 0) {
    await db.business.update({ where: { id: current.id }, data: { ...data, version: { increment: 1 } } });
  }

  if (current._count.media === 0) {
    const images = await findImages(slug, seed.images);
    if (images.length > 0) {
      await waitUntilReady(images.map((image) => image.id));
      await attachMedia(current.id, images);
    }
  }
  if (current._count.reviews === 0) await writeReviews(current.id, seed.reviews);
  console.log(`  filled in: ${Object.keys(data).join(', ') || 'nothing missing'}`);
}

/**
 * `--reimage slug,slug`: forget the photographs chosen for those listings and
 * choose again. For when a search picked something on subject but wrong —
 * the media rows go, the objects stay in the dev store for the retention task.
 */
async function forgetImages(slugs: string[]): Promise<void> {
  for (const slug of slugs) {
    const assets = await db.mediaAsset.findMany({ where: { sourceName: { startsWith: `${slug}-` } }, select: { id: true } });
    await db.businessMedia.deleteMany({ where: { mediaId: { in: assets.map((a) => a.id) } } });
    await db.mediaAsset.deleteMany({ where: { id: { in: assets.map((a) => a.id) } } });
    console.log(`forgot ${assets.length} photograph(s) for ${slug}`);
  }
}

async function reimage(slugs: string[]): Promise<void> {
  const known = new Map([...SEED_BUSINESSES.map((b) => [b.slug, b.images] as const), ...Object.entries(SEED_ENRICHMENT).map(([slug, seed]) => [slug, seed.images] as const)]);
  await forgetImages(slugs);
  for (const slug of slugs) {
    const business = await db.business.findUnique({ where: { slug }, select: { id: true, name: true } });
    const queries = known.get(slug);
    if (!business || !queries) throw new Error(`${slug}: not a seeded listing`);
    console.log(`\n${business.name}`);
    const images = await findImages(slug, queries);
    if (images.length > 0) {
      await waitUntilReady(images.map((image) => image.id));
      await attachMedia(business.id, images);
    }
  }
}

/**
 * Gives every active category a picture, where it has none. A category an
 * editor has already illustrated is left alone: this fills gaps, it does not
 * replace choices.
 */
async function seedCategoryImages(): Promise<void> {
  const categories = await db.category.findMany({ where: { active: true, imageMediaId: null }, select: { id: true, name: true, slug: true } });
  if (categories.length === 0) {
    console.log('\nEvery category already has a picture.');
    return;
  }
  console.log(`\nFinding a picture for ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}…`);
  for (const category of categories) {
    const query = CATEGORY_IMAGE_QUERIES[category.slug] ?? category.name;
    const [image] = await findImages(`category-${category.slug}`, [query]);
    if (!image) {
      console.log(`  no picture found for ${category.name}`);
      continue;
    }
    await waitUntilReady([image.id]);
    await db.category.update({ where: { id: category.id }, data: { imageMediaId: image.id, version: { increment: 1 } } });
    console.log(`  ${category.name}`);
  }
}

async function main(): Promise<void> {
  console.log(`Seeding demonstration listings into ${databaseName}\n`);

  const flag = process.argv.indexOf('--reimage');
  if (flag !== -1) {
    const slugs = (process.argv[flag + 1] ?? '').split(',').filter(Boolean);
    if (slugs.length === 0) throw new Error('--reimage needs a comma-separated list of slugs');
    // Titles in use by every other record stay excluded.
    await loadUsedTitles();
    await reimage(slugs);
    return;
  }

  const services = await ensureServices();
  const categories = new Map((await db.category.findMany({ where: { active: true }, select: { id: true, slug: true } })).map((row) => [row.slug, row.id]));
  const areas = new Map((await db.localArea.findMany({ where: { active: true }, select: { id: true, slug: true } })).map((row) => [row.slug, row.id]));
  console.log(`${services.size} services, ${categories.size} categories, ${areas.size} local areas`);

  // Titles already used by earlier runs, so a re-run does not hand a second
  // record a picture the first one has.
  await loadUsedTitles();

  for (const [slug, seed] of Object.entries(SEED_ENRICHMENT)) await enrichBusiness(slug, seed, services);

  const existing = new Set((await db.business.findMany({ where: { slug: { in: SEED_BUSINESSES.map((b) => b.slug) } }, select: { slug: true } })).map((b) => b.slug));
  const wanted = SEED_BUSINESSES.filter((seed) => !existing.has(seed.slug));
  console.log(`\n${wanted.length} new listing(s) to create; ${existing.size} already present`);
  for (const seed of wanted) await createBusiness(seed, services, categories, areas);

  // Listings created by an earlier version of this script have every other
  // detail but no enquiry inbox or establishment year; fill those in.
  for (const seed of SEED_BUSINESSES) {
    const row = await db.business.findUnique({ where: { slug: seed.slug }, select: { id: true, privateEnquiryEmailEncrypted: true, establishedYear: true } });
    if (!row) continue;
    const data: { privateEnquiryEmailEncrypted?: string; establishedYear?: number } = {};
    if (!row.privateEnquiryEmailEncrypted) data.privateEnquiryEmailEncrypted = encryption.encrypt(enquiryAddress(seed.website), row.id);
    if (row.establishedYear === null) data.establishedYear = seed.established;
    if (Object.keys(data).length > 0) {
      await db.business.update({ where: { id: row.id }, data });
      console.log(`  filled in ${Object.keys(data).join(', ')} for ${seed.slug}`);
    }
  }

  await seedCategoryImages();

  const published = await db.business.count({ where: { status: 'published' } });
  console.log(`\nDone. ${published} listings published. Open http://127.0.0.1:4000/business — cached pages refresh within a minute.`);
}

main()
  .catch((error: unknown) => {
    console.error('\n' + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
