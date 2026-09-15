import { describe, expect, it } from 'vitest';
import { MAX_SLUG_LENGTH, PAGE_LAYOUTS, defaultPageLayout, MIN_BODY_CHARACTERS, RESERVED_SLUGS, SYSTEM_PAGE_SLUGS, isProductRoute, isSystemPage, normalisePageSlug, pageSlugProblem, staticPageBlockers, systemPageDefinition } from './static-pages.js';

const realBody = 'Adelaide Sphere is an independent directory. '.repeat(6);

describe('system pages', () => {
  it('declares the pages the product refers to by address, and no contact page', () => {
    expect(SYSTEM_PAGE_SLUGS).toEqual(['privacy', 'terms', 'review-guidelines']);
    // `/contact` routes enquiries from the site settings, so there is no
    // editable page whose copy could redirect them (CFG 001/002).
    expect(systemPageDefinition('contact')).toBeUndefined();
    expect(isSystemPage('community-guidelines')).toBe(false);
  });

  it('keeps every system page on the shared template', () => {
    for (const slug of SYSTEM_PAGE_SLUGS) expect(systemPageDefinition(slug)?.template).toBe('generic');
  });

  it('treats About and Contact as product routes, which no stored page may shadow', () => {
    expect(systemPageDefinition('about')).toBeUndefined();
    for (const slug of ['about', 'contact', 'blog']) expect(isProductRoute(slug), slug).toBe(true);
    // A system page is reserved too, but it is a page, not a product route.
    for (const slug of ['privacy', 'community-guidelines']) expect(isProductRoute(slug), slug).toBe(false);
  });
});

/**
 * Slug validation is what replaced the closed slug set of SRS 1.6: it is the
 * only thing standing between an editor and an address the site cannot serve
 * (SRS 1.7 CFG 002).
 */
describe('pageSlugProblem', () => {
  it('accepts an ordinary address', () => {
    expect(pageSlugProblem('community-guidelines')).toBeNull();
    expect(pageSlugProblem('accessibility')).toBeNull();
    expect(pageSlugProblem('how-we-work-2026')).toBeNull();
  });

  it('refuses an address the site itself serves, so a page cannot be created where it would never be seen', () => {
    for (const slug of ['blog', 'business', 'contact', 'about', 'api', 'admin', 'sitemap.xml', '_next']) {
      expect(pageSlugProblem(slug), slug).toMatch(/used by the site itself/i);
    }
    // The reserved list covers every public route the web app declares.
    for (const route of ['blog', 'business', 'contact', 'faqs']) expect(RESERVED_SLUGS).toContain(route);
  });

  it('refuses anything that is not a plain lower-case address', () => {
    for (const slug of ['Community Guidelines', 'guidelines!', '../etc/passwd', 'a/b', 'trailing-', '-leading', 'double--hyphen', 'ÜMLAUT']) {
      expect(pageSlugProblem(slug), slug).toBeTruthy();
    }
    expect(pageSlugProblem('a')).toMatch(/at least 2/);
    expect(pageSlugProblem('x'.repeat(MAX_SLUG_LENGTH + 1))).toMatch(/at most/);
  });

  it('explains the problem in words an editor can act on', () => {
    expect(pageSlugProblem('Not A Slug')).toMatch(/lower-case letters, numbers and single hyphens/);
  });

  it('stores the address in the form it validated', () => {
    expect(normalisePageSlug('  Community-Guidelines  ')).toBe('community-guidelines');
    expect(pageSlugProblem('  Community-Guidelines  ')).toBeNull();
  });
});

describe('staticPageBlockers', () => {
  it('accepts a complete page', () => {
    expect(staticPageBlockers({ title: 'Privacy', plainBody: realBody })).toEqual([]);
  });

  it('refuses stub content, placeholder wording and short titles', () => {
    expect(staticPageBlockers({ title: 'Privacy', plainBody: 'Too short' })).toContain(`Page content must be at least ${MIN_BODY_CHARACTERS} characters of real copy`);
    expect(staticPageBlockers({ title: 'Privacy', plainBody: `Lorem ipsum dolor sit amet. ${realBody}` })).toContain('Remove placeholder or sample wording before publishing');
    expect(staticPageBlockers({ title: 'X', plainBody: realBody })).toContain('Title must be at least 3 characters');
  });
});

describe('page layouts', () => {
  it('starts every page with a sidebar', () => {
    for (const slug of ['privacy', 'terms', 'review-guidelines', 'community-guidelines']) expect(defaultPageLayout(slug)).toBe('rightSidebar');
  });

  it('offers the three layouts the editor chooses between', () => {
    expect(PAGE_LAYOUTS).toEqual(['rightSidebar', 'leftSidebar', 'fullWidth']);
  });
});
