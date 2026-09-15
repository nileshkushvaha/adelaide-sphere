import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { isProductRoute } from '../settings/static-pages.js';
import type { SitemapEntryDto } from './dto/sitemap.dto.js';

/** Sitemap sections (SRS SEO 002); the web tier turns the paths into absolute URLs. */
export const SITEMAP_SECTIONS = ['businesses', 'editorial', 'taxonomies', 'pages'] as const;
export type SitemapSection = (typeof SITEMAP_SECTIONS)[number];

/** Upper bound per section; well under the 50 000 URL protocol limit. */
const MAX_ENTRIES = 20_000;

const latest = (...dates: (Date | null | undefined)[]): Date => {
  const times = dates.filter((d): d is Date => d instanceof Date).map((d) => d.getTime());
  return new Date(times.length > 0 ? Math.max(...times) : 0);
};

/**
 * Canonical, indexable paths with real last-modified times. Only content that
 * returns 200 to an anonymous visitor is listed: drafts, archived rows,
 * inactive terms, empty taxonomies and filtered searches are all excluded
 * (SRS SEO 002/003/007).
 */
@Injectable()
export class SitemapService {
  constructor(private readonly database: DatabaseService) {}

  async section(section: SitemapSection): Promise<SitemapEntryDto[]> {
    switch (section) {
      case 'businesses':
        return this.businesses();
      case 'editorial':
        return this.editorial();
      case 'taxonomies':
        return this.taxonomies();
      case 'pages':
        return this.pages();
    }
  }

  /**
   * Published information pages, and the routes that are always there. A page
   * still in draft answers 404, so it is not listed until it is published
   * (SEO 002).
   */
  private async pages(): Promise<SitemapEntryDto[]> {
    const db = await this.database.client();
    // Every published page, whether the product declared it or an editor
    // created it: what makes a page listable is that it answers 200 to an
    // anonymous visitor, which publication is exactly the record of.
    // A row kept under a product route's address is not a page any more.
    const rows = (await db.staticPage.findMany({ where: { status: 'published', noindex: false }, select: { slug: true, updatedAt: true }, orderBy: { slug: 'asc' } })).filter((row) => !isProductRoute(row.slug));
    const entries = rows.map((row) => ({ path: `/${row.slug}`, lastModified: row.updatedAt.toISOString() }));
    // `/about` and `/contact` are product routes rather than editable content,
    // so their last-modified time is the newest page change we know of.
    const newest = latest(...rows.map((row) => row.updatedAt)).toISOString();
    // The routes that are pages in their own right but have no record: the home
    // page and the directory index whenever there is a published listing to
    // show, and the FAQ page only while it has a published question, because it
    // answers 404 without one.
    const [newestBusiness, newestPost, newestFaq] = await Promise.all([
      db.business.findFirst({ where: { status: 'published' }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
      db.post.findFirst({ where: { status: 'published' }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
      db.faq.findFirst({ where: { status: 'published' }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    ]);
    entries.push({ path: '/', lastModified: latest(newestBusiness?.updatedAt, newestPost?.updatedAt, ...rows.map((row) => row.updatedAt)).toISOString() });
    if (newestBusiness) entries.push({ path: '/business', lastModified: newestBusiness.updatedAt.toISOString() });
    if (newestFaq) entries.push({ path: '/faqs', lastModified: newestFaq.updatedAt.toISOString() });
    entries.push({ path: '/about', lastModified: newest }, { path: '/contact', lastModified: newest });
    return entries;
  }

  private async businesses(): Promise<SitemapEntryDto[]> {
    const db = await this.database.client();
    const rows = await db.business.findMany({
      where: { status: 'published' },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: MAX_ENTRIES,
    });
    return rows.map((row) => ({ path: `/business/${row.slug}`, lastModified: row.updatedAt.toISOString() }));
  }

  private async editorial(): Promise<SitemapEntryDto[]> {
    const db = await this.database.client();
    const rows = await db.post.findMany({
      where: { status: 'published' },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: MAX_ENTRIES,
    });
    const entries = rows.map((row) => ({ path: `/blog/${row.slug}`, lastModified: row.updatedAt.toISOString() }));
    // The blog index is only listed once it has something to show.
    if (rows.length > 0) entries.unshift({ path: '/blog', lastModified: latest(rows[0]?.updatedAt).toISOString() });
    // Author pages exist only for active authors with a published article (SRS 1.10 BLOG 005).
    const authors = await db.author.findMany({
      where: { active: true, posts: { some: { status: 'published' } } },
      select: { slug: true, updatedAt: true, posts: { where: { status: 'published' }, orderBy: { updatedAt: 'desc' }, take: 1, select: { updatedAt: true } } },
      take: MAX_ENTRIES,
    });
    for (const author of authors) {
      const changed = Math.max(author.updatedAt.getTime(), author.posts[0]?.updatedAt.getTime() ?? 0);
      entries.push({ path: `/blog/author/${author.slug}`, lastModified: new Date(changed).toISOString() });
    }
    return entries;
  }

  /**
   * Curated taxonomy landing pages only: each needs its own editorial text and
   * at least one published item, which is exactly the SEO 003 rule against
   * thin generated pages.
   */
  private async taxonomies(): Promise<SitemapEntryDto[]> {
    const db = await this.database.client();
    const publishedBusiness = { status: 'published' as const };
    const [categories, areas, blogCategories, blogTags] = await Promise.all([
      db.category.findMany({
        where: { active: true, NOT: { description: null }, OR: [{ primaryOf: { some: publishedBusiness } }, { businesses: { some: { business: publishedBusiness } } }] },
        select: { slug: true, description: true, updatedAt: true },
      }),
      db.localArea.findMany({
        where: { active: true, NOT: { editorialIntro: null }, businesses: { some: publishedBusiness } },
        select: { slug: true, editorialIntro: true, updatedAt: true },
      }),
      // A blog category is indexed once it holds a published article, the same
      // rule its page applies; only tags need landing content (SRS BLOG 005).
      db.blogCategory.findMany({
        where: { active: true, posts: { some: { status: 'published' } } },
        select: { slug: true, updatedAt: true },
      }),
      db.blogTag.findMany({
        where: { active: true, NOT: { landingContent: null }, posts: { some: { post: { status: 'published' } } } },
        select: { slug: true, landingContent: true, updatedAt: true },
      }),
    ]);
    const hasText = (value: string | null) => (value ?? '').trim().length > 0;
    const entries: SitemapEntryDto[] = [
      ...categories.filter((row) => hasText(row.description)).map((row) => ({ path: `/business/category/${row.slug}`, lastModified: row.updatedAt.toISOString() })),
      ...areas.filter((row) => hasText(row.editorialIntro)).map((row) => ({ path: `/business/area/${row.slug}`, lastModified: row.updatedAt.toISOString() })),
      ...blogCategories.map((row) => ({ path: `/blog/category/${row.slug}`, lastModified: row.updatedAt.toISOString() })),
      ...blogTags.filter((row) => hasText(row.landingContent)).map((row) => ({ path: `/blog/tag/${row.slug}`, lastModified: row.updatedAt.toISOString() })),
    ];
    return entries.slice(0, MAX_ENTRIES);
  }
}
