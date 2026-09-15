# Internal pre-audit report

**Product:** Melbourne Sphere — Melbourne-only business directory and editorial blog
**Specification:** `docs/Melbourne_Sphere_Technical_SRS_v1.md` (MD5 `fcbd1675fb4cd505c1d395b4e7a0c0cb`)
**Date:** 2026-09-07 · **Prepared by:** implementation team (internal review, not an external audit)
**Evidence commands:** `pnpm check`, `pnpm test:integration`

This report states what is built, what is verified, and what still stands
between the current build and a launch that satisfies the SRS. It is deliberately
conservative: anything not demonstrated by a test or a runtime check is listed as
outstanding, and every client decision that blocks a requirement is named.

## 1. Verification summary

| Suite | Result |
| --- | --- |
| Database unit | 23 passed |
| API unit | 153 passed |
| Admin unit + accessibility | 99 passed |
| Web unit + component | 23 passed |
| Domain unit | 12 passed |
| Worker unit | 16 passed |
| API end-to-end (no database) | 19 passed |
| Database integration (real MySQL) | 5 passed |
| API integration (real MySQL + Redis) | 115 passed |
| UAT journeys (Playwright, desktop + 320 px) | 30 passed, plus 4 authenticated admin journeys |
| Capacity (NFR 003 full 30-minute run) | 89,850 requests, 0 errors, p50 53 ms, p95 200 ms, p99 244 ms |
| Restore drill | passed on a development database; production-shaped drill outstanding |
| Builds | api, admin, web, worker, packages — all succeed |
| Bundle budget | admin entry 755 kB, total 2.15 MB — within budget |
| Contracts | generated types match the API exactly |
| Migration policy | 19 migrations, all utf8mb4_unicode_ci, destructive statements annotated |

## 2. Requirement coverage

Full detail is in `docs/requirements-traceability.md`. Summary by SRS section:

| Section | State | Notes |
| --- | --- | --- |
| 1 Scope (SCP) | Met in code | Melbourne is server-owned; no city routes, tenancy or public registration exist. The approved boundary itself is decision D01. |
| 2 Public experience (UX) | Mostly met | Server-rendered pages, design tokens, light and dark schemes; a manual responsive and accessibility pass is still required. |
| 3 Architecture (ARC) | Met | pnpm workspace, four apps, four packages, one API contract, no shared secrets in client bundles. |
| 4 Hero (HERO) | Met | Full-bleed banner with admin-managed Melbourne photography, directional navy wash, focal points, rotating phrases, pause controls, reduced-motion behaviour, no-JavaScript search. Two licensed CC BY images ship as the interim default set (`docs/content/hero-photography.md`); the client’s own photography replaces them without a code change. |
| 5 Discovery (DIR) | Met except DIR 008 | Search, filters, facets, pagination and the featured block are implemented and tested. "Open now" stays disabled pending hours-data readiness. |
| 6 Listings (BUS) | Met | Publication gates, duplicates, hours with DST handling, links, address visibility. |
| 7 Reviews and reports (REV/REP) | Met | Pending by default, transactional aggregates, redaction with a preserved original. |
| 8 Enquiries (ENQ) | Met in code | Outbox, retries, private recipient protection. No email provider adapter exists (D03), so delivery is unproven end to end. |
| 9 Blog (BLOG/COM) | Met | Rich-text authoring with server-side sanitisation, scheduled publishing, revisions, comments, full author profiles and cards. |
| 10 Admin (ADM/AUTH/RBAC) | Met | Bootstrap, invitations, sessions, optional TOTP, default-deny permissions, audit log, the full screen inventory and a real dashboard. |
| 11 Media (MED) | Met | Signed uploads, magic-byte validation, quarantine, re-encoded variants with EXIF stripped, usage records, retention. |
| 12 SEO | Met except SEO 006 | Sitemaps, canonicals, JSON-LD, redirects with 301/410. Review rich results stay off until the technical lead confirms eligibility. |
| 13–14 Data model (DAT) | Met | 19 reviewed migrations, versioned edits, encrypted private fields, keyed hashes. |
| 15–16 REST contract (API/MOD) | Met | Envelopes, DTO allowlists, pagination limits, `expectedVersion`, idempotency, generated OpenAPI. |
| 17 Events and caching (EVT/CACHE) | Met | Transactional outbox, retrying worker, namespaced read cache, tag purges to the web tier. Multi-replica and CDN behaviour is untested without those environments. |
| 18 Security and privacy (SEC/PRIV) | Mostly met | Argon2id, opaque sessions, CSRF origin checks, allowlist sanitisation, field encryption, rate limits that fail safe. TLS, CSP and headers on the web tier are deployment work. |
| 19 Non-functional (NFR) | Mostly met | Automated accessibility checks, bundle budgets and the NFR 003 capacity profile all pass at the stated data volume. A manual screen-reader pass remains. |
| 20 Operations (OPS/BACK/MON) | Partial | CI, images, monitoring signals, backup and restore scripts and runbooks exist; environments, monitoring subscriptions and the first restore drill are client actions. |
| 21 Verification (QA) | Mostly met | Unit, integration, contract, accessibility, UAT-journey and capacity coverage all run from this repository. The signed evidence pack and client approval need a deployed environment. |

## 3. Security review (internal)

Verified by tests and code review:

- No endpoint under `/api/v1/admin/*` is reachable without a session, and a route
  that declares no permission is denied by default (`permissions.guard.spec.ts`,
  integration tests for every module).
- Public writes are rate-limited, captcha-verified and idempotent; when the
  captcha or limiter is unavailable the API answers 503 rather than bypassing
  the check.
- Every piece of editorial content — article bodies, author biographies,
  taxonomy landing text and information pages — passes the same allowlist
  sanitiser before storage, so admin previews and public pages carry the same
  guarantee.
- Private data is protected: reviewer and reporter emails are encrypted with
  AES-256-GCM, abuse-detection hashes are keyed, and no dashboard, event payload
  or monitoring signal contains message text or addresses (asserted in tests).
- Redirect targets are always site-relative; cross-origin and reserved paths are
  refused, and cycles and chains are prevented at write time.
- Secrets: real environment files are git-ignored, every example file holds
  placeholders, and a scan of trackable files after each phase found no
  credentials.

Outstanding for launch: TLS, HSTS and a tested CSP on the web tier; dependency
and container scanning in the deployment pipeline beyond the CI audit job;
penetration testing.

## 4. Open items before launch

**Decision pack (2026-09-07).** The client-facing register for every item below is `docs/launch/client-decisions.md`, with the boundary recommendation (`docs/launch/melbourne-boundary.md`), the content and brand inventory (`docs/launch/content-requirements.md`) and the SEO proposals (`docs/launch/seo-approval.md`). Since this report was written, item 2's email half has been closed on the engineering side: a provider-independent SMTP adapter serves the API and the worker, production refuses to start without an authenticated TLS relay, and delivery was verified end to end against a local catcher; what remains is the client's provider account (D03b). Review rich results (item 6) are now explicitly off until signed off.

**Client decisions (blocking):**

1. **D01 — Melbourne boundary.** The conservative City of Melbourne council area is applied. The approved boundary and local-area allowlist must be confirmed; listing eligibility depends on it.
2. **D03 — Third-party accounts.** No Turnstile keys, no email provider and no object-storage or CDN account. Public forms answer 503 without Turnstile, and enquiry delivery cannot be proven end to end without a provider.
3. **Policy and content copy.** Privacy, terms, review guidelines, about and contact pages refuse to publish while they contain placeholder text — by design. The product owner supplies the approved copy. `/contact` meanwhile serves a factual, `noindex` explanation with the working contact form, so the route in the public contract is never a 404.
4. **Hero photography and brand assets.** The client’s own Melbourne photography (two licensed CC BY images ship as an interim set), the logotype and wordmark, and the default share image.
5. **Approved public contact address.** `SITE_CONTACT_EMAIL` is still a development value, so the site withholds it: the footer, hours-correction and listing-correction links are suppressed and the "Add a business" action points at the homepage explanation. A routable address restores all of them with no code change.
6. **SEO 006.** Confirmation from the technical lead before review rich results are enabled.
7. **On-call ownership.** The responder and escalation table in the runbook must be filled in; alerts without a responder do not satisfy MON 002.

**Engineering work (not blocked by decisions):**

7. Manual screen-reader pass across the public pages and the admin. Keyboard order, skip link, landmark and heading structure, and 320 px layout are covered automatically; a screen-reader review is not (T02/T14).
8. Production-shaped restore drill, with media checksums, privacy-deletion replay and a cache/queue rebuild. The backup account needs `RELOAD`/`BINLOG ADMIN` so the binlog position is recorded — without it the one-hour RPO in BACK 001 cannot be met.
9. Run the UAT journeys against the deployed staging environment (they run locally today) and capture the evidence pack for QA 003.
10. "Open now" (DIR 008) once hours coverage is good enough to avoid misleading results.
11. A 404 renders blank with JavaScript disabled: Next 16 keeps the not-found body in the flight payload rather than the initial HTML. Every other page is server-rendered, and a 404 is never indexed, so this is recorded rather than worked around further.

**Capacity evidence (NFR 003).** The full 30-minute acceptance profile was run
against a seeded database of 10,000 businesses, 2,000 articles and 100,000
approved reviews, at 50 GET/s across 100 browsing sessions: **89,850 requests,
0 errors, p50 53 ms, p95 200 ms, p99 244 ms** (single API replica, pool of 40,
MySQL and Redis in local containers). Two defects were found and fixed to reach
it — an unconfigurable 10-connection pool, and a cache stampede on cold keys.
Form POSTs are captcha-protected and rate-limited by design, so they are
excluded from this profile and must be measured separately on staging with test
keys. The numbers above are from a developer machine; repeat the run on the
production shape before signing off NFR 003.

## 5. Statement

Every requirement marked "met" above is backed by automated tests that run in
this repository, and by runtime checks recorded in `docs/setup-progress.md`. No
requirement has been marked met on the strength of code reading alone. The
outstanding items in section 4 are the honest gap between this build and a
launch that satisfies the SRS in full.
