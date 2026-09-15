# Complete production-readiness audit

- **Audit date:** 8 September 2026
- **Auditee:** the whole Melbourne Sphere system — pnpm monorepo, Next.js public site, Refine admin, NestJS API, Prisma/MySQL, Redis, BullMQ worker, media storage, transactional email, and the supporting documentation.
- **Authority:** `docs/Melbourne_Sphere_Technical_SRS_v1.md` revision 1.7. Existing documentation was treated as evidence to check, not as proof; every previous completion report was treated as unverified.
- **Repository state at the start:** `master` at `9bc30a6`, clean working tree (the audit began by committing and pushing the outstanding programme work at the client's instruction).
- **Method:** read the code, then run it. Every conclusion below rests on a command run in this audit, a request made against a running system in this audit, or code read in this audit — and says which.

## 1. What was actually run

| Environment | What it was |
| --- | --- |
| Isolated audit database | `melbourne_sphere_audit`, created for this audit, migrated from empty, dropped afterwards. The retained `_dev` database was never reset. |
| Isolated e2e database | `melbourne_sphere_e2e`, created for the admin journeys, dropped afterwards. |
| Audit API | `node apps/api/dist/main.js` on **3020** against those databases and **Redis database 5**, so nothing this audit enqueued could reach the queue the client's own stack uses. |
| Audit admin | `vite preview` on **3012**, proxied to the audit API. |
| Public web | production build (`next build && next start`) on **3010** against the client's dev API on 3001. |
| Load API | the same build on **3021** against `melbourne_sphere_load` (10,000 listings, 2,000 posts) for the performance figures. |
| Worker | run for real, twice, against the isolated queue. |
| Untouched | the client's own API (3001) and admin (3002); the Homebrew MySQL on 3306; every other project's containers. |

Test artefacts created by this audit (one administrator, two sessions, four media assets, the audit databases) were removed; see §8.

## 2. Findings

Ten findings. Four were defects in the product, three of those are fixed and verified here; three were defects in the *tests*, all fixed; three are observations with an owner.

### F-01 — The worker could not start at all — **High** — fixed

- **SRS:** TASK 001–006 (scheduled tasks), ENQ 003 (queue delivery), MED 004 (media retention).
- **Component:** `apps/worker/src/schedule-runner.ts`, `apps/api/src/schedules/schedules.service.ts`.
- **Evidence:** running the worker against the audit stack produced, immediately: `[worker] failed to start: Custom Id cannot contain :`. The process exited; no job of any kind was ever consumed.
- **Reproduction:** start the worker with any registered scheduled task present. `bullmq/dist/esm/classes/job.js:909` throws when a custom job id contains `:`; the start-up recovery job used `scheduled.task:recovery:<code>:<timestamp>`.
- **Impact:** the worker is the only thing that delivers enquiries, processes media and applies retention. With it dead on start-up, an accepted enquiry is stored and never delivered, uploads never leave quarantine, publication scheduling never fires and no retention policy runs. In production this is a silent, total failure of every asynchronous behaviour.
- **Root cause:** a job id was composed with the queue library's own key separator. The API's manual-run dispatch had the same bug (`scheduled.task:manual:<code>:<requestId>`), so "Run now" would have thrown too. Neither was caught because **the only tests that exercised dispatch replaced the queue with a recorder** — the code under test never reached BullMQ.
- **Fix:** `scheduledTaskJobId()` in `packages/domain/src/scheduled-tasks.ts` builds ids from a separator the queue accepts and strips any colon it is handed; both call sites use it.
- **Verification:** the worker now starts and runs (`[worker] listening on melbourne-sphere`, then `scheduled.task repeat:content.publish-scheduled:… succeeded: Nothing was due`). Regression tests: `packages/domain/src/scheduled-tasks.spec.ts` (5, asserts no id for any registered task can contain `:`) and a new case in `apps/api/test/schedules.integration-spec.ts` that dispatches through the **real** queue against real Redis and reads the job back.
- **Remaining risk:** none for this defect. The wider lesson — that a stubbed boundary can hide a total failure — is recorded as F-10.

### F-02 — The worker refuses the email provider the project has chosen — **High** — fixed

- **SRS:** MAIL 002, ENQ 003/005, decision D09.
- **Component:** `apps/worker/src/config.ts`, `apps/worker/src/main.ts`.
- **Evidence:** the API accepts `MAIL_TRANSPORT=resend` (`env.validation.ts:163`). The worker accepted only `none | console | smtp` and, in production, demanded `smtp` outright. A production deployment on Resend — the documented plan — would have failed worker start-up with `MAIL_TRANSPORT: must be none, console or smtp`; had it started, `config.smtp ? Smtp : Console` would have selected the console transport, which production forbids.
- **Impact:** under the intended provider, no accepted enquiry could be delivered. ENQ 003 promises durable acceptance *and* delivery; only half of that would have shipped.
- **Root cause:** the Resend transport was added to the API in Phase 31 and to `packages/mail`, but the worker's configuration and mailer selection were never extended. No test covered the worker under `resend`.
- **Fix:** `ResendEnquiryMailer` (new, mirroring the SMTP adapter's one-attempt contract), `resend` accepted in the worker's transport union and validated through `resendConfigFromEnv`, and the production check now allows smtp **or** resend.
- **Verification:** `apps/worker/src/config.spec.ts` gained a case asserting the transport is accepted, its credentials validated, a missing key refused, and the key never echoed. Runtime: the worker started under `MAIL_TRANSPORT=resend` and reported `transport: resend (no-reply@mail.example.com, no webhook secret)` — the address, never the key.
- **Remaining risk:** no Resend credentials exist in any environment, so nothing has been sent through the provider. That is decision **D09**, not a code defect.

### F-03 — The public-write CAPTCHA had no tests — **Medium** — fixed

- **SRS:** SEC 002/003.
- **Component:** `apps/api/src/common/captcha/turnstile.verifier.ts`.
- **Evidence:** the file had no `.spec.ts`. It is the only control between an automated client and every public write (reviews, comments, enquiries, reports), and it makes five separate decisions — configured, token present, provider verdict, hostname match, action match — plus a fail-closed path.
- **Impact:** a regression in any of those (for example inverting the `success` check, or returning `ok` on a provider error) would have been caught by nothing. The consequence of the fail-closed path silently becoming fail-open is unverified content accepted whenever Cloudflare has a bad day.
- **Root cause:** the class was introduced with integration coverage that substitutes an always-pass verifier, so its own logic was never exercised.
- **Fix:** `turnstile.verifier.spec.ts`, 7 cases: unconfigured refuses rather than passing; a missing token is rejected without calling the provider; a verified token for this site and action is accepted and the caller's IP is forwarded; an unverified token, a token for another hostname and a token for another action are each rejected; network failure and a 5xx both fail closed; and the secret never appears in the error raised.
- **Verification:** 7/7 pass.
- **Remaining risk:** no Turnstile site keys are configured, so public writes answer 503 in every environment. That is client-supplied configuration (D03).

### F-04 — A WCAG 2.2 AA contrast failure on the home page — **Medium** — fixed

- **SRS:** NFR 006 (WCAG 2.2 AA), UX 001.
- **Component:** `packages/ui/src/styles.css`, token `--ms-glass-dark`.
- **Evidence:** axe, run against the production build in this audit, reported `color-contrast` on the home page: 2 nodes, first `.min-h-44 > .mt-2.leading-relaxed`. Measured in the browser: text `rgb(189,205,224)` on a composited background of `rgb(79,95,117)` — **4.02:1**, below the 4.5:1 required for 14 px body text. The element is the "Every Melbourne listing" glass card in the categories band.
- **Root cause:** the dark glass panel is translucent (`rgba(13,35,64,0.72)`). On the dark bands the composite is dark and passes; on the **light** bands the surface behind it lightens the composite until the muted text no longer has contrast. The palette test compared the muted token against the *opaque* band token, which passes — so the test agreed with the design while the browser disagreed with both.
- **Fix:** `--ms-glass-dark` raised from `0.72` to `0.8` alpha, which measures 5.24:1 on the lightest surface while keeping the panel translucent.
- **Verification:** axe now reports zero violations on `/`, `/business`, `/blog`, `/contact` and a listing page at desktop and 320 px (8/8 accessibility journeys pass). A new palette test composites each glass token over every surface it can sit on and asserts 4.5:1 — the check that would have caught this.
- **Remaining risk:** none for this token. Contrast over *photography* (the hero panel) still cannot be computed automatically and is covered by the panel tokens instead.

### F-05 — A 404 has no server-rendered body — **Medium** — not fixed, characterised

- **SRS:** UX 002 (a missing page explains itself), NFR 006, SEO 001.
- **Component:** `apps/web` — the Next.js 16.3.4 `notFound()` path.
- **Evidence, from the production build:**

  | Request | Status | Server-rendered body |
  | --- | --- | --- |
  | `/a/b/c` (no route matches) | 404 | **23,464 bytes**, `<h1>Page not found</h1>`, full site shell |
  | `/nope` (matches `[slug]`, calls `notFound()`) | 404 | **58 bytes** — `<body><div hidden></div></body>` |
  | `/business/x-not-real` | 404 | 58 bytes |
  | `/blog/x-not-real` | 404 | 58 bytes |

- **Impact:** the status code and metadata are correct, and a browser with JavaScript renders the designed page after hydration (confirmed: `<h1>Listing not found</h1>` with working links). Without JavaScript — a crawler, a text browser, a screen reader before hydration, a failed chunk — the response is blank. It is a degraded experience and an accessibility gap, not a data or security problem.
- **Root cause, as far as it was isolated:** the content lives only in the RSC flight payload. This was bisected in the audit by rebuilding and re-serving five times: it is **not** the layout (a stripped shell behaves identically), **not** the not-found content (a bare `<h1>` behaves identically), **not** `experimental.globalNotFound` (identical with the flag on and off), and **not** the middleware (identical after renaming it to the `proxy` convention). `app/global-not-found.tsx` is prerendered correctly to `.next/server/app/_not-found.html` and *is* served for genuinely unmatched routes — it is only the `notFound()`-from-a-matched-route path that is empty. All experiments were reverted; `apps/web` carries no diff from this audit.
- **Proposed fix, not applied:** two options, both deployment-level rather than speculative app rewrites — (a) have the reverse proxy serve the prerendered `_not-found.html` body for 404 responses from the app, which is already the correct document; or (b) re-test on the next Next.js patch, since the artefact is right and only the routing of it is wrong. Recorded as a launch blocker of type *deployment configuration*.
- **Remaining risk:** search engines see an empty body on 404s. Because the status is 404 they will not index it, so the SEO harm is limited to crawl impressions.

> **Closure addendum — 9 September 2026.** Fixed at the deployment layer, as
> option (a) proposed above, and verified through a real reverse proxy rather
> than a development server. `infrastructure/edge/nginx.conf` intercepts a 404
> from the web upstream and answers it with the document Next.js itself
> prerendered (`.next/server/app/_not-found.html`), preserving the status —
> `error_page 404 @not_found` without `=`, which would have rewritten the status
> to 200. Measured through nginx 1.29.4 in front of `next start`:
>
> | Request | Before (direct to `next start`) | Through the proxy |
> | --- | --- | --- |
> | `/business/x-not-real` | 404, 37,959 bytes, **1 character of visible text** | 404, 55,873 bytes, **1,042 characters** |
> | `/blog/x-not-real` | 404, empty body | 404, full page |
> | `/business/category/x-not-real` | 404, empty body | 404, full page |
> | `/business/area/x-not-real` | 404, empty body | 404, full page |
> | `/nope-page` | 404, empty body | 404, full page |
> | `/`, `/business`, `/about` | 200 | 200, unchanged |
> | `/api/v1/does-not-exist` | 404 JSON envelope | 404 JSON envelope, untouched |
> | `/admin/` | 200 | 200, untouched |
> | `/_next/static/nope.js` | 404 text | 404 text — assets are never rewritten |
>
> The served document carries `<title>Page not found · Melbourne Sphere</title>`,
> `robots: noindex` (meta and `X-Robots-Tag`), the site header, 37 navigation
> links and the "Error 404 / Page not found" copy, with no JavaScript required
> and no redirect. The finding is **closed for the reference configuration**;
> adapting the two directives to whichever edge the client chooses is recorded as
> a staging task.

### F-06 / F-07 / F-08 — Three stale end-to-end expectations — **Low** — fixed

The Playwright suite was red, and had been red since renames earlier in the programme. None of the three was a product defect; all three were assertions that had drifted from the product.

| ID | Assertion | Reality | Fix |
| --- | --- | --- | --- |
| F-06 | the 404 page offers a link named "browse the directory" | the rename to `/business` (SRS 1.3) made it "Browse businesses" | assert the current name **and click it**, so the way back is proven to work |
| F-07 | at 320 px the header shows a "Businesses" link | below `lg` the navigation is a `<details>` disclosure; the link exists but is closed | open the disclosure first, which is the real accessibility requirement |
| F-08 | the navigation contains "Audit log" | consolidated into "Activity log" in SRS 1.2 (ACT 001) | assert the current label |

**Why this matters more than the three lines suggest:** `pnpm check` does **not** run Playwright, so a red browser suite could stay red indefinitely without any gate noticing. That is F-09.

### F-09 — The aggregate gate does not run the browser suite — **Medium** — recorded, not changed

- **Evidence:** `pnpm check` runs db build, migration lint, lint, typecheck, unit, API e2e, builds, bundle budget and contracts. It does not run `@melbourne-sphere/e2e`. The suite needs a running stack, which is why it is separate — but the consequence is that the only tests that drive the real browser, the real admin application and the axe scan are outside the gate, and they were failing.
- **Impact:** the contrast defect F-04 was detectable by a check the project already owns, and was not detected because nothing ran it.
- **Recommendation (deliberately not applied in this audit — it changes the team's release process):** add a `check:e2e` script that boots the stack and runs Playwright, and make it a required step in CI before release. Left as a decision for the team rather than a unilateral change to the gate.

### F-10 — Storage and queue boundaries were only ever tested through substitutes — **Medium** — closed by evidence, plus a configuration fix

- **Evidence:** `media.integration-spec.ts` substitutes an in-memory `ObjectStoragePort`; `enquiries.integration-spec.ts` substitutes the queue and the CAPTCHA; `schedules.integration-spec.ts` substituted the queue. The local `apps/api/.env` had **no** `MEDIA_S3_*` variables at all, so the API logged `object storage unavailable at start-up` and the real S3 adapter had never run in this environment.
- **Impact:** presigned URLs, bucket separation, byte-level validation and variant publication had no runtime evidence, and F-01 (a total worker failure) hid behind exactly this pattern.
- **Action taken:** the local `.env` (git-ignored) was pointed at the MinIO already running in the Compose stack, and the pipeline was then exercised for real: upload ticket → presigned `PUT` (200) → `complete`, which read the bytes back from MinIO and validated them → outbox → BullMQ → worker → three variants published to the public bucket. Two negative cases were driven too: a 64 px image was rejected (`Images must be at least 200px on each side`) and a shell script uploaded as `image/png` was rejected (`The file is not a recognised image`) — the server trusts the bytes, not the declared type.
- **Remaining risk:** the substitutes are still the default in CI, which is reasonable for speed; what is missing is *one* test per boundary that uses the real thing. F-01's regression test is now that test for the queue. The equivalent for storage is recommended, not added, to keep this audit's changes proportionate.

## 3. Areas examined with no finding

Each of these was probed in this audit and behaved correctly; they are listed so the report is not read as covering only what broke.

- **Authorization (RBAC 001–013).** 193 admin routes enumerated from the running router, every one carrying a resolved declaration (0 `NONE`). Anonymous → 401 and permissionless-administrator → 403 on every route outside two allowlists, which are themselves now asserted against the reflector so a future route cannot be exempted by a stale allowlist entry. Five browser journeys through the real admin: the whole navigation for a super administrator; only permitted navigation for a role-limited one, with the API refusing what the UI hides; a direct permission granting access with its provenance shown; a permission revoked mid-session ending access at once; sign-out clearing capabilities.
- **API boundary.** `{data}` / `{error:{code,message,fields,requestId}}` envelopes; unknown properties rejected by name; `pageSize > 50` refused; sort values allowlisted; malformed JSON 400; a 200 KB body 413; helmet CSP, HSTS, `nosniff`, `no-referrer` and a request id on every response.
- **Public leakage.** A listing payload carries no email address of any kind and no enquiry recipient; `status=draft` is rejected as an unknown query property rather than honoured; an unpublished slug is 404.
- **Database.** From empty: 28 migrations deploy cleanly, 55 tables, **all** `utf8mb4_unicode_ci` InnoDB, 71 foreign keys, 190 indexes, 25 unique constraints. Delete rules are 26 CASCADE / 31 SET NULL / 14 RESTRICT; every CASCADE is a child of the row it hangs from, and no API route deletes a business, review, comment or post, so the destructive ones are unreachable by design.
- **Production configuration refusal.** Starting the API with `NODE_ENV=production` against the local stack failed, correctly and immediately: `SMTP_USER / SMTP_PASSWORD: required in production (authenticated relay only)` and `SMTP_HOST: a loopback host is not a production mail relay`.
- **Rich content.** The sanitiser allowlists tags, attributes and schemes, discards everything else, and is tested against `<script>`, `onerror`, `javascript:`, `data:text/html`, `<iframe>`, `<style>`, `<object>`, `<form>` and `<svg>`.
- **Browser bundles.** No `@prisma`, `PrismaClient`, `mysql://`, `DATABASE_URL`, `APP_SECRET_KEY`, `FIELD_ENCRYPTION_KEY`, `RESEND_API_KEY`, `SMTP_PASSWORD` or `MEDIA_S3_SECRET` in `apps/web/.next/static` or `apps/admin/dist/assets`.
- **Test-database safety.** The e2e provisioning refuses to write to a database whose name does not end in `_dev`, `_test` or `_e2e` — it stopped this audit from seeding the audit database, which is exactly the right outcome.

## 4. Visual and accessibility status

Nine public routes × five widths (1440, 1024, 768, 390, 320), on the production build:

**45/45 combinations: HTTP 200, exactly one `h1`, exactly one `main`, zero horizontal overflow, zero console errors.**

Routes covered: `/`, `/business`, `/business/category/cafes`, `/business/area/melbourne-cbd`, `/blog`, `/about`, `/contact`, `/faqs`, `/business/carlton-corner-bakery`.

axe (`wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa`) reports **zero violations** across the scanned pages at desktop and 320 px after F-04 was fixed. Keyboard journeys pass: the skip link is the first stop and moves focus; the hero search is operable and submittable by keyboard alone; the mobile disclosure opens on click and on Enter/Space and is labelled.

**What this is not:** an automated scan is not a screen-reader audit. axe cannot judge whether alternative text is *meaningful*, whether reading order matches visual order in a screen reader's flow, whether live-region announcements are useful, or whether the star-rating and rotating-hero controls are comprehensible in practice. A manual VoiceOver pass over the home page, a listing, the review form and the admin editors remains outstanding and is listed as a launch blocker of type *manual verification*.

## 5. Performance

Measured on production builds. Public pages against the client's dev API (3 listings); API against `melbourne_sphere_load` (**10,000 listings, 2,000 posts**), median of 7–9 requests, with a unique query string per request where a cache would otherwise answer.

| Surface | Median | Notes |
| --- | --- | --- |
| `/` (home, production build) | 21 ms | warm |
| `/business`, `/blog`, `/about`, listing detail | 5–8 ms | warm |
| `GET /businesses` (cached) | 2 ms | |
| `GET /businesses?q=<unique>` (cache miss, 10k rows) | **113 ms** | range 83–162 ms |
| `GET /businesses?page=<1–100>` (cache miss, 10k rows) | **177 ms** | worst observed **837 ms** |
| `GET /search/suggestions?q=<unique>` (10k rows) | 18 ms | |
| `GET /businesses/{slug}` | 1.6 ms warm, 118 ms cold | |

**Caveats that matter.** The load dataset has 10,000 businesses and 2,000 posts but **zero reviews**, where NFR 003 specifies 100,000 reviews and comments; rating aggregation and review pagination are therefore unmeasured. Everything ran on one developer machine with the database, cache, API and load generator co-resident. The 30-minute, 50 GET/s capacity profile in NFR 003 was **not** run. Deep pagination at up to 837 ms is the one figure worth watching under real load.

## 6. Security posture

No Critical or High security finding was identified. The two High findings were availability defects (F-01, F-02), not security weaknesses.

Confirmed in this audit: default-deny authorization on 193 routes with runtime proof; CSRF origin enforcement (a request from an untrusted origin is refused with `CSRF_ORIGIN_REJECTED`); opaque session cookies scoped to `/api/v1/admin`; Argon2id password hashing; AES-256-GCM field encryption for TOTP secrets and private enquiry addresses; a fail-closed CAPTCHA verifier (now tested); server-side validation of uploaded bytes rather than declared types; allowlist HTML sanitisation; no secret material in either browser bundle; production start-up refused on an insecure mail relay; a `pageSize` ceiling and allowlisted sort keys that cannot be bypassed.

`pnpm audit --prod` reports 8 advisories (4 high, 4 moderate) — all transitive, all through Prisma or Refine. Each is dispositioned in `docs/security/dependency-advisories.md`; this audit added the three advisories that had appeared since the register was last reviewed, including a `mariadb` SQL-injection advisory that **does not apply** because it requires one of five Asian client character sets and every database, table and connection here is `utf8mb4` (confirmed against the audit database: 0 tables with any other collation).

## 7. What could not be audited

Stated plainly, because a report that omits these is misleading:

- **No production or staging environment exists.** Deployment, TLS, reverse-proxy behaviour, resource limits, log routing and staging parity were reviewed as documents only.
- **No monitoring or alerting is wired to anything** (F-listed as MON 001/002 not implemented). There is nothing to test.
- **No restore drill was run against production-like data.** The scripts and the documented drill exist; the drill was not executed here.
- **No external provider credentials.** Nothing was sent through Resend or SMTP; no Turnstile key exists; the S3 evidence is MinIO, not the production provider.
- **No manual screen-reader pass.**
- **No 30-minute capacity run.**

## 8. Audit artefact cleanup

Created and removed: the `melbourne_sphere_audit` and `melbourne_sphere_e2e` databases; one administrator (`audit.probe@melbournesphere.test`) and its sessions; four media assets and their MinIO objects; queue jobs on Redis database 5. One media-processing job leaked into the client's development queue (database 0) early in the audit, before isolation was tightened, and was removed — the development queue was verified empty afterwards.

`apps/api/.env` (git-ignored, never committed) gained the MinIO configuration described in F-10 and keeps it, because the alternative is leaving the media pipeline unexercised locally.

## 9. Changes made by this audit

| File | Change |
| --- | --- |
| `packages/domain/src/scheduled-tasks.ts` | `scheduledTaskJobId()` — job ids the queue accepts (F-01) |
| `packages/domain/src/scheduled-tasks.spec.ts` | new: 5 cases, no registered task can produce a rejected id |
| `apps/worker/src/schedule-runner.ts`, `apps/api/src/schedules/schedules.service.ts` | use the shared id builder (F-01) |
| `apps/api/test/schedules.integration-spec.ts` | dispatch through the **real** queue and read the job back (F-01) |
| `apps/worker/src/mailer/resend-mailer.ts` | new: Resend enquiry transport (F-02) |
| `apps/worker/src/config.ts`, `apps/worker/src/main.ts` | accept and select the Resend transport (F-02) |
| `apps/worker/src/config.spec.ts` | new case: the transport the API accepts, its validation, and no key in the error (F-02) |
| `apps/api/src/common/captcha/turnstile.verifier.spec.ts` | new: 7 cases for the public-write CAPTCHA (F-03) |
| `packages/ui/src/styles.css` | `--ms-glass-dark` 0.72 → 0.8 (F-04) |
| `apps/web/src/lib/palette.test.ts` | composite-contrast checks for translucent panels (F-04) |
| `e2e/specs/discovery.spec.ts`, `e2e/specs/accessibility.spec.ts`, `e2e/specs/authorization.spec.ts` | three stale expectations corrected (F-06/07/08) |
| `apps/api/test/authorization-audit.integration-spec.ts` | allowlist integrity asserted against the reflector; a stale entry removed |
| `apps/api/src/cli/audit-routes.ts`, `apps/api/package.json` | new `routes:matrix` command that reads what the guard reads |
| `docs/security/dependency-advisories.md` | three new advisories dispositioned |
| `docs/audits/*` | this report and its companions |

`apps/web` application code carries **no** diff from this audit: every 404 experiment was reverted.

---

# Addendum — post-audit remediation, 8 September 2026

The findings above are preserved exactly as they were recorded. This addendum
says what has since been done about them and what has not. Nothing above was
edited.

## Findings

| # | Finding | Status after remediation |
| --- | --- | --- |
| F-01 | Invalid BullMQ job ids stopped the worker | **Closed structurally.** Job-id construction is now one function, `queueJobId()` in `packages/domain/src/queue.ts`, which strips every character BullMQ refuses (`:` named explicitly), bounds the length and refuses an empty result. `assertQueueJobId()` gates the single enqueue boundary in `apps/api/src/outbox/bullmq.queue.ts`, so an invalid id fails where it is created, not where it is consumed. Proven by `apps/api/test/queue-dispatch.integration-spec.ts` (6 cases against real Redis/BullMQ): every registered task dispatches manually and on recovery; every job name round-trips; a `:` id is refused with the message naming the character; a repeated dispatch is one job keeping the first payload; a pre-existing persisted id remains reachable; and a real `Worker` retry preserves the same id and payload. |
| F-02 | Worker refused `MAIL_TRANSPORT=resend` | **Closed structurally.** API and worker read one list — `MAIL_TRANSPORTS` in `packages/mail/src/transports.ts` — with contract tests on both sides iterating it (`apps/api/src/config/env.validation.spec.ts`, `apps/worker/src/config.spec.ts`), so the two cannot drift again. The worker starts under `console`, `smtp` and `resend`. |
| F-05 | Empty server-rendered 404 body | **Not fixed.** See below. |
| F-09 | Browser suite outside the release gate | **Closed.** `pnpm test:browser` (`scripts/test-browser.mjs`) and `pnpm verify:release` added. See below. |
| MON 001–002 | No monitoring | **Implemented.** See below. |

## New defect found and fixed during remediation

**Provider credentials could reach an error message.** The Resend transport
summarised the provider's response body into the error it threw. A provider that
echoes the request — or an error body that quotes an `Authorization` header —
would have put the API key into a log, an admin screen and a stored failure
reason. `packages/mail/src/errors.ts` now redacts `re_…`, `whsec_…`,
`Bearer …` and `sk_…` patterns alongside the addresses it already redacted, and
both transports use it. The pre-existing assertion did not catch this because its
fixture never contained the key.

## Monitoring (SRS MON 001–002)

Implemented with `prom-client` 15 — provider-neutral OpenMetrics text, readable
by Prometheus or an OpenTelemetry collector. Full description in
`docs/operations/monitoring.md`; alert rules in
`docs/operations/alert-response.md`; drills in `docs/operations/failure-drills.md`.

* API `/metrics`, outside `/api/v1`, absent from the OpenAPI document, loopback-only
  unless `METRICS_TOKEN` is set, 404 (not 401) to anything else.
* Worker `/metrics` and `/health`, off unless `WORKER_METRICS_PORT` is set.
* Worker heartbeats in `ms:worker:heartbeat:<instanceId>` (15 s interval, 45 s
  expiry, one key per replica) carrying instance id, version, start time, last
  beat, queues and counters — no host detail, no environment values, no secrets.
* `WorkerLivenessService` separates Redis-unreachable, never-started,
  stopped, alive-but-stuck and alive-but-schedule-stopped, exposed at
  `GET /api/v1/admin/system/queues/workers` (`system.queues.view`) and rendered
  as the Workers card on the Queue Monitor.
* Structured JSON worker logs with `jobId`/`jobName`/`runnerId`/`taskCode`
  correlation, `LOG_LEVEL`-controlled, and a JSON line for start-up failure.
* No recipient address, message body, token, session or visitor-supplied path is
  a metric label; route labels are Nest patterns, never URLs. Asserted in
  `apps/api/src/observability/metrics.endpoint.spec.ts`.

Verified end to end on 8 September 2026: a worker started locally published a
heartbeat, the API's `/metrics` reported `ms_worker_heartbeats 1` with real queue
depths, and stopping the worker moved it to `0`.

## Release gate (F-09)

`pnpm test:browser` runs the Playwright suite against production builds on
free ports, creates and drops its own `melbourne_sphere_e2e_<random>` database,
provisions a temporary administrator with a generated password (no hard-coded
credentials), verifies MySQL and Redis before starting, treats **any** skipped or
missing test as a failure, stops only the processes it started, and cleans up on
failure as well as success. `pnpm verify:release` = `check` + `test:integration` +
`test:browser`. `pnpm check` still does not start infrastructure. A `browser` job
was added to `.github/workflows/ci.yml`; it is prepared, not connected to any
external account, and has not been pushed.

## F-05 — still open, and why

The empty 404 body is not a bug in this application's code. In Next.js 16 the
response body begins streaming as soon as a Suspense fallback renders or a Server
Component suspends; `notFound()` after that point cannot replace what has already
been sent. The installed documentation states this directly and offers the two
supported answers: ensure the resource exists *before* the body streams, or
rewrite to a not-found route in `proxy`. Both were implemented and tested during
this remediation:

* `global-not-found.tsx` already handles unmatched routes correctly — `/a/b/c`
  returns 404 with a complete 23 KB document.
* A `proxy` rewrite produced a correct 404 **with** a body for unknown paths, but
  required the API to answer a path-status query on every unmatched request, which
  is a new coupling and a new failure mode on the hot path.

The proxy work was reverted; the application is unchanged from the audit's state
and healthy. Recommended resolution remains the one the report gave: serve the
already-correct prerendered `_not-found.html` at the reverse proxy, where it costs
nothing and cannot fail, or revisit on the next Next.js patch. Recording this as
unfixed rather than claiming otherwise.
