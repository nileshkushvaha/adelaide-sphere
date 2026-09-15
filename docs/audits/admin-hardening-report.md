# Admin-wide UX/UI, consistency and production hardening — closing report

**Completed:** 12 September 2026 · **Scope:** every admin page except Businesses list/add/edit · **Commits:** `9363eda` → `082490d`

## 1. What was audited before anything was built
Every route in `apps/admin/src/app/routes.tsx` was read against the brief: shared primitives, filter wiring, editor layout, image fields, addresses, colours, placeholders, empty/error/loading states. Findings are in `docs/audits/admin-ui-inventory.md`, which is the route-by-route record.

## 2. Shared primitives (workstream A)
`useListParams` (URL-backed filters), `ListEmpty`/`FilterSummary` (three distinct empty states), `useBusy` (one action at a time, closed with a ref), `Pill` (labels on the admin palette), `slugify`, `queryParams`/`enabledFilters` (replacing nine copies of `asQuery`), `MediaField`, `RemoteSelect`, `RevealContact`, `PermalinkField` as a real form control, `readableAction` (one rendering of activity codes).

## 3. Lists (workstream B)
Search and filters on Blog categories, Blog tags, Pages, Clients and partners; more fields on Service alerts (title), Administrators (role), Testimonials (name and quote), Articles, Activity log (date range in Melbourne days, actor). Filters go to the address bar, clear to page 1, and `FilterWiring.test.tsx` asserts the request each filter actually sends — it caught an enquiries filter that wrote to the URL and never to the request.

## 4. Editors (workstream C)
Every add/edit screen matches Businesses: `.ms-form-grid`, sticky right sidebar on scroll (including the hand-rolled article and author editors at their 1200 px breakpoint), unsaved-changes guard, WordPress-style permalink row wherever a record has a public address (businesses, articles, pages, categories, areas, blog categories, blog tags), slug internal where it is not public (services, authors). Search appearance sections carry keywords and a separate Open Graph image.

## 5. Media
The picker paginates server-side (it silently stopped at 48), explains images still processing, and mounts only while open. Every "paste an image reference" box is a `MediaField`. The retention task that hard-deleted successfully uploaded images after 24 hours is fixed and tested.

## 6. Moderation (workstream D)
Queues show the review/comment text, link to the reported item itself, and can be narrowed to one business or article. Visitor contact details are masked in lists; the full value is a separate, permissioned (`community.contacts.view`), audited reveal.

## 7. Configuration (workstream E)
Activity log, permission catalogue, general settings, home-page settings (visual focal point), roles, administrators, redirects — details in the inventory.

## 8. Website content (workstream F)
Pages, FAQs, service alerts, testimonials (approval removed: status is active/inactive only, per instruction), clients and partners.

## 9. SEO settings and consent
A dedicated SEO settings page per public route (title, keywords, description, canonical, robots, share image), verification and analytics identifiers, and an opt-in cookie-consent banner so analytics can actually load.

## 10. Dashboard (workstream H)
Shares the activity wording with the log; theme-aware labels.

## 11. Defects found and fixed along the way
Hard deletion of good uploads; two raw-exception leaks (SMTP credentials in email logs, BullMQ reasons in the queue monitor) under comments claiming redaction; slug changes of categories, local areas, blog categories and blog tags leaving no 301 (SRS SEO 004); an abuse-report link that did not open the reported item; full-transfer-then-reject on oversized images; false "unsaved changes" on a blank article; Next 16 blocking loopback image hosts and cross-origin dev resources.

## 12. Schema and policy (SRS §74, §84)
**No migration was introduced for admin UI.** The one destructive migration (testimonial approval removal) followed an explicit instruction and carries a `-- reviewed:` note. The new permission syncs from code. No business policy changed without instruction.

## 13. SRS amendments to report (§87), not silently implemented
(a) Testimonials have no approval step — status only. (b) Visitor contact details are masked in admin lists with an audited reveal (ENQ 007 / MON 001 strengthened). (c) Blog category and tag renames create permanent redirects (SEO 004 extended to editorial taxonomy). (d) A `community.contacts.view` permission exists. SRS text was not edited.

## 14. Verification
`pnpm lint`, `pnpm typecheck`, `pnpm contracts:check` clean; unit suites green (api 287, admin 280, web 123, db 49, mail 38, worker 47, ui 27); API integration 302 passed. Run once at the end of each workstream, per the rule now in `CLAUDE.md`.

## 15. Deliberately not done
Bulk moderation actions (no API support; destructive risk without a case for it). A home-page hero preview and a featured-placement preview (previews of public rendering inside an Ant Design admin — named in the inventory as partial rather than marked done).
