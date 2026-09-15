/**
 * Loads the six demonstration articles in `blog-seed-content.ts` into a
 * development database, with their photographs.
 *
 * Why this exists: the blog is hard to judge — and hard to review at all —
 * with one fixture article and no images. This puts real, readable content
 * behind the public blog and the admin editor so both can be looked at.
 *
 * Two rules it follows:
 *
 *  * It refuses any database whose name does not end in `_dev`, `_test` or
 *    `_e2e`, the same guard the browser-suite seeder uses. The SRS forbids
 *    sample content in production (CFG 002), and this is sample content.
 *  * It does not process images itself. The original is uploaded to the
 *    quarantine bucket and an outbox event is written, exactly as the upload
 *    endpoint does; the API's dispatcher and the worker then do the rest. One
 *    media pipeline, not two.
 *
 * Re-running it is safe: everything is matched on its slug and skipped if it
 * is already there.
 *
 *   pnpm --filter api exec tsx scripts/seed-blog.ts
 */
import { renderSanitisedBody } from '../src/blog/sanitise.js';
import { databaseName, db, resolveCommonsFile, sleep, uploadImage, waitUntilReady } from './seed-commons.js';
import { SEED_CATEGORIES, SEED_POSTS, SEED_TAGS, type SeedImage } from './blog-seed-content.js';

/** Resolves the named file, checks its licence, and hands it to the shared uploader. */
async function uploadNamedImage(image: SeedImage, sourceName: string): Promise<string> {
  const file = await resolveCommonsFile(image.file);
  return uploadImage({ file, sourceName, alt: image.alt, credit: image.credit, rightsNote: image.rightsNote });
}

async function main(): Promise<void> {
  console.log(`Seeding demonstration blog content into ${databaseName}\n`);

  const author =
    (await db.author.findUnique({ where: { slug: 'adelaide-sphere-editors' } })) ??
    (await db.author.create({
      data: {
        displayName: 'Adelaide Sphere editors',
        slug: 'adelaide-sphere-editors',
        role: 'Editorial team',
        shortBio: 'The editors who check listings and write the guides.',
        bio: 'Adelaide Sphere is written and checked by a small editorial team based in Adelaide. We visit what we write about.',
        active: true,
      },
    }));

  for (const category of SEED_CATEGORIES) {
    await db.blogCategory.upsert({ where: { slug: category.slug }, update: {}, create: { name: category.name, slug: category.slug, landingContent: null, active: true } });
  }
  for (const tag of SEED_TAGS) {
    await db.blogTag.upsert({ where: { slug: tag }, update: {}, create: { name: tag.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), slug: tag, active: true } });
  }
  console.log(`  ${SEED_CATEGORIES.length} categories, ${SEED_TAGS.length} tags, author "${author.displayName}"`);

  const existing = new Set((await db.post.findMany({ where: { slug: { in: SEED_POSTS.map((p) => p.slug) } }, select: { slug: true } })).map((p) => p.slug));
  const wanted = SEED_POSTS.filter((post) => !existing.has(post.slug));
  if (wanted.length === 0) {
    console.log('\nEvery article is already present; nothing to do.');
    return;
  }

  console.log(`\nDownloading and uploading ${wanted.length} photograph(s)…`);
  const covers = new Map<string, string>();
  for (const post of wanted) {
    covers.set(post.slug, await uploadNamedImage(post.image, `${post.slug}.jpg`));
    // Polite pacing: six originals in a row is what triggers the rate limit.
    await sleep(800);
  }

  console.log('Waiting for the worker to produce the renditions…');
  await waitUntilReady([...covers.values()]);

  const now = new Date();
  for (const [index, post] of wanted.entries()) {
    const category = await db.blogCategory.findUniqueOrThrow({ where: { slug: post.category } });
    const tags = await db.blogTag.findMany({ where: { slug: { in: post.tags } }, select: { id: true } });
    // Published a few days apart, so the index is not six identical dates.
    const publishedAt = new Date(now.getTime() - (wanted.length - index) * 36 * 60 * 60 * 1000);
    await db.post.create({
      data: {
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        bodyFormat: 'markdown',
        bodyMarkdown: post.body,
        // The same renderer the API uses, so nothing reaches the database that
        // would not have survived the editor.
        sanitizedBody: renderSanitisedBody(post.body, 'markdown'),
        status: 'published',
        authorId: author.id,
        categoryId: category.id,
        coverMediaId: covers.get(post.slug) ?? null,
        seoTitle: post.seoTitle,
        seoDescription: post.seoDescription,
        seoKeywords: post.seoKeywords,
        commentsEnabled: true,
        firstPublishedAt: publishedAt,
        publishedAt,
        createdAt: publishedAt,
        tags: { create: tags.map((tag) => ({ tagId: tag.id })) },
      },
    });
    console.log(`  published  ${post.slug}`);
  }

  console.log(`\nDone. ${wanted.length} article(s) published. Open http://127.0.0.1:4000/blog`);
}

main()
  .catch((error: unknown) => {
    console.error('\n' + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
