/**
 * Seeds the website surfaces that ship empty: the FAQ page, the testimonials
 * on the home page, the clients-and-partners strip, and the comments under the
 * seeded articles.
 *
 * Everything is written in `website-seed-content.ts` and written here the way
 * the API writes it — answers rendered through the same sanitiser an editor's
 * would go through, comment addresses encrypted and hashed exactly as a
 * submission would be, publication times recorded.
 *
 * Partner logos are **drawn here** rather than found: a partner's logo is its
 * own mark, and passing a stock photograph off as one would be a lie on the
 * page. Each is a plain wordmark built from the organisation's initials, put
 * through the same upload pipeline as any other image, so the media library
 * treats it like anything else.
 *
 * Re-running is safe: every record is matched on something stable and skipped
 * when it is already there.
 *
 *   pnpm --filter api exec tsx --env-file=.env scripts/seed-website-content.ts
 */
import { createRequire } from 'node:module';
import { renderSanitisedBody, toPlainText } from '../src/blog/sanitise.js';
import { staticPageBlockers } from '../src/settings/static-pages.js';
import { databaseName, db, uploadBytes, waitUntilReady } from './seed-commons.js';
import { encryption, hash, termsVersion } from './seed-business-writer.js';
import { SEED_COMMENTS, SEED_FAQS, SEED_PARTNERS, SEED_TESTIMONIALS } from './website-seed-content.js';
import { SEED_POLICY_PAGES } from '../src/settings/policy-seed-content.js';

/**
 * Sharp lives in the worker, which is the application that processes images;
 * the API has no need of it and should not grow one for a seeder. Resolving it
 * from there keeps the dependency where it belongs.
 */
const require = createRequire(`${process.cwd()}/apps/worker/`);
type Sharp = (input: Buffer) => { png: () => { toBuffer: () => Promise<Buffer> } };
const sharp = require('sharp') as Sharp;

const MARK_SIZE = 400;
const AVATAR_SIZE = 400;

/** Colours the generated marks cycle through; each is 4.5:1 or better with white. */
const AVATAR_COLOURS = ['#0B1F3A', '#0369A1', '#155E75', '#065F46', '#7C2D12', '#9D174D', '#4C1D95', '#3F6212'];

/**
 * A partner's mark: initials in a rounded square, and nothing else.
 *
 * The name is deliberately *not* drawn into the image. The strip renders logos
 * forty pixels tall, so a name baked into the bitmap came out six pixels high
 * and clipped at the canvas edge — and text in an image cannot reflow, scale,
 * be selected or be translated. The page puts the name beside the mark as
 * ordinary text instead, which is what a logo strip should do anyway.
 */
function markSvg(initials: string, colour: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MARK_SIZE}" height="${MARK_SIZE}" viewBox="0 0 ${MARK_SIZE} ${MARK_SIZE}">
    <rect width="${MARK_SIZE}" height="${MARK_SIZE}" rx="88" fill="${colour}"/>
    <text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="170" font-weight="700" fill="#FFFFFF">${initials}</text>
  </svg>`;
}

/**
 * A portrait for somebody who does not exist.
 *
 * These testimonials are invented, so a real person's photograph must not sit
 * beside an invented quote and an invented name — that is putting words in the
 * mouth of somebody who never said them. Initials on a coloured disc fills the
 * same slot in the design and claims nothing about anyone.
 */
function avatarSvg(name: string, colour: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" viewBox="0 0 ${AVATAR_SIZE} ${AVATAR_SIZE}">
    <rect width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" fill="${colour}"/>
    <text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="168" font-weight="600" fill="#FFFFFF">${initials}</text>
  </svg>`;
}

async function seedFaqs(): Promise<void> {
  let added = 0;
  for (const [index, faq] of SEED_FAQS.entries()) {
    const existing = await db.faq.findFirst({ where: { question: faq.question }, select: { id: true } });
    if (existing) continue;
    const published = faq.published !== false;
    await db.faq.create({
      data: {
        question: faq.question,
        answerSource: faq.answer,
        // The same renderer the API uses, so nothing reaches the database that
        // would not have survived the editor.
        answerHtml: renderSanitisedBody(faq.answer, 'markdown'),
        answerFormat: 'markdown',
        groupName: faq.group,
        displayOrder: index,
        status: published ? 'published' : 'draft',
        publishedAt: published ? new Date() : null,
      },
    });
    added += 1;
  }
  console.log(`FAQs: ${added} added, ${SEED_FAQS.length - added} already there`);
}

async function seedTestimonials(): Promise<void> {
  let added = 0;
  for (const [index, item] of SEED_TESTIMONIALS.entries()) {
    const existing = await db.testimonial.findFirst({ where: { displayName: item.name }, select: { id: true } });
    if (existing) continue;
    const business = item.business ? await db.business.findUnique({ where: { slug: item.business }, select: { id: true } }) : null;
    const published = item.published !== false;
    const png = await sharp(Buffer.from(avatarSvg(item.name, AVATAR_COLOURS[index % AVATAR_COLOURS.length]!))).png().toBuffer();
    const mediaId = await uploadBytes({
      bytes: png,
      mimeType: 'image/png',
      extension: 'png',
      sourceName: `testimonial-${item.name.toLowerCase().replace(/[^a-z]+/g, '-')}.png`,
      // The name is beside the picture, so the disc itself says nothing new.
      alt: '',
      credit: '',
      rightsNote: `Generated initials avatar for the seeded testimonial from "${item.name}"; not a photograph of anybody.`,
    });
    await waitUntilReady([mediaId]);
    await db.testimonial.create({
      data: {
        displayName: item.name,
        relationship: item.relationship,
        quote: item.quote,
        rating: item.rating ?? null,
        mediaId,
        businessId: business?.id ?? null,
        displayOrder: index,
        status: published ? 'published' : 'draft',
        publishedAt: published ? new Date() : null,
      },
    });
    added += 1;
  }
  console.log(`Testimonials: ${added} added, ${SEED_TESTIMONIALS.length - added} already there`);
}

async function seedPartners(): Promise<void> {
  let added = 0;
  for (const [index, partner] of SEED_PARTNERS.entries()) {
    const existing = await db.partnerOrganisation.findFirst({ where: { name: partner.name }, select: { id: true } });
    if (existing) continue;

    const png = await sharp(Buffer.from(markSvg(partner.initials, partner.colour))).png().toBuffer();
    const mediaId = await uploadBytes({
      bytes: png,
      mimeType: 'image/png',
      extension: 'png',
      sourceName: `partner-${partner.initials.toLowerCase()}-mark.png`,
      // The mark names the organisation, which is what the strip needs read out.
      alt: `${partner.name} logo`,
      credit: partner.name,
      rightsNote: `Demonstration wordmark drawn for the seeded partner "${partner.name}"; not a real organisation's mark.`,
    });
    await waitUntilReady([mediaId]);

    const published = partner.published !== false;
    await db.partnerOrganisation.create({
      data: {
        name: partner.name,
        relationshipLabel: partner.relationship,
        mediaId,
        logoAlt: `${partner.name} logo`,
        websiteUrl: partner.website,
        // Permission is evidence, recorded with the record (SRS 1.2 CLI 002).
        authorisedAt: new Date(),
        authorisationNote: partner.note,
        displayOrder: index,
        status: published ? 'published' : 'draft',
        publishedAt: published ? new Date() : null,
      },
    });
    added += 1;
    console.log(`  ${partner.name}`);
  }
  console.log(`Clients and partners: ${added} added, ${SEED_PARTNERS.length - added} already there`);
}

/**
 * Writes the baseline policy wording, and only into a page that is empty.
 *
 * An editor's own text is never replaced: the check is on the stored body, not
 * on a flag, so a page somebody has written stays exactly as they left it even
 * if this runs again. A page is published only when the API's own publication
 * gate is satisfied, so this cannot put a page live that the admin would have
 * refused.
 */
async function seedPolicyPages(): Promise<void> {
  let written = 0;
  for (const page of SEED_POLICY_PAGES) {
    const existing = await db.staticPage.findUnique({ where: { slug: page.slug }, select: { id: true, sanitizedBody: true, status: true } });
    if (existing && existing.sanitizedBody.trim().length > 0) {
      console.log(`  ${page.slug}: already written (${existing.status}); left alone`);
      continue;
    }
    const sanitizedBody = renderSanitisedBody(page.body, 'markdown');
    const blockers = staticPageBlockers({ title: page.title, plainBody: toPlainText(sanitizedBody) });
    if (blockers.length > 0) {
      console.log(`  ${page.slug}: not publishable — ${blockers.join('; ')}`);
      continue;
    }
    const data = { title: page.title, bodySource: page.body, bodyFormat: 'markdown' as const, sanitizedBody, status: 'published' as const, publishedAt: new Date() };
    if (existing) await db.staticPage.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } });
    else await db.staticPage.create({ data: { slug: page.slug, ...data } });
    written += 1;
    console.log(`  ${page.slug}: published`);
  }
  console.log(`Policy pages: ${written} written, ${SEED_POLICY_PAGES.length - written} left as they were`);
}

async function seedComments(): Promise<void> {
  const now = Date.now();
  let added = 0;
  let skippedPosts = 0;
  for (const comment of SEED_COMMENTS) {
    const post = await db.post.findUnique({ where: { slug: comment.post }, select: { id: true } });
    if (!post) {
      skippedPosts += 1;
      continue;
    }
    const existing = await db.comment.findFirst({ where: { postId: post.id, displayName: comment.name }, select: { id: true } });
    if (existing) continue;

    const email = `${comment.name.toLowerCase().replace(/[^a-z]+/g, '.')}@readers.example`;
    const createdAt = new Date(now - comment.daysAgo * 86_400_000);
    await db.comment.create({
      data: {
        postId: post.id,
        displayName: comment.name,
        // Written exactly as a submission would be: encrypted with the same
        // associated data the API uses, and hashed with the same key.
        privateEmailEncrypted: encryption.encrypt(email, 'comment'),
        emailHash: hash(email),
        originalText: comment.text,
        publicText: comment.redactedTo ?? null,
        redactionReason: comment.redactionReason ?? null,
        status: comment.status,
        moderationReason: comment.moderationReason ?? null,
        decidedAt: comment.status === 'pending' ? null : new Date(createdAt.getTime() + 5 * 3_600_000),
        acknowledgedVersion: termsVersion,
        acknowledgedAt: createdAt,
        submitterIpHash: hash('203.0.113.42'),
        createdAt,
      },
    });
    added += 1;
  }
  const counts = await db.comment.groupBy({ by: ['status'], _count: { _all: true } });
  console.log(`Comments: ${added} added${skippedPosts > 0 ? `, ${skippedPosts} skipped (their article is not seeded)` : ''}`);
  console.log(`  now: ${counts.map((row) => `${row._count._all} ${row.status}`).join(', ')}`);
}

/**
 * Rewrites the seeded text to what the content file says now.
 *
 * Opt-in with `--refresh`, because it overwrites: for seeded copy that is the
 * point, but it must not happen as a side effect of a run somebody started to
 * add a missing record.
 */
async function refresh(): Promise<void> {
  let changed = 0;
  for (const faq of SEED_FAQS) {
    const row = await db.faq.findFirst({ where: { question: faq.question }, select: { id: true, answerSource: true } });
    if (!row || row.answerSource === faq.answer) continue;
    await db.faq.update({ where: { id: row.id }, data: { answerSource: faq.answer, answerHtml: renderSanitisedBody(faq.answer, 'markdown'), version: { increment: 1 } } });
    changed += 1;
  }
  for (const item of SEED_TESTIMONIALS) {
    const row = await db.testimonial.findFirst({ where: { displayName: item.name }, select: { id: true, quote: true, relationship: true, rating: true } });
    if (!row) continue;
    const wanted = item.rating ?? null;
    if (row.quote === item.quote && row.relationship === item.relationship && row.rating === wanted) continue;
    await db.testimonial.update({ where: { id: row.id }, data: { quote: item.quote, relationship: item.relationship, rating: wanted, version: { increment: 1 } } });
    changed += 1;
  }
  console.log(`Done. ${changed} record(s) rewritten.`);
}

async function main(): Promise<void> {
  console.log(`Seeding website content into ${databaseName}\n`);

  if (process.argv.includes('--refresh')) {
    await refresh();
    return;
  }
  await seedFaqs();
  await seedTestimonials();
  await seedPartners();
  await seedComments();
  await seedPolicyPages();
  console.log('\nDone. The FAQ page, home-page testimonials, partners strip and article comments all have content.');
}

main()
  .catch((error: unknown) => {
    console.error('\n' + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
