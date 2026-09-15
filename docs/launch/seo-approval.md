# SEO approval pack

Status date: 2026-09-07. Proposals for the product owner (wording) and the technical lead (policy) to approve before launch. Everything below reflects what the build does today unless marked **proposal**; the SRS references are 12 SEO 001–007 and UX 003. Nothing depends on a third-party account.

Sign-off table at the end. Titles are shown with the automatic suffix the site appends on every page except the home page: `· <short name>` (the short name defaults to the application name, "Melbourne Sphere").

## 1. Homepage

| Element | Current | Proposal | Notes |
| --- | --- | --- | --- |
| Title | "Melbourne Sphere — Find local businesses across Melbourne" (application name — tagline, from General settings) | Approve, or supply a tagline under 60 characters | The tagline is the only editable part; the pattern is fixed |
| Meta description | "An independent directory of businesses across Melbourne, Victoria: cafes, trades, services and more, with opening hours and contact details." (152 characters) | Approve or replace, 120–155 characters | Editable in General settings |
| H1 | The hero headline ("Discover Melbourne businesses") plus the rotating phrases as one accessible sentence | Approve or replace, under 80 characters | Editable in Site settings |
| Structured data | `Organization` (name, URL, logo when set, social profiles when set) and `WebSite` | **Proposal P5 (technical lead):** add a `SearchAction` to `WebSite` pointing at `/business?q={query}` so search engines can offer a sitelinks search box; small change, no client input | |
| Index policy | Index | No change | |

## 2. Title and description patterns

`{Name}` is the business or term name exactly as an editor typed it. Descriptions fall back to the pattern only when the editor has not written one.

| Page | Route | Title pattern | Description pattern | Index policy |
| --- | --- | --- | --- | --- |
| Directory | `/business` | "Directory" | "Every published business across Melbourne. Filter by category, local area and rating." | Index; self-canonical per page (`?page=n`) with crawlable previous/next |
| Directory, filtered | `/business?q=…`, `?category=`, `?area=`, `?rating=`, `?openNow=` | "Search results for “{query}”" or "Search results" | Same as directory | `noindex, follow`; canonical is the normalised query URL itself, never the unfiltered page |
| Category | `/business/category/{slug}` | "{Category} in Melbourne" | Editor's category description, else "Published {Category} businesses across Melbourne with opening hours and contact details." | Index when the category has an introduction and at least one published listing; `noindex, follow` otherwise |
| Local area | `/business/area/{slug}` | "Businesses in {Area}" | Editor's area introduction (first 160 characters), else "Published businesses in {Area}, Melbourne, with opening hours and contact details." | Same rule as categories |
| Business | `/business/{slug}` | "{Business} — {Primary category} in {Area}" | First 160 characters of the listing description | Index when published; 404 when draft or archived; 301 after a slug change; 410 when deliberately removed |
| Blog index | `/blog` | "Blog" | "Guides, interviews and news about Melbourne businesses and neighbourhoods." | Index |
| Article | `/blog/{slug}` | Editor's SEO title, else the article title | Editor's SEO description, else the excerpt | Index when published; drafts 404 |
| Blog category | `/blog/category/{slug}` | "{Category} articles" | "Articles about {category} from the Melbourne Sphere blog." | Index only with landing content or articles |
| Blog tag | `/blog/tag/{slug}` | "{Tag}" | "Articles tagged {tag} from the Melbourne Sphere blog." | Same rule as blog categories |
| Information pages | `/about`, `/privacy`, `/terms`, `/review-guidelines` | Page SEO title, else page title | Page SEO description, else none | Index when published; absent (404, unlinked) before |
| Contact | `/contact` | Page SEO title, else "Contact us" | Page SEO description, else "How to reach the Melbourne Sphere editors about a listing, a correction or a review." | `noindex, follow` until the approved page is published, then index |
| Not found | any | "Page not found" | none | `noindex`, HTTP 404 |

**Proposals for the product owner to decide (no code change required either way):**

- P1. Title suffix: keep "· Melbourne Sphere" or set a shorter *short name* in General settings for mobile tabs.
- P2. Business title order: "{Business} — {Category} in {Area}" (current, recommended: the name leads) versus "{Business} · {Area}" (shorter, drops the category).
- P3. Category title: "{Category} in Melbourne" (current) versus "Melbourne {Category}" (reads better for some plural nouns, worse for others). Recommended: keep the current pattern; editors can override any page through its SEO fields.

## 3. Canonical URL policy

- One HTTPS origin, configured (`SITE_ORIGIN`), never inferred from the request; every canonical is absolute on that origin (SEO 001). The production origin is decision D04.
- Slugs are lowercase, hyphenated, and never contain the category (UX 003). A business slug is locked after first publication and changes only by explicit admin action, which writes a 301 in the same transaction; older aliases point at the newest address, never chained (SEO 004).
- Paginated lists are self-canonical (`?page=2` canonicalises to itself) with `rel=prev/next` links in the page body.
- Filtered and searched lists canonicalise to their own normalised query (known parameters only, in a fixed order) and are `noindex, follow`. They are never canonicalised to the unfiltered list.
- Canonicals are rebuilt from the known search state only, so every unknown parameter (`utm_*`, `fbclid`, `gclid` and anything else) is dropped.
- Trailing slashes are not used; `www` versus bare domain is decided with the domain (D04) and enforced by the reverse proxy with a 301, not by the application.
- `/admin` and `/api` never appear in public metadata, sitemaps or structured data.

## 4. Indexing controls

- **robots.txt**: allows `/`, disallows `/admin`, `/api/`, query-string paths on `/business` and `/blog`, and `utm_`/`q=` parameters; points at `/sitemap.xml`. It is crawl guidance only; authorisation is enforced by the API.
- **Sitemaps** (`/sitemap.xml` index → `/sitemaps/businesses.xml`, `/sitemaps/editorial.xml`, `/sitemaps/taxonomies.xml`): only canonical 200 pages with a real last-modified time; drafts, redirects, empty taxonomies, filtered lists and private routes are excluded; regenerated on publication changes through the cache-purge event.
- **Staging** must be `noindex` and access-controlled (OPS 001); this is an infrastructure setting for decision D07a, not something the application can guarantee alone.
- **Proposal P4 (technical lead):** register the production origin in Google Search Console and Bing Webmaster Tools after launch and submit the sitemap index; confirm ownership through a DNS record (no HTML file or script is needed).

## 5. Structured data

| Type | Where | Fields | Rule |
| --- | --- | --- | --- |
| Organization, WebSite | Home | name, URL, logo (when set), social profiles (when set) | Values come from General settings; SearchAction is proposal P5 |
| BreadcrumbList | Every page with visible breadcrumbs | The visible trail | Never more than what is shown |
| LocalBusiness (most specific subtype by primary category) | Business page | name, description, URL, telephone, email, links, image, address (only when the listing shows it), geo (only when coordinates are known), opening hours (only published schedules) | Nothing is invented: no price range, no coordinates, no hours unless known and displayed (SEO 005) |
| AggregateRating | Business page | average and count from approved reviews | **Off by default** (SEO 006; see §6) |
| BlogPosting | Article | headline, description, dates, image, section, keywords, author as Person | |

All strings are escaped so editor content cannot close the script element (SEO 007).

## 6. Review rich results (SEO 006) — technical lead sign-off

Google restricts review snippets for "self-serving" reviews and for sites that host reviews about other businesses; eligibility changes and is not guaranteed by valid markup. The SRS therefore requires a check before the markup ships. The build now emits `AggregateRating` **only** when the web tier is started with `REVIEW_RICH_RESULTS=true`; the star ratings visible on the page are unaffected.

Sign-off record (to be completed by the technical lead):

| Item | Value |
| --- | --- |
| Google policy page reviewed | _(URL and date)_ |
| Applies to directory reviews of third-party businesses? | _(yes / no / conditional)_ |
| Decision | _(enable at launch / enable later / keep off)_ |
| Flag set on | _(environment and date)_ |

Recommended default: keep off at launch; revisit after the first month of approved reviews.

## 7. Share metadata

Open Graph metadata (read by the major social and messaging platforms) carries the site name, locale `en_AU`, the page title and description, and an image: the business image, the article cover, or the default share image from General settings. Until a default share image is supplied (decision D02), pages without their own image share without one; no stock image is substituted.

## 8. Sign-off

| Item | Decision needed from | Status |
| --- | --- | --- |
| Homepage title, description and headline (§1) | Product owner | Pending |
| Title and description patterns (§2) and proposals P1–P3 | Product owner | Pending |
| Canonical and indexing policy (§3–4) | Technical lead | Pending |
| Search Console and Bing registration (P4) | Technical lead, after D04 | Pending |
| WebSite SearchAction (P5) | Technical lead | Pending |
| Review rich results (§6) | Technical lead | Pending — off |
| Default share image (§7) | Product owner (D02) | Pending |
