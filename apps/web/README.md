# web — public site

Next.js 16 (App Router, React 19, Tailwind v4) public site for Adelaide Sphere. It renders on the server and reads every piece of domain data from the NestJS API (SRS ARC 002); it never touches MySQL, Redis or object storage.

## Routes (SRS UX 003 route contract)

| Route | Rendering | Index policy |
| --- | --- | --- |
| `/` | dynamic (data cached per fetch) | index |
| `/business` (route group `(list)`) | dynamic | index; `noindex, follow` once any filter is applied |
| `/business/category/[slug]`, `/business/area/[slug]` | dynamic, 404 for unknown or inactive terms | index if substantive |
| `/business/[slug]` | dynamic, 404 unless published | index |
| `/blog`, `/blog/[slug]`, `/blog/category/[slug]`, `/blog/tag/[slug]` | dynamic, 404 for drafts and unknown terms | index when published; `?page=N` crawlable and self-canonical, page past the last not found |
| `/blog/feed.xml` | RSS 2.0, newest 20 summaries, `public, max-age=300` | advertised by `<link rel="alternate">` on every page |
| `/blog/search?q=` | dynamic, `noindex, follow`, page past the last 404 | not indexed; `?q=` disallowed in robots |
| `/blog/author/[slug]` | dynamic; 404 unless the author is active with a published article; `?page=N` self-canonical | indexed, in the editorial sitemap |
| `/contact` | dynamic; always resolves. Product route, not editable content: the address, phone and postal details come from the general settings (SRS CFG 001), not from a CMS page | index |
| `/about` | dynamic, 404 until the `about` information page is published. Custom template (`src/app/about/`, `src/components/about/`) over the CMS record: the administrator owns the title, introduction and SEO fields; the template adds live counts from `GET /site/metrics`, the contact route and the process copy (SRS ABT 001–006) | index when published, `noindex` while a draft |
| `/privacy`, `/terms`, `/review-guidelines`, and any page an administrator created | dynamic, 404 until published; shared reading template `src/app/(pages)/[slug]/`, which asks the API rather than holding a slug list (SRS CFG 002 as amended in 1.7). The API refuses page addresses that would shadow a route on this table | index when published |

Filter state (`q`, `category`, `area`, `minRating`, `sort`, `page`) lives in the URL and is parsed by `src/lib/search-params.ts`; the filter form is a plain GET form and pagination and chips are links, so the directory works without client JavaScript.

## Design system and page composition

Public tokens live in `packages/ui/src/styles.css`: colours, content widths (`--as-content` 1520 px, `--as-content-tight` 1120 px, `--as-content-prose`), gutters, section rhythm, radii, shadows, focus rings and motion timings, plus the `.as-container`, `.as-container-tight` and `.as-section` primitives. Use them instead of inventing per-page values.

The site is **light-first with designed dark bands** — warm off-white page, white cards, a cool neutral band, and deep navy for the header, hero, locality feature, call to action and footer. There is deliberately **no `prefers-color-scheme` dark variant**: the light/dark rhythm is part of the composition, and an OS-driven dark mode flattened every band into the same navy. `src/lib/palette.test.ts` enforces both that decision and WCAG AA contrast on every surface.

`main` carries no width. Sections are full-bleed and bound their own content: `src/components/page-shell.tsx` provides `Band` (`page` / `plain` / `soft` / `dark` / `deep` tones), `SectionHeading`, `gridColumns` (column count follows how many cards exist), `cardGridColumns` (the fixed four-column row used by the blog index, the blog archives and the business search results — it does not narrow to the card count, so a collection keeps its shape as it fills up) and `PageShell` for inner pages. Dark surfaces carry `.as-on-dark`, which switches the focus ring to a light colour.

Three content widths, all in `packages/ui/src/styles.css`: `.as-container` (1520 px) for a wide composition, `.as-container-tight` (1120 px) for a section and for article media, and `.as-container-read` (a 46 rem content box) for a long-form reading column. An article sets its words in the reading column and its hero picture in the tight one, so the picture is wider than the text it belongs to; `.as-prose-article` carries the long-form type scale.

Editorial page headings — the blog index, every collection header and an article's header — sit on `.as-editorial-band` (`src/app/globals.css`): one sky light source in the upper right over a band that deepens downward, a dot texture masked to fade before the content ends, and a lit hairline at the bottom edge. Every layer is decoration behind `-z-10`, so nothing there can cover text. An editor's landing content has its opening heading dropped when it only repeats the page title (`src/lib/landing-content.ts`) — presentation only; the stored content is never edited.

Typography pairs Manrope for interface and reading text with Sora for display headings, both self-hosted through `next/font`. Premium glass surfaces use the shared `.as-glass-light` and `.as-glass-dark` primitives only for overlays and information panels; both retain opaque, contrast-safe fallbacks.

Hero photography: `src/lib/hero-assets.ts` holds the licensed default slides in `public/hero/`; anything an administrator configures in site settings replaces them. Sources and licences are recorded in `docs/content/hero-photography.md`.

Listings without a photograph get a branded panel derived from their category (`src/lib/category-visuals.ts`, `src/components/category-icon.tsx`) rather than a shared placeholder — the fallback never implies a photograph exists.

Article pictures all go through `src/components/article-media.tsx`: it reserves the frame before the picture loads, asks for the `card` (800 px) or `hero` (1600 px) rendition according to the layout it sits in, loads lazily unless the caller says this is the page's LCP image, and shows one restrained brand panel (`editorialGradient`) for **both** ways a cover can be absent — an article that has none, and a rendition that will not load. A cover publishes no renditions until the worker has processed it, so "no renditions" is the ordinary case for a fresh upload as well. A load failure also writes the failing URL to the browser console, so a broken media origin stays diagnosable while a reader never sees a broken-image glyph or an error message.

## Structure

```
src/app/            layout (shell, skip link, landmarks), pages, not-found, error boundaries
src/components/     site header/footer, business card, filters, chips, pagination, results, hours table, breadcrumbs
                    navigation/: primary-nav (disclosure dropdowns and flyouts), mobile-nav-drawer (modal <dialog>), secondary-nav, footer-menu, menu-link, menu-icon, active-trail
                    blog: article-media, post-card (standard + featured), article-collection, blog-category-nav, author-byline/card, share-links, comment-form/list
src/lib/api.ts      server-only API client: envelopes, ApiRequestError, per-resource revalidate + cache tags
src/lib/site.ts     SITE_ORIGIN and contactChannel() (a development address is treated as unset)
src/lib/hours.ts    wall-clock hours formatting for Australia/Adelaide
src/lib/*.test.ts   Vitest unit tests for the pure helpers (`pnpm --filter web test`)
```

Presentation primitives and design tokens come from `@adelaide-sphere/ui` (transpiled workspace package); response types come from `@adelaide-sphere/contracts`. Ant Design and Refine are admin-only and must never appear in a public bundle (SRS NFR 013).

## Environment

Copy `.env.example` to `.env.local` (git-ignored). `API_ORIGIN` is server-only and also drives the `/api/v1` rewrite in `next.config.ts`; `SITE_ORIGIN` is the absolute public origin used for canonical URLs; `SITE_CONTACT_EMAIL` receives "Add or update a business" and hours-correction mail and must be publicly routable — an address on `.local`, `.test`, `.invalid`, `.example` or `.internal` is treated as unset, and the site then withholds every contact link instead of publishing a dead mailbox. No `NEXT_PUBLIC_*` variables exist.

## Caching

Every fetch sets an explicit `next.revalidate` and cache tags (SRS CACHE 001): taxonomy 300 s, search 30 s, business detail 60 s (`businesses`, `business:<slug>`). Tag-based purge on publish/unpublish arrives in the caching phase.

Navigation (SRS 1.9 MENU 005) comes from `fetchMenus()` → `GET /site/menus`, already resolved and publication-filtered by the API, cached 300 s under `menus` **and** every content tag a menu can link to (`pages`, `posts`, `taxonomy`, `businesses`, `faqs`), so unpublishing a linked page also refreshes the menus. If the read fails the shell renders `lib/default-menus.ts` — product routes only, never a link that might 404. The header and footer keep no link lists of their own; edit navigation in the admin under Website → Menus.

## Commands

`pnpm dev:web` · `pnpm --filter web build` · `pnpm --filter web test` · `pnpm --filter web lint` · `pnpm --filter web typecheck` (runs `next typegen` first).

**Blog analytics (SRS 1.10 BLOG 006).** `lib/track.ts` sends a fixed set of blog events only after analytics consent, and only to Google Analytics or Tag Manager. Server components mark tracked areas with `data-track="<event>"`; `components/analytics-events.tsx` (in the layout) turns link clicks inside them into events and measures reading depth on `[data-track-read]`. Never send what a visitor typed.
