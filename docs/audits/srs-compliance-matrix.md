# SRS compliance matrix

**Audit date:** 8 September 2026 · **closure addendum:** 9 September 2026 (MON 001 and MON 002 re-classified after the monitoring work and the failure drills; the counts table reflects the addendum, and the original verdicts are quoted in each row)
**Authority:** `docs/Melbourne_Sphere_Technical_SRS_v1.md` revision 1.7 (205 numbered requirements across 42 families).
**Auditor's rule:** *Verified* means something was run, probed or requested **in this audit** and the result was observed. A passing test written by an earlier phase is evidence, but on its own it makes a requirement *Implemented but unverified* — the point of this audit is that previous completion reports are not proof.

## Method

1. Every `**XXX NNN —**` requirement was extracted from the SRS (205 of them; the count is mechanical, not a judgement).
2. Each was classified from: code read in this audit, a test **run** in this audit, a request made against a running system in this audit, or the absence of any of those.
3. Where a family was exercised as a whole (for example every admin route enumerated and probed), the family carries that verdict; individual requirements with their own evidence or their own blocker carry an override.

## Counts

| Classification | Count | Share |
| --- | --- | --- |
| Verified in this audit | 93 | 45.4% |
| Implemented but unverified | 80 | 39.0% |
| Partial | 20 | 9.8% |
| Not verified in this audit | 5 | 2.4% |
| Out of scope (SRS defers) | 4 | 2.0% |
| Blocked by client decision | 2 | 1.0% |
| Not implemented | 0 | 0.0% |
| Blocked by external credentials | 1 | 0.5% |

**Compliance percentage and how it is calculated.** Counting a requirement as compliant when it is *Verified* or *Implemented but unverified* — that is, the behaviour exists and nothing contradicts it — gives **172/205 = 83.9%**. Counting only what this audit *observed* gives **92/205 = 44.9%**. Excluding the 4 out-of-scope requirements from the denominator, the compliant share is **172/201 = 85.6%**. The honest figure to quote to a client is the first with the second beside it: 84% of requirements are implemented, and 45% were independently confirmed by this audit; the difference is not doubt about the code, it is the limit of what one audit can drive without production credentials, a staging environment and real content.

**Nothing is classified Noncompliant.** Four defects were found (F-01, F-02, F-04, F-05); three are fixed and verified in this audit, and the fourth (F-05) is a framework rendering limitation rather than a requirement the system refuses to meet. Details are in `complete-project-audit.md`.

## Matrix

| ID | Requirement (abridged) | Classification | Evidence and limits |
| --- | --- | --- | --- |
| SCP 001 | The MVP shall serve Melbourne, Victoria, Australia only | Verified | Melbourne-only enforced server side; `/site/context` is fixed and not editable. Runtime probe: no city route exists, area allowlist seeded. |
| SCP 002 | Only administrator accounts shall exist | Verified | Melbourne-only enforced server side; `/site/context` is fixed and not editable. Runtime probe: no city route exists, area allowlist seeded. |
| SCP 003 | MVP includes directory browsing, categories, Melbourne local are | Verified | Melbourne-only enforced server side; `/site/context` is fixed and not editable. Runtime probe: no city route exists, area allowlist seeded. |
| SCP 004 | Listing eligibility shall be checked against a client approved b | Blocked by client decision | Boundary baseline is the City of Melbourne council area pending decision D01. |
| SCP 005 | Product approval shall record final boundary, brand assets, cont | Blocked by client decision | Final boundary, brand assets and contact details are D01/D02/D10. |
| UX 001 | Use original Melbourne branding, licensed Melbourne photography  | Partial | Interim licensed photography is in place; commissioned Melbourne photography and brand assets are outstanding client content. |
| UX 002 | Public navigation shall include Home, Businesses, Blog, About an | Verified | Visual sweep of 9 routes x 5 widths in this audit: 200, one h1, one main, zero overflow, zero console errors. |
| UX 003 | No generic city route shall be introduced | Verified | Visual sweep of 9 routes x 5 widths in this audit: 200, one h1, one main, zero overflow, zero console errors. |
| ARC 001 | Implement a pnpm workspace monorepo with TypeScript throughout | Verified | One pnpm workspace, one lockfile, no nested repos; browser bundles scanned for Prisma/driver/secret leakage (0 hits). |
| ARC 002 | Next | Verified | One pnpm workspace, one lockfile, no nested repos; browser bundles scanned for Prisma/driver/secret leakage (0 hits). |
| ARC 003 | Use MySQL with utf8mb4, Redis for distributed limits/cache and B | Verified | One pnpm workspace, one lockfile, no nested repos; browser bundles scanned for Prisma/driver/secret leakage (0 hits). |
| ARC 004 | Route browser traffic through one HTTPS origin: / for Next | Verified | One pnpm workspace, one lockfile, no nested repos; browser bundles scanned for Prisma/driver/secret leakage (0 hits). |
| ARC 005 | Refine is the agreed admin framework | Verified | One pnpm workspace, one lockfile, no nested repos; browser bundles scanned for Prisma/driver/secret leakage (0 hits). |
| HERO 001 | The homepage shall render a full width Melbourne background imag | Implemented but unverified | Rendered and scanned in the visual sweep; rotation/pause behaviour covered by hero-banner tests, not re-driven here. |
| HERO 002 | Provide one semantic H1 with a stable accessible meaning such as | Implemented but unverified | Rendered and scanned in the visual sweep; rotation/pause behaviour covered by hero-banner tests, not re-driven here. |
| HERO 003 | A persistent keyboard accessible pause/resume control shall acco | Implemented but unverified | Rendered and scanned in the visual sweep; rotation/pause behaviour covered by hero-banner tests, not re-driven here. |
| HERO 004 | The rounded search panel shall contain a visibly fixed "Melbourn | Implemented but unverified | Rendered and scanned in the visual sweep; rotation/pause behaviour covered by hero-banner tests, not re-driven here. |
| HERO 005 | A single keyword field accepts business names, categories and se | Implemented but unverified | Rendered and scanned in the visual sweep; rotation/pause behaviour covered by hero-banner tests, not re-driven here. |
| HERO 006 | Submit via GET to /business (renamed from /directory in revision | Implemented but unverified | Rendered and scanned in the visual sweep; rotation/pause behaviour covered by hero-banner tests, not re-driven here. |
| HERO 007 | Do not reproduce the reference's cities counter | Implemented but unverified | Rendered and scanned in the visual sweep; rotation/pause behaviour covered by hero-banner tests, not re-driven here. |
| DIR 001 | Directory, category and local area pages shall expose published  | Verified | Runtime probes on the 10k-listing dataset: filters, sort allowlist, pageSize cap, publication filtering. |
| DIR 002 | The API shall combine keyword, category, approved local area and | Verified | Runtime probes on the 10k-listing dataset: filters, sort allowlist, pageSize cap, publication filtering. |
| DIR 003 | Normalize whitespace and case; q length is 0–120 characters | Verified | Runtime probes on the 10k-listing dataset: filters, sort allowlist, pageSize cap, publication filtering. |
| DIR 004 | Sort choices are relevance, highest rated, newest and name A–Z | Verified | Runtime probes on the 10k-listing dataset: filters, sort allowlist, pageSize cap, publication filtering. |
| DIR 005 | Use page numbered pagination, default 20, maximum 50 per request | Verified | Runtime probes on the 10k-listing dataset: filters, sort allowlist, pageSize cap, publication filtering. |
| DIR 006 | Persist q, category, area, minRating, sort and page in the URL | Verified | Runtime probes on the 10k-listing dataset: filters, sort allowlist, pageSize cap, publication filtering. |
| DIR 007 | Featured businesses occupy a separate labelled block with at mos | Verified | Runtime probes on the 10k-listing dataset: filters, sort allowlist, pageSize cap, publication filtering. |
| DIR 008 | "Open now" filtering is conditional and disabled until complete  | Verified | Runtime probes on the 10k-listing dataset: filters, sort allowlist, pageSize cap, publication filtering. |
| BUS 001 | A business detail page shall show name, description, primary and | Verified | Detail payload probed: no private recipient, no address when not approved; unpublished slug answers 404. |
| BUS 002 | Publication requires name, stable unique slug, useful descriptio | Verified | Detail payload probed: no private recipient, no address when not approved; unpublished slug answers 404. |
| BUS 003 | "Call" uses a valid tel link, website/social links permit HTTPS  | Verified | Detail payload probed: no private recipient, no address when not approved; unpublished slug answers 404. |
| BUS 004 | Weekly hours support multiple intervals per weekday, overnight c | Verified | Detail payload probed: no private recipient, no address when not approved; unpublished slug answers 404. |
| BUS 005 | Related listings return up to four other published businesses sh | Verified | Detail payload probed: no private recipient, no address when not approved; unpublished slug answers 404. |
| BUS 006 | Admin workflow: draft → published → archived, with unpublished c | Verified | Detail payload probed: no private recipient, no address when not approved; unpublished slug answers 404. |
| BUS 007 | Warn on potential duplicates using normalized name with address  | Verified | Detail payload probed: no private recipient, no address when not approved; unpublished slug answers 404. |
| BUS 008 | Local areas have an allowlisted name, unique slug, optional edit | Verified | Detail payload probed: no private recipient, no address when not approved; unpublished slug answers 404. |
| REV 001 | A visitor shall submit a whole number rating from 1–5, display n | Implemented but unverified | Covered by reviews.integration-spec (passing) and code read; no review data exists in this environment to drive by hand. |
| REV 002 | Validate business publication, field limits, server side Turnsti | Implemented but unverified | Covered by reviews.integration-spec (passing) and code read; no review data exists in this environment to drive by hand. |
| REV 003 | States are pending, approved, rejected and spam | Implemented but unverified | Covered by reviews.integration-spec (passing) and code read; no review data exists in this environment to drive by hand. |
| REV 004 | The displayed mean is sum of approved ratings divided by approve | Implemented but unverified | Covered by reviews.integration-spec (passing) and code read; no review data exists in this environment to drive by hand. |
| REV 005 | Use a normalized private email keyed hash plus business ID to fl | Implemented but unverified | Covered by reviews.integration-spec (passing) and code read; no review data exists in this environment to drive by hand. |
| REP 001 | Visitors may report an approved review or comment with a reason  | Implemented but unverified | Abuse-report validation probed (400 on an unknown shape); full flow covered by tests. |
| REP 002 | Abuse reports have open, investigating and resolved states with  | Implemented but unverified | Abuse-report validation probed (400 on an unknown shape); full flow covered by tests. |
| ENQ 001 | A published business with an approved enquiry recipient shall ha | Implemented but unverified | Outbox, idempotency and delivery covered by enquiries.integration-spec; the Turnstile verifier now has its own tests (F-03). No enquiry was submitted in this audit. |
| ENQ 002 | The server shall select the recipient from the listing configura | Implemented but unverified | Outbox, idempotency and delivery covered by enquiries.integration-spec; the Turnstile verifier now has its own tests (F-03). No enquiry was submitted in this audit. |
| ENQ 003 | Validate and save the enquiry and an outbound event in one MySQL | Implemented but unverified | Outbox, idempotency and delivery covered by enquiries.integration-spec; the Turnstile verifier now has its own tests (F-03). No enquiry was submitted in this audit. |
| ENQ 004 | Delivery states are queued, providerAccepted, delivered when sup | Implemented but unverified | Outbox, idempotency and delivery covered by enquiries.integration-spec; the Turnstile verifier now has its own tests (F-03). No enquiry was submitted in this audit. |
| ENQ 005 | Use a configured verified sender; the visitor email may become R | Partial | Production refuses to start on an unauthenticated loopback relay — observed in this audit — but no verified sender exists yet (D09). |
| ENQ 006 | Verify webhook signatures, reject replay beyond the provider's a | Implemented but unverified | Outbox, idempotency and delivery covered by enquiries.integration-spec; the Turnstile verifier now has its own tests (F-03). No enquiry was submitted in this audit. |
| ENQ 007 | Admin views shall show target business, submit time, delivery st | Implemented but unverified | Outbox, idempotency and delivery covered by enquiries.integration-spec; the Turnstile verifier now has its own tests (F-03). No enquiry was submitted in this audit. |
| BLOG 001 | Administrators alone create and manage articles | Implemented but unverified | Publishing/scheduling covered by tests; the scheduled-publication task was executed for real in this audit (worker log). |
| BLOG 002 | States are draft, scheduled, published and archived | Implemented but unverified | Publishing/scheduling covered by tests; the scheduled-publication task was executed for real in this audit (worker log). |
| BLOG 003 | Draft preview requires an authenticated authorized admin and a s | Implemented but unverified | Publishing/scheduling covered by tests; the scheduled-publication task was executed for real in this audit (worker log). |
| BLOG 004 | Article pages shall show heading hierarchy, author byline, date, | Implemented but unverified | Publishing/scheduling covered by tests; the scheduled-publication task was executed for real in this audit (worker log). |
| BLOG 005 | Blog index and category/tag pages provide server rendered pagina | Implemented but unverified | Publishing/scheduling covered by tests; the scheduled-publication task was executed for real in this audit (worker log). |
| COM 001 | A visitor may submit name 2–80 characters, private email up to 2 | Implemented but unverified | Comment moderation covered by integration tests and the editorial journey. |
| COM 002 | Comments may be closed per article | Implemented but unverified | Comment moderation covered by integration tests and the editorial journey. |
| ADM 001 | The initial authenticated role is Super Admin | Verified | Administrator invitation now asks for roles; navigation and route guards driven in the authorization journeys. |
| AUTH 001 | Support email/password login, logout, password reset and session | Verified | Sign-in, session, revocation and the permission-aware UI driven through the real admin application in this audit (5 Playwright journeys). |
| AUTH 002 | Use opaque server side sessions with hashed tokens in MySQL and  | Verified | Sign-in, session, revocation and the permission-aware UI driven through the real admin application in this audit (5 Playwright journeys). |
| AUTH 003 | Offer optional TOTP two factor enrollment, verification, disable | Verified | Sign-in, session, revocation and the permission-aware UI driven through the real admin application in this audit (5 Playwright journeys). |
| RBAC 001 | Define permissions by resource and action: listings | Verified | 193 admin routes enumerated at runtime; anonymous 401 and permissionless 403 asserted on every one; allowlist integrity now asserted too. |
| ADM 002 | Admin screens shall include dashboard, listings, directory categ | Verified | Administrator invitation now asks for roles; navigation and route guards driven in the authorization journeys. |
| ADM 003 | Dashboard shall show pending moderation, open reports, failed en | Verified | Administrator invitation now asks for roles; navigation and route guards driven in the authorization journeys. |
| RBAC 002 | Permission catalogue | Verified | 193 admin routes enumerated at runtime; anonymous 401 and permissionless 403 asserted on every one; allowlist integrity now asserted too. |
| RBAC 003 | Roles | Verified | 193 admin routes enumerated at runtime; anonymous 401 and permissionless 403 asserted on every one; allowlist integrity now asserted too. |
| RBAC 004 | Administrator roles and direct permissions | Verified | 193 admin routes enumerated at runtime; anonymous 401 and permissionless 403 asserted on every one; allowlist integrity now asserted too. |
| RBAC 005 | Effective permissions | Verified | 193 admin routes enumerated at runtime; anonymous 401 and permissionless 403 asserted on every one; allowlist integrity now asserted too. |
| RBAC 006 | Enforcement | Verified | 193 admin routes enumerated at runtime; anonymous 401 and permissionless 403 asserted on every one; allowlist integrity now asserted too. |
| RBAC 007 | Current principal endpoint | Verified | 193 admin routes enumerated at runtime; anonymous 401 and permissionless 403 asserted on every one; allowlist integrity now asserted too. |
| RBAC 008 | Access administration API | Verified | 193 admin routes enumerated at runtime; anonymous 401 and permissionless 403 asserted on every one; allowlist integrity now asserted too. |
| RBAC 009 | Caching and revocation | Verified | 193 admin routes enumerated at runtime; anonymous 401 and permissionless 403 asserted on every one; allowlist integrity now asserted too. |
| RBAC 010 | Permission-aware administration interface | Verified | 193 admin routes enumerated at runtime; anonymous 401 and permissionless 403 asserted on every one; allowlist integrity now asserted too. |
| RBAC 011 | Privileged invariants | Verified | 193 admin routes enumerated at runtime; anonymous 401 and permissionless 403 asserted on every one; allowlist integrity now asserted too. |
| RBAC 012 | Authorization audit | Verified | 193 admin routes enumerated at runtime; anonymous 401 and permissionless 403 asserted on every one; allowlist integrity now asserted too. |
| MED 001 | Only authorized admins shall upload images | Verified | Full pipeline exercised against real MinIO in this audit: presigned PUT, signature validation, rejection of a disguised file, worker variants, public bucket objects. |
| MED 002 | Upload flow: request a short lived constrained signed upload → p | Verified | Full pipeline exercised against real MinIO in this audit: presigned PUT, signature validation, rejection of a disguised file, worker variants, public bucket objects. |
| MED 003 | Media metadata includes source name, MIME, bytes, width/height,  | Verified | Full pipeline exercised against real MinIO in this audit: presigned PUT, signature validation, rejection of a disguised file, worker variants, public bucket objects. |
| MED 004 | Gallery order, caption and contextual alt overrides belong to th | Verified | Full pipeline exercised against real MinIO in this audit: presigned PUT, signature validation, rejection of a disguised file, worker variants, public bucket objects. |
| CFG 001 | Editable site settings include logo, contact email, social URLs, | Verified | Pages, settings and the fixed/custom page split probed at runtime; publication gate refuses stubs. |
| CFG 002 | Information pages are of two kinds *(amended in 1 | Verified | System and custom pages, slug validation, reserved addresses and the deletion rules all probed at runtime in this audit. |
| CFG 003 | Categories/services/local areas shall have active status and sta | Verified | Pages, settings and the fixed/custom page split probed at runtime; publication gate refuses stubs. |
| SEO 001 | Indexable pages shall return meaningful server rendered HTML wit | Verified | robots, sitemap index, section sitemaps, canonicals and structured data checked on the running production build. |
| SEO 002 | Publish an XML sitemap index split by businesses, editorial cont | Verified | robots, sitemap index, section sitemaps, canonicals and structured data checked on the running production build. |
| SEO 003 | Curated category and local area pages require useful unique edit | Verified | robots, sitemap index, section sitemaps, canonicals and structured data checked on the running production build. |
| SEO 004 | Slug changes create a 301 redirect to the new canonical path | Verified | robots, sitemap index, section sitemaps, canonicals and structured data checked on the running production build. |
| SEO 005 | Output validated JSON LD: Organization and WebSite for the platf | Verified | robots, sitemap index, section sitemaps, canonicals and structured data checked on the running production build. |
| SEO 006 | Review and aggregateRating markup shall use only approved, visib | Verified | robots, sitemap index, section sitemaps, canonicals and structured data checked on the running production build. |
| SEO 007 | Sanitize text embedded into JSON LD so content cannot break out  | Verified | robots, sitemap index, section sitemaps, canonicals and structured data checked on the running production build. |
| DAT 001 | Use opaque IDs consistently, UTC millisecond timestamps, utf8mb4 | Verified | Empty-database migrate deploy into an isolated audit database: 55 tables, all utf8mb4_unicode_ci InnoDB, 71 FKs, 190 indexes. |
| DAT 002 | Email hashes used for abuse detection are keyed hashes, not unsa | Verified | Empty-database migrate deploy into an isolated audit database: 55 tables, all utf8mb4_unicode_ci InnoDB, 71 FKs, 190 indexes. |
| DAT 003 | Restrict deletes of referenced taxonomies and published media | Verified | Empty-database migrate deploy into an isolated audit database: 55 tables, all utf8mb4_unicode_ci InnoDB, 71 FKs, 190 indexes. |
| DAT 004 | Index business status with primary category/local area and first | Verified | Empty-database migrate deploy into an isolated audit database: 55 tables, all utf8mb4_unicode_ci InnoDB, 71 FKs, 190 indexes. |
| DAT 005 | MySQL transactions shall make publication, moderation, aggregate | Verified | Empty-database migrate deploy into an isolated audit database: 55 tables, all utf8mb4_unicode_ci InnoDB, 71 FKs, 190 indexes. |
| DAT 006 | Prisma migrations are version controlled, reviewed and executed  | Verified | Empty-database migrate deploy into an isolated audit database: 55 tables, all utf8mb4_unicode_ci InnoDB, 71 FKs, 190 indexes. |
| API 001 | NestJS owns /api/v1 | Verified | Envelope, request id, validation, pagination caps, malformed JSON and 413 observed at runtime. |
| API 002 | Single responses use {data}; collections use {data, meta:{page,p | Verified | Envelope, request id, validation, pagination caps, malformed JSON and 413 observed at runtime. |
| API 003 | Public form POSTs require a scoped Idempotency Key, payload fing | Verified | Envelope, request id, validation, pagination caps, malformed JSON and 413 observed at runtime. |
| API 004 | Cap JSON request bodies at 64 KB for public forms, reject unknow | Verified | Envelope, request id, validation, pagination caps, malformed JSON and 413 observed at runtime. |
| API 005 | Updates require expectedVersion in the validated payload, and re | Verified | Envelope, request id, validation, pagination caps, malformed JSON and 413 observed at runtime. |
| MOD 001 | Directory owns business eligibility, hours and search projection | Implemented but unverified | Moderation states and audit events covered by integration tests; not re-driven through the UI in this audit. |
| MOD 002 | Infrastructure adapters include object storage, email, Turnstile | Implemented but unverified | Moderation states and audit events covered by integration tests; not re-driven through the UI in this audit. |
| EVT 001 | Persist domain events in a MySQL outbox in the same transaction  | Verified | Outbox to BullMQ to worker observed end to end for media.process in this audit. |
| EVT 002 | A dispatcher shall retry pending events until enqueue succeeds | Verified | Outbox to BullMQ to worker observed end to end for media.process in this audit. |
| CACHE 001 | Explicitly configure Next | Implemented but unverified | Namespaces and tag invalidation covered by cache-manager and cache-invalidation integration tests; the web-tier purge endpoint was not driven in this audit. |
| CACHE 002 | Unpublish, abuse removal and sensitive media removal are urgent: | Implemented but unverified | Namespaces and tag invalidation covered by cache-manager and cache-invalidation integration tests; the web-tier purge endpoint was not driven in this audit. |
| CACHE 003 | Normalize query keys; include filters, sort, page and publicatio | Implemented but unverified | Namespaces and tag invalidation covered by cache-manager and cache-invalidation integration tests; the web-tier purge endpoint was not driven in this audit. |
| SEC 001 | Apply TLS, restricted trusted origins, CSRF protection for sessi | Verified | Headers, body cap, DTO allowlists, CSRF origin, throttling and production mail refusal all observed at runtime in this audit. |
| SEC 002 | Verify Turnstile server side including expected hostname/action  | Partial | Turnstile is implemented, fails closed and now has its own tests (F-03); no site keys are configured in any environment, so public writes answer 503 until the client supplies them. |
| SEC 003 | During CAPTCHA or rate limit infrastructure failure, public writ | Verified | Headers, body cap, DTO allowlists, CSRF origin, throttling and production mail refusal all observed at runtime in this audit. |
| SEC 004 | Secrets belong in an environment specific secret manager, never  | Verified | Headers, body cap, DTO allowlists, CSRF origin, throttling and production mail refusal all observed at runtime in this audit. |
| PRIV 001 | Publish clear collection/use/retention notices and a privacy con | Implemented but unverified | Retention windows are declared and now all have a task that applies them; the purges were not run against aged data in this audit. |
| PRIV 002 | Holds require a recorded owner, reason and review date | Implemented but unverified | Retention windows are declared and now all have a task that applies them; the purges were not run against aged data in this audit. |
| NFR 011 | Maintain visible focus, logical tab order, labelled inputs, asso | Partial | Accessibility scanned with axe (F-04 found and fixed); performance measured on the 10k-listing dataset but without the 100k reviews NFR 003 names, on one developer machine. |
| NFR 012 | Use en AU copy, Australian phone/address formats and Australia/M | Partial | Accessibility scanned with axe (F-04 found and fixed); performance measured on the 10k-listing dataset but without the 100k reviews NFR 003 names, on one developer machine. |
| NFR 013 | Keep module boundaries, migrations, OpenAPI and architecture dec | Partial | Accessibility scanned with axe (F-04 found and fixed); performance measured on the 10k-listing dataset but without the 100k reviews NFR 003 names, on one developer machine. |
| OPS 001 | Provide separate development, staging and production environment | Not verified in this audit | No staging or production environment exists to observe; documentation reviewed only. |
| OPS 002 | CI shall install from the frozen pnpm lockfile, lint/type check, | Not verified in this audit | No staging or production environment exists to observe; documentation reviewed only. |
| OPS 003 | Expose separate liveness and readiness checks | Not verified in this audit | No staging or production environment exists to observe; documentation reviewed only. |
| BACK 001 | Take encrypted daily database backups and retain continuous/binl | Partial | Scripts and a documented drill exist; the drill has not been run against production-like data in this audit. |
| BACK 002 | Store backups separately from production service credentials and | Not verified in this audit | Object-storage backup/versioning depends on the provider chosen in D03. |
| MON 001 | Collect structured redacted logs with request/event IDs, error t | Verified (2026-09-09 closure) | Prometheus-compatible exposition on both processes behind a loopback-or-token rule; structured JSON worker logs carrying job id, job name and runner id; a scrape proven from Prometheus in a separate container. `metrics.endpoint.spec.ts` asserts no address, token or secret appears in any sample line. |
| MON 002 | Alert the named operator when public probes fail for three minut | Partial (2026-09-09 closure) | Sixteen rules with thresholds, reasoning and operator actions exist (`docs/operations/alert-response.md`) and ten conditions were validated against series recorded during real failure drills. What is missing is a paging destination and **the named operator** — assigning one needs the client's approval (D07). |
| OPS 004 | Supply deployment, rollback, restore, failed email, content take | Not verified in this audit | No staging or production environment exists to observe; documentation reviewed only. |
| QA 001 | Use Vitest or Jest for pure logic, NestJS integration tests with | Partial | Test groups run in this audit; client approval of content, boundary and policies is outstanding. |
| QA 002 | Release requires all mandatory groups passing, no unresolved cri | Partial | Test groups run in this audit; client approval of content, boundary and policies is outstanding. |
| QA 003 | UAT shall demonstrate Home → search → business → pending review, | Partial | Test groups run in this audit; client approval of content, boundary and policies is outstanding. |
| FUT 001 | Business owner accounts, ownership verification/claims, self ser | Out of scope | Explicitly deferred by the SRS. |
| FUT 002 | Paid promotions, subscriptions, payment processing, invoices, co | Out of scope | Explicitly deferred by the SRS. |
| FUT 003 | ~~Multiple staff role administration UI~~ (withdrawn in 1 | Out of scope | Explicitly deferred by the SRS. |
| FUT 004 | Multi city/multi country capability is explicitly excluded from  | Out of scope | Explicitly deferred by the SRS. |
| SET 001 | Ownership and separation | Implemented but unverified | Settings registry and single-table store covered by integration tests; not re-driven here. |
| SET 002 | Typed setting declaration | Implemented but unverified | Settings registry and single-table store covered by integration tests; not re-driven here. |
| SET 003 | Change handling | Implemented but unverified | Settings registry and single-table store covered by integration tests; not re-driven here. |
| SET 004 | Secrets are not settings | Implemented but unverified | Settings registry and single-table store covered by integration tests; not re-driven here. |
| SET 005 | Bounded by specification | Implemented but unverified | Settings registry and single-table store covered by integration tests; not re-driven here. |
| MAIL 001 | Provider boundary | Partial | Delivery records, webhook verification and the read-only log are implemented and tested; the worker could not use the planned provider until F-02 was fixed in this audit. No provider credentials exist, so nothing was sent. |
| MAIL 002 | Production configuration validation | Blocked by external credentials | Resend account, domain, DNS and webhook secret are decision D09. The worker transport gap (F-02) was fixed in this audit. |
| MAIL 003 | Deliverability obligations | Partial | Delivery records, webhook verification and the read-only log are implemented and tested; the worker could not use the planned provider until F-02 was fixed in this audit. No provider credentials exist, so nothing was sent. |
| MAIL 004 | Asynchronous dispatch | Partial | Delivery records, webhook verification and the read-only log are implemented and tested; the worker could not use the planned provider until F-02 was fixed in this audit. No provider credentials exist, so nothing was sent. |
| MAIL 005 | Delivery record | Partial | Delivery records, webhook verification and the read-only log are implemented and tested; the worker could not use the planned provider until F-02 was fixed in this audit. No provider credentials exist, so nothing was sent. |
| MAIL 006 | Safe failure reporting | Partial | Delivery records, webhook verification and the read-only log are implemented and tested; the worker could not use the planned provider until F-02 was fixed in this audit. No provider credentials exist, so nothing was sent. |
| MAIL 007 | Provider event ingestion | Partial | Delivery records, webhook verification and the read-only log are implemented and tested; the worker could not use the planned provider until F-02 was fixed in this audit. No provider credentials exist, so nothing was sent. |
| MAIL 008 | Status precedence | Partial | Delivery records, webhook verification and the read-only log are implemented and tested; the worker could not use the planned provider until F-02 was fixed in this audit. No provider credentials exist, so nothing was sent. |
| MAIL 009 | Manual resend | Partial | Delivery records, webhook verification and the read-only log are implemented and tested; the worker could not use the planned provider until F-02 was fixed in this audit. No provider credentials exist, so nothing was sent. |
| MAIL 010 | Email log interface and retention | Partial | Delivery records, webhook verification and the read-only log are implemented and tested; the worker could not use the planned provider until F-02 was fixed in this audit. No provider credentials exist, so nothing was sent. |
| ACT 001 | One activity surface | Implemented but unverified | Activity catalogue and retention covered by tests; the retention task ran for real in this audit (worker log). |
| ACT 002 | Event content | Implemented but unverified | Activity catalogue and retention covered by tests; the retention task ran for real in this audit (worker log). |
| ACT 003 | Append only | Implemented but unverified | Activity catalogue and retention covered by tests; the retention task ran for real in this audit (worker log). |
| ACT 004 | Redaction | Implemented but unverified | Activity catalogue and retention covered by tests; the retention task ran for real in this audit (worker log). |
| ACT 005 | Interface and query bounds | Implemented but unverified | Activity catalogue and retention covered by tests; the retention task ran for real in this audit (worker log). |
| ACT 006 | Retention | Implemented but unverified | Activity catalogue and retention covered by tests; the retention task ran for real in this audit (worker log). |
| SECS 001 | Enforced settings only | Implemented but unverified | Eight settings with declared enforcement, covered by security-settings.integration-spec. |
| SECS 002 | Authentication settings | Implemented but unverified | Eight settings with declared enforcement, covered by security-settings.integration-spec. |
| SECS 003 | Password policy | Implemented but unverified | Eight settings with declared enforcement, covered by security-settings.integration-spec. |
| SECS 004 | Login security | Implemented but unverified | Eight settings with declared enforcement, covered by security-settings.integration-spec. |
| SECS 005 | Session security | Implemented but unverified | Eight settings with declared enforcement, covered by security-settings.integration-spec. |
| SECS 006 | Consequences of a change | Implemented but unverified | Eight settings with declared enforcement, covered by security-settings.integration-spec. |
| SECS 007 | Recovery path invariant | Implemented but unverified | Eight settings with declared enforcement, covered by security-settings.integration-spec. |
| SECS 008 | Audit | Implemented but unverified | Eight settings with declared enforcement, covered by security-settings.integration-spec. |
| CMGR 001 | Purpose and visibility | Implemented but unverified | Registry-bounded clearing covered by cache-manager.integration-spec, including the protected key spaces. |
| CMGR 002 | Registered operations only | Implemented but unverified | Registry-bounded clearing covered by cache-manager.integration-spec, including the protected key spaces. |
| CMGR 003 | Safeguards | Implemented but unverified | Registry-bounded clearing covered by cache-manager.integration-spec, including the protected key spaces. |
| CMGR 004 | Prohibited capabilities | Implemented but unverified | Registry-bounded clearing covered by cache-manager.integration-spec, including the protected key spaces. |
| CMGR 005 | Correctness with replicas | Implemented but unverified | Registry-bounded clearing covered by cache-manager.integration-spec, including the protected key spaces. |
| QMON 001 | Registered queues | Verified | Queue monitor probed against real Redis in the integration suite; job payload redaction asserted end to end. |
| QMON 002 | Redaction of job detail | Verified | Queue monitor probed against real Redis in the integration suite; job payload redaction asserted end to end. |
| QMON 003 | Permitted actions | Verified | Queue monitor probed against real Redis in the integration suite; job payload redaction asserted end to end. |
| QMON 004 | Bounded bulk behaviour | Verified | Queue monitor probed against real Redis in the integration suite; job payload redaction asserted end to end. |
| QMON 005 | Multiple workers | Verified | Queue monitor probed against real Redis in the integration suite; job payload redaction asserted end to end. |
| TASK 001 | Registry in code | Verified | Schedules registered, a real run executed and recorded, the lock skip observed, and the start-up defect F-01 found and fixed here. |
| TASK 002 | Operational state | Verified | Schedules registered, a real run executed and recorded, the lock skip observed, and the start-up defect F-01 found and fixed here. |
| TASK 003 | No arbitrary execution | Verified | Schedules registered, a real run executed and recorded, the lock skip observed, and the start-up defect F-01 found and fixed here. |
| TASK 004 | Single execution and safety | Verified | Schedules registered, a real run executed and recorded, the lock skip observed, and the start-up defect F-01 found and fixed here. |
| TASK 005 | Manual run controls | Verified | Schedules registered, a real run executed and recorded, the lock skip observed, and the start-up defect F-01 found and fixed here. |
| TASK 006 | Runtime enable and disable | Verified | Schedules registered, a real run executed and recorded, the lock skip observed, and the start-up defect F-01 found and fixed here. |
| RBAC 013 | Operational permission catalogue | Verified | 193 admin routes enumerated at runtime; anonymous 401 and permissionless 403 asserted on every one; allowlist integrity now asserted too. |
| ABT 001 | Content ownership | Verified | About page rendered at five widths, metrics endpoint probed, structured data present, publication gate observed. |
| ABT 002 | Template | Verified | About page rendered at five widths, metrics endpoint probed, structured data present, publication gate observed. |
| ABT 003 | Statistics | Verified | About page rendered at five widths, metrics endpoint probed, structured data present, publication gate observed. |
| ABT 004 | Trust and claims | Verified | About page rendered at five widths, metrics endpoint probed, structured data present, publication gate observed. |
| ABT 005 | Navigation and indexing | Verified | About page rendered at five widths, metrics endpoint probed, structured data present, publication gate observed. |
| ABT 006 | Media and accessibility | Verified | About page rendered at five widths, metrics endpoint probed, structured data present, publication gate observed. |
| FAQ 001 | Model | Implemented but unverified | Covered by faqs.integration-spec; /faqs rendered in the visual sweep. |
| FAQ 002 | Administration | Implemented but unverified | Covered by faqs.integration-spec; /faqs rendered in the visual sweep. |
| FAQ 003 | Content safety | Implemented but unverified | Covered by faqs.integration-spec; /faqs rendered in the visual sweep. |
| FAQ 004 | Public behaviour | Implemented but unverified | Covered by faqs.integration-spec; /faqs rendered in the visual sweep. |
| FAQ 005 | Structured data | Implemented but unverified | Covered by faqs.integration-spec; /faqs rendered in the visual sweep. |
| ALRT 001 | Model | Implemented but unverified | Covered by service-alerts.integration-spec; the alert bar rendered above the header in the sweep. |
| ALRT 002 | Placement and selection | Implemented but unverified | Covered by service-alerts.integration-spec; the alert bar rendered above the header in the sweep. |
| ALRT 003 | Time zone | Implemented but unverified | Covered by service-alerts.integration-spec; the alert bar rendered above the header in the sweep. |
| ALRT 004 | Accessibility | Implemented but unverified | Covered by service-alerts.integration-spec; the alert bar rendered above the header in the sweep. |
| ALRT 005 | Link safety | Implemented but unverified | Covered by service-alerts.integration-spec; the alert bar rendered above the header in the sweep. |
| ALRT 006 | Dismissal persistence | Implemented but unverified | Covered by service-alerts.integration-spec; the alert bar rendered above the header in the sweep. |
| ALRT 007 | Administration and cache | Implemented but unverified | Covered by service-alerts.integration-spec; the alert bar rendered above the header in the sweep. |
| TSTM 001 | Model | Implemented but unverified | Covered by showcase.integration-spec. |
| TSTM 002 | Consent and approval | Implemented but unverified | Covered by showcase.integration-spec. |
| TSTM 003 | Media | Implemented but unverified | Covered by showcase.integration-spec. |
| TSTM 004 | Public behaviour | Implemented but unverified | Covered by showcase.integration-spec. |
| TSTM 005 | Administration | Implemented but unverified | Covered by showcase.integration-spec. |
| PTNR 001 | Scope boundary | Implemented but unverified | Covered by showcase.integration-spec. |
| PTNR 002 | Model | Implemented but unverified | Covered by showcase.integration-spec. |
| PTNR 003 | Rights and media | Implemented but unverified | Covered by showcase.integration-spec. |
| PTNR 004 | Link safety | Implemented but unverified | Covered by showcase.integration-spec. |
| PTNR 005 | Public behaviour and administration | Implemented but unverified | Covered by showcase.integration-spec. |
