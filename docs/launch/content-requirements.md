# Content and brand requirements — what the client still needs to supply

Status date: 2026-09-07. This is the inventory of every item on the public site that is currently a **development fallback** and must be replaced or explicitly approved before launch (SRS UX 001, CFG 001–002, HERO 001, MED 003, PRIV 001). Nothing here was invented to look finished: every fallback is original, credited, or deliberately withheld, and each is documented below with what happens until the real item arrives.

**Audit result (2026-09-07).** The public application was searched for development-only content presented as production content:

| Check | Result | Action taken |
| --- | --- | --- |
| `.local` / example email addresses | Not rendered. The general settings refuse a support address on a non-routable domain, so the footer, correction links and "Add a business" mailto are withheld until a real one is set. The local `MAIL_FROM_ADDRESS` is only ever seen in the local mail catcher | None needed; listed as D04 |
| Fake contact information (phone, postal address) | None. The fields are empty until an editor fills them in the admin | None needed |
| Unapproved claims | None found. Copy makes no volume, ranking, award or "trusted by" claims; counters are off by default and only ever count published records (HERO 007) | Copy inventory in §3 for approval |
| Fake testimonials | None. Reviews shown are real approved submissions in the database; the development database contains test reviews that never leave this machine | None needed |
| Fake ratings | None. Averages come only from approved reviews; JSON-LD ratings are now additionally gated behind the SEO 006 sign-off | Gate added (`REVIEW_RICH_RESULTS`) |
| Unlicensed images | The browser icon was the Next.js starter's Vercel-logo favicon — a third-party mark presented as the site's own | **Replaced** with an original development icon (navy square, sky-blue "M"); superseded by the client's icon through General settings |
| | Hero photographs: two Creative Commons BY images with attribution rendered on the banner (`docs/content/hero-photography.md`) | Licensed and credited; listed in §2 for replacement or approval |
| | Listing and category fallbacks: original SVG artwork, no photographs implied | None needed |
| Placeholder legal text presented as final | None. About, Contact, Privacy, Terms and Review guidelines are unpublished; the admin refuses to publish placeholder wording; the footer says the policies are being prepared | Listed in §1 |
| Links to pages that do not exist | The review and comment forms linked to `/review-guidelines`, which 404s until published | **Fixed**: the acknowledgement keeps its wording and links only once the page is published |

## 1. Policy and information pages (SRS CFG 002, UX 002, PRIV 001) — decision D05

All five pages are edited in the admin under Configuration → Information pages. Rich text with headings, paragraphs, lists and links; images from the media library. Publishing is refused while the copy is a stub (under about 200 characters of body text), contains placeholder wording ("lorem ipsum", "placeholder", "TBD", sample text), or, for the contact page, lacks a valid contact route.

| Page | Route | Required content | Length guidance | Accessibility | Fallback until supplied | Approval |
| --- | --- | --- | --- | --- | --- | --- |
| About | `/about` | Who runs the site, what "Melbourne" means (see D01), how listings are verified, how to get in touch | 300–800 words | One H1 (the page title); headings in order; plain language | Page absent from navigation and footer (no 404 is linked) | Pending |
| Contact | `/contact` | How to add or correct a listing, report content, editorial contact; the published address | 150–400 words | Same | The route always resolves: a factual explanation plus the working contact form, marked `noindex` | Pending |
| Privacy | `/privacy` | Collection, use, retention and contact for: reviews, comments, enquiries, abuse reports and logs. Retention periods to reflect: enquiries and private contact details 180 days; rejected reviews/comments 90 days; approved review/comment email 180 days; abuse reports 180 days after resolution; IP signals and logs 30 days; audit events 365 days (SRS PRIV 001). Access, correction and deletion procedure (admin-assisted). A privacy contact | Legal team's call; typically 800–1,500 words | Headings per topic; no tables wider than the viewport | Unpublished; forms refer to "review guidelines and privacy notice" without a link | Pending (legal) |
| Terms | `/terms` | Terms of use for visitors and submitters; content rights for reviews and comments; takedown route | Legal team's call | Same | Unpublished | Pending (legal) |
| Review guidelines | `/review-guidelines` | What a review may contain, what is removed, moderation and reporting, own-experience rule | 300–600 words | Same | Unpublished; the acknowledgement checkbox keeps its wording without a link | Pending |

Format: paste or type into the editor; Markdown is accepted. The submission-terms version (`SUBMISSION_TERMS_VERSION`) is bumped by the technical lead when Privacy or Review guidelines change, so every acknowledgement records which version was accepted.

## 2. Brand assets and imagery (SRS UX 001, HERO 001, CFG 001) — decision D02

Uploaded through the admin media library (JPEG, PNG or WebP; at most 10 MB and 40 megapixels; at least 200 px on each side; SVG is not accepted for security reasons) and then chosen in Configuration → General settings or Site settings. Every uploaded image needs alt text before it can be used.

| Item | Where it appears | Required format and size | Accessibility requirement | Current development fallback | Approval |
| --- | --- | --- | --- | --- | --- |
| Logo | Header (on navy), footer, Organization structured data | PNG or WebP with transparent background, at least 800 px wide, aspect roughly 4:1 to 6:1; a version that reads on dark blue. (An SVG master can be kept by the design lead; it is rasterised for upload) | Alt text is the application name; must not contain text the header does not also render | Original inline SVG mark plus the application name as text (`brand-mark.tsx`) | Pending |
| Browser icon | Browser tab, bookmarks | Square PNG, at least 512×512 px; simple shape that survives 16 px | Not announced; decorative | Original navy/sky "M" icon (`apps/web/public/favicon.ico`, 16/32/48 px), replaced automatically when a favicon is set in General settings | Pending |
| Default share image | Link previews on social platforms and messaging apps for pages without their own image | 1200×630 px JPEG or PNG (1.91:1); safe margins of 60 px; no small text | Alt text describing the image (the application name is used if empty) | None: previews show no image until one is set | Pending |
| Hero photographs (up to 6) | Homepage banner behind the headline and search | Landscape JPEG or WebP, at least 2560×1440 px, under 10 MB; Melbourne subjects; avoid busy detail behind the headline area (a navy wash is applied). Each slide takes a focal point and a caption of up to 120 characters | Alt text per slide (what is pictured); the credit line goes in the caption when a licence requires attribution | Two CC BY photographs with attribution rendered on the banner; the client may approve these as launch assets (the licence permits commercial use with credit) | Pending |
| Rotating headline phrases | Homepage hero | 2–5 short phrases, each under 40 characters, that complete "Discover Melbourne businesses: …" | Announced once as a single sentence to assistive technology, whatever the animation does | "local services", "places to eat", "independent shops" (SRS HERO 002's own example wording) | Pending |
| Listing photographs | Listing pages and cards | Per business, supplied by the business with rights confirmed; landscape at least 1600 px wide | Meaningful alt text per image; captions optional | Original category-derived SVG panels; no stock photography is implied | Ongoing editorial |
| Author photographs | Blog bylines and author cards | Square, at least 400×400 px | Alt text is the author's name | Initials mark | Ongoing editorial |

Renditions are generated automatically: 320 px thumbnail, 800 px card, 1600 px hero, all WebP with metadata (including location) stripped.

## 3. Copy inventory for approval — decision D05a

Original copy written during delivery. It is honest and claim-free, but it is the engineering team's wording. Mark each line **approved** or supply a replacement (same length band; the layout is tested at 320 px).

| Location | Current copy | Guidance |
| --- | --- | --- |
| Application name and tagline (General settings) | "Melbourne Sphere" / "Find local businesses across Melbourne" | Tagline under 60 characters; appears in the browser title |
| Default meta description (General settings) | "An independent directory of businesses across Melbourne, Victoria: cafes, trades, services and more, with opening hours and contact details." | 120–155 characters |
| Hero headline (Site settings) | "Discover Melbourne businesses" | Under 80 characters; one H1 |
| Home — categories band | "Start with a category" / "Every category is curated by our editors and lists only published Melbourne businesses." | Heading under 40 characters; description under 140 |
| Home — featured band | "Featured Melbourne businesses" / "A small, clearly labelled set of placements. They never displace organic results." | Same |
| Home — recently added | "New on Melbourne Sphere" / "The newest listings our editors have verified and published." | Same |
| Home — highly rated | "Highly rated in Melbourne" / "Averages come from approved reviews only." | Same |
| Home — areas band | "Find businesses by local area" / "We cover Melbourne only — the CBD and the suburbs around it — so an area page is a real neighbourhood, not a generated location page." | Must stay consistent with decision D01 |
| Home — blog band | "From the Melbourne Sphere blog" / "Local guides and stories written by our editors." | |
| Home — how it works | "No account needed — There are no business logins in Melbourne Sphere. You email us; we do the rest." / "Checked before publishing — Our editors verify the details and the Melbourne location before a listing goes live." / "Melbourne only — We cover one city properly instead of thousands of generated location pages." | Three items, each title under 30 characters and body under 120 |
| Empty states | "Categories are being prepared…", "No listings are published yet…", "Local areas are being reviewed…", "The first articles are being written…" | Shown only when a band has no data; factual |
| Contact page (unpublished state) | "One mailbox for listings, corrections and editorial questions. We read everything; we reply to what needs a reply." plus the three explanations (add/update a business, correct a listing, report a review or comment) | Replaced entirely by the published Contact page |
| Footer | Policy line: "Privacy, terms and review guidelines are being prepared and will be linked here once published." Copyright: "© {year} {name}" | The line disappears as pages are published; the copyright template is editable in General settings |
| Status pages | "Page not found" / "This page does not exist or is no longer published."; a designed 500 page with a retry action | Keep short; no blame, no jargon |
| Forms | Review, comment, enquiry and contact form labels, help text and the acknowledgement wording ("I have read the review guidelines and privacy notice, and this review is my own experience.") | Acknowledgement wording must match what the published Privacy and Review guidelines actually say |

## 4. Contact and routing details — decision D04

| Item | Where | Format | Fallback | Approval |
| --- | --- | --- | --- | --- |
| Public support address | General settings → Contact | A monitored mailbox on the public domain; non-routable domains are refused | Contact block, correction links and "Add a business" mailto withheld; the header action points to the homepage explanation | Pending |
| Public phone (optional) | General settings → Contact | Australian number; normalised and rendered as a `tel:` link | Omitted | Pending |
| Postal address (optional) | General settings → Contact | Up to four lines | Omitted | Pending |
| Site enquiry recipient | `SITE_ENQUIRY_RECIPIENT` (secret store) | Mailbox that receives the contact form | The contact form is refused with a clear message | Pending |
| Verified sender | `MAIL_FROM_ADDRESS` (secret store), SPF/DKIM on the domain | Address on the public domain | Production refuses to start | Pending |
| Per-business enquiry recipient | Each listing (private field, encrypted) | Business's own mailbox, confirmed during verification | Listing shows phone and website actions only; no form | Ongoing editorial |
| Social profiles | General settings → Social | One URL per platform on that platform's own domain | Omitted | Pending |

## 5. Not required from the client

- City, country and timezone: fixed server constants (SRS SCP 001).
- Fallback artwork for listings without photographs and for categories: original SVG, already delivered.
- Loading, error and empty states: designed and delivered.
