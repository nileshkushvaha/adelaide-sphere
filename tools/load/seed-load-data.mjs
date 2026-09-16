#!/usr/bin/env node
/**
 * Seeds the NFR 003 data volume - 10,000 businesses, 2,000 articles and
 * 100,000 reviews - into a dedicated load database, so a load run measures the
 * product at its stated capacity rather than at fixture size.
 *
 *   DATABASE_URL='mysql://user:pass@127.0.0.1:3317/adelaide_sphere_load' \
 *     node seed-load-data.mjs --businesses 10000 --posts 2000 --reviews 100000
 *
 * It refuses any database whose name does not end in `_load`, so it can never
 * touch development or production data. Content is obviously synthetic.
 */
import { createDatabaseClient } from '@adelaide-sphere/database';
import { createHash, randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? Number(args[index + 1]) : fallback;
};

const url = process.env.DATABASE_URL ?? '';
const databaseName = (url.split('/').pop() ?? '').split('?')[0];
if (!databaseName.endsWith('_load')) {
  console.error(`Refusing to seed '${databaseName || '(none)'}': the database name must end in _load.`);
  process.exit(2);
}

const businessCount = argOf('businesses', 10_000);
const postCount = argOf('posts', 2_000);
const reviewCount = argOf('reviews', 100_000);
const BATCH = 500;

const db = createDatabaseClient({ url, connectionLimit: 5, allowPublicKeyRetrieval: process.env.DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL === 'true' });
const id = () => randomUUID().replace(/-/g, '').slice(0, 24);
const hash = (value) => createHash('sha256').update(value).digest('hex');

const CATEGORY_NAMES = ['Cafes', 'Restaurants', 'Bars', 'Bakeries', 'Retail', 'Trades', 'Health', 'Services'];
const AREA_NAMES = ['Adelaide CBD', 'Norwood', 'Unley', 'Kent Town', 'Prospect', 'North Adelaide', 'Hyde Park', 'Goodwood'];

console.log(`Seeding ${databaseName}: ${businessCount} businesses, ${postCount} articles, ${reviewCount} reviews.`);
const started = Date.now();

const categories = [];
for (const name of CATEGORY_NAMES) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  categories.push(await db.category.upsert({ where: { slug }, update: {}, create: { id: id(), name, slug, description: `Synthetic ${name} category for load testing.`, active: true } }));
}
const areas = [];
for (const name of AREA_NAMES) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  areas.push(await db.localArea.upsert({ where: { slug }, update: {}, create: { id: id(), name, slug, editorialIntro: `Synthetic ${name} area for load testing.`, eligibilitySource: 'load fixture', active: true } }));
}

const businessIds = [];
for (let start = 0; start < businessCount; start += BATCH) {
  const rows = [];
  for (let i = start; i < Math.min(start + BATCH, businessCount); i += 1) {
    const businessId = id();
    businessIds.push(businessId);
    const category = categories[i % categories.length];
    const area = areas[i % areas.length];
    rows.push({
      id: businessId,
      name: `Load Fixture ${category.name} ${i}`,
      normalizedName: `load fixture ${category.name.toLowerCase()} ${i}`,
      slug: `load-fixture-${i}`,
      description: `Synthetic listing ${i} used only for load testing the Adelaide Sphere directory at its stated capacity. It has enough text to be representative of a real description.`,
      status: 'published',
      primaryCategoryId: category.id,
      localAreaId: area.id,
      publishedAt: new Date(),
      firstPublishedAt: new Date(),
      eligibilitySource: 'load fixture',
      contentRightsReviewedAt: new Date(),
    });
  }
  await db.business.createMany({ data: rows, skipDuplicates: true });
  await db.businessRating.createMany({ data: rows.map((row) => ({ businessId: row.id, approvedCount: 0, ratingSum: 0 })), skipDuplicates: true });
  if ((start / BATCH) % 4 === 0) process.stdout.write(`\r  businesses: ${Math.min(start + BATCH, businessCount)}/${businessCount}`);
}
process.stdout.write(`\r  businesses: ${businessCount}/${businessCount}\n`);

const author = await db.author.upsert({ where: { slug: 'load-fixture-author' }, update: {}, create: { id: id(), displayName: 'Load Fixture Author', slug: 'load-fixture-author', shortBio: 'Synthetic author for load testing.', active: true } });
const blogCategory = await db.blogCategory.upsert({ where: { slug: 'load-fixture' }, update: {}, create: { id: id(), name: 'Load fixture', slug: 'load-fixture', landingContent: '<p>Synthetic category.</p>', active: true } });

for (let start = 0; start < postCount; start += BATCH) {
  const rows = [];
  for (let i = start; i < Math.min(start + BATCH, postCount); i += 1) {
    const body = `<p>Synthetic article ${i} used for load testing. ${'It carries enough prose to resemble a real article. '.repeat(6)}</p>`;
    rows.push({
      id: id(),
      title: `Load fixture article ${i}`,
      slug: `load-fixture-article-${i}`,
      excerpt: `Synthetic excerpt for load fixture article ${i}, long enough to be realistic.`,
      bodyMarkdown: body,
      bodyFormat: 'html',
      sanitizedBody: body,
      status: 'published',
      authorId: author.id,
      categoryId: blogCategory.id,
      publishedAt: new Date(),
      firstPublishedAt: new Date(),
    });
  }
  await db.post.createMany({ data: rows, skipDuplicates: true });
  if ((start / BATCH) % 4 === 0) process.stdout.write(`\r  articles: ${Math.min(start + BATCH, postCount)}/${postCount}`);
}
process.stdout.write(`\r  articles: ${postCount}/${postCount}\n`);

for (let start = 0; start < reviewCount; start += BATCH) {
  const rows = [];
  for (let i = start; i < Math.min(start + BATCH, reviewCount); i += 1) {
    rows.push({
      id: id(),
      businessId: businessIds[i % businessIds.length],
      displayName: `Load Reviewer ${i % 500}`,
      // Synthetic, non-recoverable placeholder: the load database holds no real
      // contact data, so nothing here needs the production encryption key.
      privateEmailEncrypted: `load-fixture:${hash(`load-${i}`)}`.slice(0, 200),
      emailHash: hash(`load-${i}@example.invalid`),
      rating: (i % 5) + 1,
      originalText: `Synthetic review ${i}. It is long enough to be representative of a real submission from a visitor.`,
      status: 'approved',
      acknowledgedVersion: '1',
      acknowledgedAt: new Date(),
      submitterIpHash: hash(`10.0.${i % 255}.${(i * 7) % 255}`),
      decidedAt: new Date(),
    });
  }
  await db.review.createMany({ data: rows, skipDuplicates: true });
  if ((start / BATCH) % 20 === 0) process.stdout.write(`\r  reviews: ${Math.min(start + BATCH, reviewCount)}/${reviewCount}`);
}
process.stdout.write(`\r  reviews: ${reviewCount}/${reviewCount}\n`);

// Aggregates are authoritative in MySQL, so bring them in line with the seeded reviews.
await db.$executeRawUnsafe(`
  UPDATE business_ratings r
  JOIN (SELECT businessId, COUNT(*) AS c, SUM(rating) AS s FROM reviews WHERE status = 'approved' GROUP BY businessId) x
    ON x.businessId = r.businessId
  SET r.approvedCount = x.c, r.ratingSum = x.s
`);

console.log(`Done in ${Math.round((Date.now() - started) / 1000)}s.`);
await db.$disconnect();
