# AI Content — Phase 1C completion record

**18 September 2026. Workstream 1C, "Public retrieval, topic intelligence and research" (plan §O),** under the owner's Phase 1C pilot policy of 18 September 2026. Implemented and verified locally against the isolated `adelaide_sphere_test` database, plus one live free public retrieval. **Not migrated on any retained database, not deployed, and research only runs where automation is enabled** (the default is disabled). No paid call, provider, model, generation, image, cadence or social code was added. **Stopped before 1D.**

## 1. Workstream and entry audit

The 1B exit evidence was re-checked before starting. The 1A and 1B specs passed (28/28) after the 1C migration was applied to the test database. The owner's policy supplied 1C's remaining entry criterion (pilot editorial strategy and source policy). The 1B fixtures now also create a verified research packet, because the publication gate became stricter by design (§11).

**Method honesty.** With no paid model allowed, claims come from two free, deterministic places:

- schema.org structured data on retrieved pages;
- editor-entered claims whose excerpt must appear verbatim in the stored evidence text.

Pages without structured data yield evidence but no automatic claims. Similarity is token-based, not semantic. Anything uncertain goes to review (see §19).

## 2. Changed files (1C)

New:

- `packages/database/prisma/migrations/20260918170000_ai_content_research/migration.sql`
- `packages/domain/src/{ai-novelty,ai-research}.ts` and their specs
- `packages/database/src/automation/{novelty,research,discovery}.ts`
- `apps/worker/src/ai-content/{safe-fetch,extract,research}.ts` and the safe-fetch/extract specs
- `apps/api/src/ai-content/{ai-research.controller,ai-research.service,ai-research.dto}.ts`
- `apps/api/test/ai-content-research.integration-spec.ts`
- `apps/admin/src/pages/ai-content/{ResearchPanels,ResearchSourcesPage}.tsx`
- this record

Changed:

- `packages/database/{prisma/schema.prisma,src/index.ts,src/automation/{index,operations,apply}.ts,src/editorial/ai-publication.ts}`
- `packages/domain/{package.json,src/index.ts}`
- `apps/worker/src/ai-content/operations.ts`
- `apps/api/src/{blog/blog.service.ts,identity/permissions.ts,settings/ai-content-settings.ts}` and `apps/api/src/ai-content/{ai-content.module,ai-content.service,ai-content.dto}.ts`
- `apps/api/test/{integration/harness.ts,ai-content-editorial.integration-spec.ts}`
- `apps/admin/src/{api/ai-content.ts,app/routes.tsx,layouts/AdminShell.tsx,auth/permissions.ts,pages/ai-content/AiContentPages.tsx,pages/ai-content/AiContentPages.test.tsx}`
- `packages/contracts/*` (regenerated)
- status docs (§21)

## 3–4. Migration and schema

`20260918170000_ai_content_research` is additive. The migration policy check passes.

- `ai_automation_controls.inventoryEpoch`.
- `ai_content_items` gains: `selectionReason`; fingerprints `intentKey`, `eventKey`, `topicTokens` (indexed, non-unique); novelty status, epoch, time and bounded detail; `researchUrls` (≤10); topic approval by and at; follow-up post and justification.
- `ai_operations`: kinds `research` and `discovery`; `packetId`; `itemId` becomes nullable (for discovery).
- New tables:
  - `ai_research_sources` (registry: unique host, tier, optional same-host https feed, active, version);
  - `ai_research_packets` (unique item + version; status, reasons, changes, bounded published-only context, freshness);
  - `ai_source_evidence` (unique packet + url hash; tier, fetch status, content hash, ETag, source date, ≤20k characters of text, ≤50 KB of structured data; never overwritten);
  - `ai_fact_claims` (unique packet + claim key; typed kind, subject, value, materiality, origin, status, reason, event end, freshness, editor decisions, version);
  - `ai_claim_sources` (composite key, foreign keys with RESTRICT).

## 5. API

All routes sit under the existing default-deny chain. Every write needs view plus review, except the registry, which needs configure.

- `GET topics/:id/research`
- `POST topics/:id/novelty`
- `PUT topics/:id/sources`
- `POST topics/:id/research` (`approve` with optional justified follow-up, or `refresh`)
- `POST claims/:id/resolve` (`accept`, `exclude`, `reopen`)
- `POST packets/:id/claims`
- `POST discovery` (requires an Idempotency-Key)
- `GET discovery/:id`
- `GET`, `POST` and `PATCH sources`

Topic DTO fields were added and the overview reports research activity. Contracts are regenerated and `contracts:check` passes.

## 6. Settings

New keys:

- `discoveryKeywords` and `excludedKeywords` (niche terms, configuration only; nothing about Adelaide is hard-coded);
- `contextPostLimit` (1–10, default 5);
- `freshnessVolatileHours`, `freshnessIdentityDays`, `freshnessStableDays`, which can only shorten the approved 24 h / 7 d / 30 d ceilings.

Descriptions were updated. `location` supplies the geography words that novelty ignores.

## 7. Permissions

New permission `ai_content.review`: approve topics for research, refresh, add claims, resolve fact review, run discovery. The registry uses `ai_content.configure`. It is not granted automatically (run RBAC sync, then assign it).

## 8. Admin

- **Topic detail:** an overlap card (matches, reasons, re-check); a research-sources editor; research and fact review (approve, with a follow-up choice when overlap needs review; refresh; packet status, reasons, changes and related articles; a claims table with accept, exclude and reopen, each with a reason; an evidence table with `nofollow` external links; an evidence-backed claim form).
- **New pages:** Fact Review (first-class `needs_fact_review` queue) and Research Sources.
- **Queue:** "Find topic ideas" (discovery).
- **Navigation** is permission-filtered.

## 9. Worker

`ai.operation` now routes by kind:

- **Research** reads each source through the SSRF boundary, honouring robots.txt and skipping evidence already stored. It extends the lease per source, records evidence and claims under the lease, retries transient failures within the cap and never before Retry-After, then evaluates.
- **Discovery** reads configured feeds only when automation is on and the title mode is automatic or hybrid. It keeps items that are recent (≤14 days) and inside the niche, then records at most 5 candidates.

## 10. Security

The SSRF-safe egress boundary, `safe-fetch.ts`:

- https only; default port; no credentials or IP literals; no local or internal names;
- DNS resolved in-process, with every address required to be public unicast (private, loopback, link-local/metadata, CGNAT, multicast, reserved, ULA, mapped and NAT64 ranges refused);
- the connection pinned to the vetted address (TLS still verifies the name);
- manual redirects, at most 3, each hop re-validated;
- 10 s total deadline, including stalled bodies; byte cap after decompression; MIME allowlist;
- no cookies or auth; robots.txt honoured.

Source content is parsed as text and JSON only and never executed; injected instructions stay inert text (tested). Only public URLs leave the system; drafts, autosaves, enquiries, customer, admin and session data never do.

## 11. Idempotency and concurrency guarantees

- **Admission** holds the inventory row lock for the whole local novelty decision, so paraphrased topics approved at the same moment admit exactly one. Queued ideas never block each other; admitted items and rejected/cancelled history always count.
- **The inventory epoch** advances on human Post create, retitle, rewrite, slug change and restore, and on AI admission, cancel and reject. Research completion re-checks novelty when the epoch moved, so a new human article wins.
- **Operations:** a unique research operation per packet and a unique discovery run per request key. A signal's link is its permanent identity, so it is never re-proposed. Two workers produce one result; a lapsed or replaced worker commits nothing; recovery reclaims research and discovery (read-only kinds) from the database alone.
- **Evidence** is idempotent per packet and URL. A refresh creates a new packet version.
- **Publication guard:** the newest packet must be verified and inside every material claim's freshness window, and events must still be upcoming.

## 12–14. Tests added and checks executed (local, isolated)

| Check | Result |
|---|---|
| New `ai-content-research.integration-spec.ts` (T2/T3/T4/T5/T6/T8 and discovery; real MySQL, API and worker runners; fixture DNS and HTTP; real SSRF boundary) | **20/20** |
| Mutation checks: admission lock removed (failed 3/3 runs); SSRF address check disabled | Both caught; restored; both targeted tests pass unmutated |
| Domain T1: novelty 7, verification 9 | Passed |
| Worker: safe-fetch, extract, robots, including 4 live-found regressions | 44/44 |
| Admin: research panel decision with claim version, novelty refusal shown, review-permission hiding, Fact Review preset, registry validation | 16/16 in AI pages plus copy limit |
| Full `pnpm test` (all workspaces) | database 31, API 346, admin 352, web 260, domain 115, mail 40, worker 112: **all passed** |
| Full `pnpm test:integration` (final run, after all fixes) | database 5/5; API **40 files, 364/364** |
| Flakiness check after the clock fix: 1B + 1C specs together ×10 | **0 failures** (before the fix: 1 in about 5 runs) |
| `pnpm test:e2e`; typecheck; lint; migration policy; worker/admin/API builds; admin budget (entry 884 kB, first load 1605 kB); `contracts:check` | All pass (lint: only 6 pre-existing warnings in `packages/domain/src/media.ts`) |

**Test updates, not weakening:**

- The 1B spec fixtures add a verified packet (the gate is stricter).
- The admin notice assertion now reads "No provider is paid", because research truly fetches free public pages.
- The novelty review thresholds were **tightened** (Jaccard 0.4 / containment 0.6) after a real overlap case was found.

## 15. Live verification (free public GETs, allowed by the policy)

- www.sa.gov.au: HTTP 403 to automated clients; recorded as an HTTP error.
- adelaidecentralmarket.com.au: robots 200; the HTML stalled, and plain Node stalls too. It is now bounded as a timeout.
- www.cityofadelaide.com.au: robots honoured; page 200; typed claims extracted from its schema.org data.

This live run found two real bugs that fixtures could not, both fixed with regression tests:

1. **Pinned lookup under Node 24.** Node's `all: true` lookup broke every real request (they failed safe).
2. **Stalled compressed body.** A stalled or erroring compressed body could hang the read forever.

The integration suite also exposed an intermittent failure, traced to a real defect and fixed: an operation's first due time was stamped with the Node clock and claimed against the database clock. When Node ran a few milliseconds ahead, the first delivery found it "not yet due" and it waited up to five minutes for recovery. All due times are now database-clock values.

Browser checks were not performed: the dev database lacks the migrations and live admin checks would need credentials. Admin component tests cover the UI.

## 16–18. Environment, migration status and rollback

- No env, secret, package-version or infrastructure changes. The lockfile is unchanged in 1C.
- **Migrations are applied only to `adelaide_sphere_test`.** `adelaide_sphere_dev` is behind by the `.com` domain migration, 1A, 1B and 1C, so the user-started dev API cannot serve AI or blog-edit routes until the migrations are applied. **Retained, dev and production migrations remain unauthorized.**
- Nothing is deployed. Automation stays disabled by default, and research/discovery run only while enabled.
- **Rollback:** switch automation off (stops research and discovery immediately, and fences in-flight work); keep the additive tables; never run a destructive down migration. Older releases ignore the new tables.

## 19. Known limitations

- Claims come only from structured data or editor excerpts: no free-text claim extraction without a model.
- Similarity is token-based and conservative, not semantic. Paid semantic comparison stays disabled.
- The inventory lock serialises Post creation with admissions (acceptable at pilot scale).
- There is no scheduled discovery (cadence is 1F).
- robots.txt parsing covers group/prefix rules, not wildcards inside paths.
- Some official sites refuse or stall automated clients; those facts need editor-added evidence from a reachable source.
- AI jobs still share the existing queue and worker concurrency.

## 20. Unresolved requirements (for later phases)

- Generation-time claim coverage and unsupported-addition checks (1D).
- Approval command and `factCheck` binding to the packet (1D).
- Internal-link suggestions from the stored context (1D).
- Images (1E).
- Cadence and daily slots (1F).
- Auto-publish (1G).

## 21. Traceability

**Implemented and verified at pilot level:**

- Rows: AI-046 (manual + discovery), 048 (bounded published context), 088, 090 (deterministic plus editor, with the caveat above), 118–129, 202–205, 208, 219, 259–261 (research/claim audit), 264, 267, 270, 272, 275, 276, 280–286.
- SRS §7 rejected history; §9 source quality, cross-check, freshness, unresolved, publish gate, source failure, disagreement; §14 Needs Fact Review queue and source/research settings; §23 untrusted content.
- Failure modes F01 (discovery), F03, F04 (conservative), F10–F14, F31, F35, F36, F51, F55 (bounded).

Docs updated: implementation-plan status is unchanged; the requirement matrix, `requirements-traceability.md`, `setup-progress.md`, `current-state.md` and the READMEs have 1C notes.

## 22. Next workstream

**1D (text generation, budgets, protected review draft) is not eligible.** Plan §O entry: "Provider choice/secret/cost ceiling/byline approved; 1C accepted." None of these approvals exist, and the owner's 1C approval explicitly excludes them.

## 23. Owner decisions required to open 1D

1. **Provider and vendor/data policy:** which text provider (for example OpenAI, or another) is approved, and any data-location or vendor restrictions.
2. **Credentials:** provision the API key in the server's secret store (never in settings or chat).
3. **Model and price schedule:** which model(s) are approved and the pricing version to budget against.
4. **Spending limits:** billing currency, daily and monthly hard caps, and the warning threshold (the current `hardMonthlyLimitMinor` is 0, meaning no approved budget).
5. **Byline and disclosure:** which existing public author owns AI-assisted articles, and the reader-facing AI-assistance disclosure wording.
6. **1C acceptance:** review this pilot evidence and register the real Adelaide sources and feeds you want (the policy names categories, not specific hosts).
7. **Separately:** authorize applying the four pending migrations to the dev database (or run `pnpm db:migrate:deploy` yourself), and git commits when you want them.
