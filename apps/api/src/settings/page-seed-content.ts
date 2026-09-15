import { SEED_POLICY_PAGES } from './policy-seed-content.js';
import type { StaticPageLayout } from './static-pages.js';

/**
 * Baseline copy for the pages the product ships with (SRS CFG 002).
 *
 * This is shipped product copy, not placeholder text: every sentence describes
 * how Adelaide Sphere actually works today, so each page is truthful the
 * moment it is published. It is written once, into a page that does not exist
 * yet — the seed never overwrites what an editor has since written — and the
 * client's own approved wording replaces it through the admin editor like any
 * other change.
 *
 * Nothing here states a number, a date, a person or a credential: those are
 * either counted from the data by the page itself or absent by design.
 */
export interface PageSeed {
  slug: string;
  title: string;
  seoTitle?: string;
  seoDescription?: string;
  /** How the body is written; both go through the same sanitiser (SRS SEC 001). */
  format: 'markdown' | 'html';
  body: string;
  /** The layout the page starts with; an editor can change it afterwards. */
  layout: StaticPageLayout;
}

/** The pages `pages:seed` installs: the three policies. */
export const PAGE_SEEDS: PageSeed[] = SEED_POLICY_PAGES.map(
  (page): PageSeed => ({
    slug: page.slug,
    title: page.title,
    format: 'markdown',
    // A policy is read with the enquiry form and its own contents beside it.
    layout: 'rightSidebar',
    body: page.body,
  }),
);
