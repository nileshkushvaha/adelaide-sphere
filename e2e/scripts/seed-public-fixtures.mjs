/**
 * Minimum public content for the browser suite.
 *
 * The suite runs against a database it creates for the run, which is empty. The
 * discovery and editorial journeys need one published business and one published
 * article, the information-page journey a published page, and the desktop
 * submenu journey a primary menu with children — without them they skip, and a
 * skipped journey is not evidence (audit F-09). This seeds exactly what those
 * journeys read and nothing else; the database is dropped when the run ends.
 */
import { createDatabaseClient } from '@adelaide-sphere/database';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const database = new URL(url.replace(/^mysql:/, 'http:')).pathname.replace(/^\//, '');
// The same guard the e2e provisioning uses: never seed something real.
if (!/(_dev|_test|_e2e)$/.test(database)) throw new Error(`Refusing to seed "${database}": the name must end in _dev, _test or _e2e`);

const db = createDatabaseClient({ url, allowPublicKeyRetrieval: process.env.DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL === 'true' });
const now = new Date();

try {
  const category = await db.category.create({ data: { name: 'Cafes', slug: 'cafes', description: 'Coffee and food.', sortOrder: 1, active: true } });
  const area = await db.localArea.create({ data: { name: 'Norwood', slug: 'norwood', active: true, sortOrder: 1, eligibilitySource: 'Browser suite fixture', eligibilityVerifiedAt: now } });

  const business = await db.business.create({
    data: {
      name: 'Fixture Coffee House',
      normalizedName: 'fixture coffee house',
      slug: 'fixture-coffee-house',
      description: 'A fixture listing used by the browser suite. It exists so the discovery journey has something real to reach, and it is removed with the database at the end of the run.',
      status: 'published',
      primaryCategoryId: category.id,
      localAreaId: area.id,
      publicPhone: '03 9000 0000',
      addressVisibility: 'full',
      hoursMode: 'unknown',
      eligibilityVerifiedAt: now,
      eligibilitySource: 'Browser suite fixture',
      firstPublishedAt: now,
      publishedAt: now,
    },
  });
  await db.businessCategory.create({ data: { businessId: business.id, categoryId: category.id } });

  const author = await db.author.create({ data: { displayName: 'Fixture Author', slug: 'fixture-author', role: 'Editor', shortBio: 'Writes the fixture article.' } });
  const blogCategory = await db.blogCategory.create({ data: { name: 'City life', slug: 'city-life', active: true, sortOrder: 1 } });
  await db.post.create({
    data: {
      title: 'A fixture article for the browser suite',
      slug: 'fixture-article',
      excerpt: 'Published so the editorial journey has an article to open.',
      bodyMarkdown: '# A fixture article\n\nPublished so the editorial journey has an article to open, a byline to read and an author card to render.',
      sanitizedBody: '<h1>A fixture article</h1><p>Published so the editorial journey has an article to open, a byline to read and an author card to render.</p>',
      status: 'published',
      authorId: author.id,
      categoryId: blogCategory.id,
      commentsEnabled: true,
      firstPublishedAt: now,
      publishedAt: now,
    },
  });
  const text = 'Adelaide Sphere lists local businesses that an editor has checked, with honest reviews and current opening hours. ';
  const page = await db.staticPage.create({
    data: {
      title: 'About listing a business',
      slug: 'fixture-information',
      sanitizedBody: `<h2>How listings work</h2><p>${text.repeat(3).trim()}</p>`,
      bodySource: `<h2>How listings work</h2><p>${text.repeat(3).trim()}</p>`,
      bodyFormat: 'html',
      seoDescription: 'How a business comes to be listed on Adelaide Sphere, used by the browser suite.',
      status: 'published',
      publishedAt: now,
    },
  });

  // The primary location row is created by the migrations; it gets a menu whose
  // "Businesses" item has children, so the header renders a submenu.
  const menu = await db.menu.create({ data: { name: 'Main navigation' } });
  const item = (id, position, data) => ({ id: `fixture-${id}`, menuId: menu.id, position, ...data });
  await db.menuItem.createMany({
    data: [
      item('home', 0, { type: 'route', routeKey: 'home' }),
      item('directory', 1, { type: 'route', routeKey: 'directory' }),
      item('blog', 2, { type: 'route', routeKey: 'blog' }),
      item('contact', 3, { type: 'route', routeKey: 'contact' }),
    ],
  });
  await db.menuItem.createMany({
    data: [
      item('page', 0, { parentId: 'fixture-directory', type: 'page', pageId: page.id }),
      item('faqs', 1, { parentId: 'fixture-directory', type: 'route', routeKey: 'faqs' }),
    ],
  });
  await db.menuLocation.update({ where: { location: 'primary' }, data: { menuId: menu.id, version: { increment: 1 } } });

  console.log('[browser] seeded one published business, one published article, one published page and a primary menu with a submenu');
} finally {
  await db.$disconnect();
}
