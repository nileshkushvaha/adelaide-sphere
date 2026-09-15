/**
 * Writing a demonstration listing into the database, and finding the
 * photographs to go with it.
 *
 * Two seeders need this — the twenty hand-written listings and the trade
 * categories that fill out the directory — and a second copy of "how a
 * business is created" is exactly the kind of duplication that drifts: one
 * copy would learn about a new required field and the other would not.
 *
 * Nothing here decides *what* to seed. It takes a listing that has already
 * been composed and writes it the way the API would: the same normalisation,
 * the same encryption, the same reviews-then-rating order.
 */
import { createHmac } from 'node:crypto';
import { FieldEncryptionService } from '../src/common/field-encryption.service.js';
import { normaliseBusinessName, normalisePhone } from '../src/directory/business-rules.js';
import { SEED_SERVICES, type HoursRule, type SeedBusiness, type SeedReview } from './business-seed-content.js';
import { db, need, searchCommons, sleep, uploadImage, waitUntilReady, type CommonsFile } from './seed-commons.js';

/** The API's own encryption, given the one value it reads from configuration. */
export const encryption = new FieldEncryptionService({ get: () => need('FIELD_ENCRYPTION_KEY') } as never);
const appSecret = need('APP_SECRET_KEY');
export const termsVersion = process.env.SUBMISSION_TERMS_VERSION ?? '2026-09-01';
/** The keyed hash the API stores instead of an address or an IP (SRS DAT 002). */
export const hash = (value: string) => createHmac('sha256', appSecret).update(value).digest('hex');

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The (fictional) inbox enquiries go to: on the listing's own domain. */
export const enquiryAddress = (website: string) => `enquiries@${new URL(website).hostname.replace(/^www\./, '')}`;

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};

/** "Seeded" is the source: an editor reading the record should know it was not checked by hand. */
export const ELIGIBILITY_SOURCE = 'Demonstration listing: an Inner Adelaide suburb, seeded for development';
export const RIGHTS_NOTE = 'Demonstration listing; photographs are attribution-licensed files from Wikimedia Commons, credited on each asset';

const SEED_IMAGES_PER_BUSINESS = 4;

/** Titles already used, so two records never carry the same photograph. */
export const usedTitles = new Set<string>();

/**
 * Loads the Commons titles this database already uses, from the rights note
 * each asset carries.
 *
 * The note holds the file's page address, where the title is URL-encoded and
 * its spaces are underscores; Commons' own search returns the title with
 * spaces. Decoding alone left the two forms different, so the set never
 * matched and three categories were handed a photograph a listing already had.
 */
export async function loadUsedTitles(): Promise<void> {
  for (const row of await db.mediaAsset.findMany({ where: { rightsNote: { contains: 'commons.wikimedia.org' } }, select: { rightsNote: true } })) {
    const match = /wiki\/(File:\S+)$/.exec(row.rightsNote ?? '');
    if (match) usedTitles.add(decodeURIComponent(match[1]!).replace(/_/g, ' '));
  }
}

export async function ensureServices(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const names of Object.values(SEED_SERVICES)) {
    for (const name of names) {
      const slug = slugify(name);
      const row = await db.service.upsert({ where: { slug }, update: {}, create: { name, slug, active: true }, select: { id: true } });
      ids.set(name, row.id);
    }
  }
  // Anything already in the table under another name is still usable.
  for (const row of await db.service.findMany({ where: { active: true }, select: { id: true, name: true } })) ids.set(row.name, row.id);
  return ids;
}

/**
 * Finds and uploads the photographs for one listing. Each query yields at most
 * one picture, so a gallery is four different subjects rather than four shots
 * of the first; a query with nothing usable is reported and skipped, and the
 * listing keeps whatever was found. Alt text comes from the file's own
 * description on Commons — it describes the picture that was actually chosen,
 * which a sentence written here in advance could not.
 */
export async function findImages(slug: string, queries: string[]): Promise<{ id: string; sourceName: string }[]> {
  const uploaded: { id: string; sourceName: string }[] = [];
  for (const [index, query] of queries.slice(0, SEED_IMAGES_PER_BUSINESS).entries()) {
    const sourceName = `${slug}-${index + 1}.jpg`;
    const existing = await db.mediaAsset.findFirst({ where: { sourceName, status: { in: ['ready', 'quarantined'] } }, select: { id: true } });
    if (existing) {
      uploaded.push({ id: existing.id, sourceName });
      continue;
    }
    // A specific query first, then the same query with its last word dropped,
    // down to two words: "cocktail bar counter bartender" finds nothing usable,
    // "cocktail bar" finds plenty, and the result is still on subject.
    let file: CommonsFile | undefined;
    const words = query.split(' ');
    for (let length = words.length; length >= 2 && !file; length -= 1) {
      [file] = await searchCommons(words.slice(0, length).join(' '), 1, usedTitles);
      if (!file) await sleep(400);
    }
    if (!file) {
      console.log(`  nothing usable for "${query}"`);
      continue;
    }
    usedTitles.add(file.title);
    const alt = (file.description || query).slice(0, 240);
    const id = await uploadImage({
      file,
      sourceName,
      alt,
      credit: file.artist ? `${file.artist} via Wikimedia Commons` : 'Wikimedia Commons',
      rightsNote: `${file.licence} — ${file.pageUrl}`,
    });
    uploaded.push({ id, sourceName });
    // Polite pacing: a run of originals in quick succession is what triggers the rate limit.
    await sleep(800);
  }
  return uploaded;
}

export function intervals(rules: HoursRule[]) {
  return rules.flatMap(([days, open, close]) => days.map((weekday) => ({ weekday, allDay: false, startMinute: minutes(open), endMinute: minutes(close), endNextDay: minutes(close) <= minutes(open) })));
}

export async function writeReviews(businessId: string, reviews: SeedReview[]): Promise<void> {
  const now = Date.now();
  let count = 0;
  let sum = 0;
  for (const [index, review] of reviews.entries()) {
    const email = `${slugify(review.name)}.${index}@reviewers.example`;
    const createdAt = new Date(now - review.daysAgo * 86_400_000);
    await db.review.create({
      data: {
        businessId,
        displayName: review.name,
        privateEmailEncrypted: encryption.encrypt(email, businessId),
        emailHash: hash(email),
        rating: review.rating,
        originalText: review.text,
        status: 'approved',
        decidedAt: new Date(createdAt.getTime() + 6 * 3_600_000),
        acknowledgedVersion: termsVersion,
        acknowledgedAt: createdAt,
        submitterIpHash: hash('203.0.113.10'),
        createdAt,
      },
    });
    count += 1;
    sum += review.rating;
  }
  await db.businessRating.upsert({
    where: { businessId },
    create: { businessId, approvedCount: count, ratingSum: sum },
    update: { approvedCount: { increment: count }, ratingSum: { increment: sum } },
  });
}

export async function attachMedia(businessId: string, images: { id: string }[]): Promise<void> {
  for (const [index, image] of images.entries()) {
    await db.businessMedia.upsert({
      where: { businessId_mediaId: { businessId, mediaId: image.id } },
      update: {},
      create: { businessId, mediaId: image.id, sortOrder: index, isCover: index === 0 },
    });
  }
}

export async function createBusiness(
  seed: SeedBusiness,
  services: Map<string, string>,
  categories: Map<string, string>,
  areas: Map<string, string>,
  /** Photographs already found and processed; omit to search per listing. */
  supplied?: { id: string }[],
): Promise<void> {
  const primaryCategoryId = categories.get(seed.category);
  const localAreaId = areas.get(seed.area);
  if (!primaryCategoryId) throw new Error(`${seed.slug}: no category "${seed.category}"`);
  if (!localAreaId) throw new Error(`${seed.slug}: no local area "${seed.area}"`);
  const serviceIds = seed.services.map((name) => {
    const id = services.get(name);
    if (!id) throw new Error(`${seed.slug}: no service "${name}"`);
    return id;
  });
  const secondary = (seed.alsoIn ?? []).map((slug) => {
    const id = categories.get(slug);
    if (!id) throw new Error(`${seed.slug}: no category "${slug}"`);
    return id;
  });

  console.log(`\n${seed.name}`);
  const images = supplied ?? (await findImages(seed.slug, seed.images));
  if (!supplied && images.length > 0) await waitUntilReady(images.map((image) => image.id));

  const publishedAt = new Date(Date.now() - (30 + Math.floor(Math.random() * 300)) * 86_400_000);
  const business = await db.business.create({
    data: {
      name: seed.name,
      normalizedName: normaliseBusinessName(seed.name),
      slug: seed.slug,
      description: seed.description,
      establishedYear: seed.established,
      status: 'published',
      primaryCategoryId,
      localAreaId,
      publicPhone: seed.phone,
      normalizedPhone: normalisePhone(seed.phone),
      publicEmail: seed.email,
      publicUrl: seed.website,
      addressVisibility: 'full',
      hoursMode: 'scheduled',
      eligibilityVerifiedAt: publishedAt,
      eligibilitySource: ELIGIBILITY_SOURCE,
      contentRightsReviewedAt: publishedAt,
      contentRightsNote: RIGHTS_NOTE,
      firstPublishedAt: publishedAt,
      publishedAt,
      createdAt: publishedAt,
      address: { create: { line1: seed.address.line1, line2: seed.address.line2 ?? null, suburb: seed.address.suburb, postcode: seed.address.postcode, latitude: seed.address.lat, longitude: seed.address.lng } },
      categories: { create: secondary.map((categoryId) => ({ categoryId })) },
      services: { create: serviceIds.map((serviceId) => ({ serviceId })) },
      openingHours: { create: intervals(seed.hours) },
      links: { create: seed.links.map((link, sortOrder) => ({ kind: link.kind, url: link.url, sortOrder })) },
    },
    select: { id: true },
  });
  // The enquiry form delivers to this address and never shows it; it is
  // encrypted with the business id, which is why it is written after create.
  await db.business.update({ where: { id: business.id }, data: { privateEnquiryEmailEncrypted: encryption.encrypt(enquiryAddress(seed.website), business.id) } });
  await attachMedia(business.id, images);
  await writeReviews(business.id, seed.reviews);
  console.log(`  published with ${images.length} photograph(s), ${seed.services.length} service(s), ${seed.reviews.length} review(s)`);
}
