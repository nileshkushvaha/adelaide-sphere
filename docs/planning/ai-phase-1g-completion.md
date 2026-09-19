# AI Content — Phase 1G completion record

**19 September 2026. Workstream 1G, "Auto-publish hardening and Phase 1 acceptance" (plan §O),** under the owner's 1G decisions of 19 September 2026 (1F accepted the same day).

| Status | 1G |
|---|---|
| IMPLEMENTED | Yes (branch `claude/ai-content-phase-1`) |
| TESTED | Yes, locally: fakes, isolated test database |
| MIGRATED ON ISOLATED TEST DB | Yes (`adelaide_sphere_test`) |
| MIGRATED ON RETAINED DB | **Dev only** (19 Sep 2026, owner-authorised, after a dump); production is untouched. |
| DEPLOYED / ENABLED / LIVE PROVIDER TESTED | **No / No / No** |
| PHASE 1 ACCEPTED | **No.** Pilot evidence and owner acceptance are open (`ai-phase-1-acceptance.md`). |

**Phase 1 implementation is complete. Phase 2 has not been started.**

## 1. Entry and owner decisions

**Plan entry criteria:** "reviewed pilot evidence acceptable; owner explicitly enables auto policy". At entry the repository showed:

- no pilot evidence exists (no provider key, no live call, nothing deployed);
- auto-publishing conflicts with the owner's approved rule that a person confirms every AI article's facts.

These were put to the owner, who decided:

| Question | Decision |
|---|---|
| Auto-publishing | **Harden only; auto-publish stays OFF.** Saving `auto_publish` is now refused. |
| Pilot | **Build now; the pilot remains an open acceptance item.** |
| Alerts | **Existing alert rules and metrics, plus the admin dashboard** |
| Retention of private AI working data | **180 days** after a topic is finished |

## 2. What was built

- **Final publication checks**, in the shared policy used by admin publish and schedule and by the scheduled publisher:
  - **Novelty at publication:** a human article on the same topic published since admission blocks it. A recorded, justified follow-up may still overlap. (`assessNovelty` gained `excludePostId`, so an article is never compared with itself.)
  - **Internal links:** every `/blog/...` link must lead to a currently published article (F26).
- **Conservative settings:** `publicationMode: auto_publish` is refused, like automatic images.
- **Recovery:** a failed first draft can be retried ("Retry draft"), as a new, separately budgeted request, once nothing is in flight or unresolved (SRS §25).
- **Operator signals:**
  - one read, `aiAttention`, feeds both the AI Content dashboard "Needs attention" card and eight new gauges `as_ai_*` (counts and ages only, refreshed on scrape);
  - alert rules AI1–AI6 in `docs/operations/alert-response.md`, and the metrics in `docs/operations/monitoring.md`;
  - the AI queue's depth and age come from the existing queue gauges.
- **Retention:** the daily task `ai-content.retention` (03:40), setting `aiRetentionDays` (default 180, 30–3650). For finished topics only, once per item under its row lock, it removes:
  - provider request payloads;
  - retrieved page text and structured data;
  - draft output (replaced by a marker);
  - image prompts.

  It keeps hashes, costs, approvals and fact confirmations, claims with excerpts, published articles and media, and the audit trail (`ai_content.retention.purged`). Migration `20260919180000_ai_content_retention` adds `privateDataPurgedAt`.
- **Rollout and rollback:** `docs/operations/ai-content-runbook.md` covers deploy order, enabling, the pilot checklist, operation, the kill switch, retention and rollback.
- **Phase 1 acceptance:** `docs/planning/ai-phase-1-acceptance.md`, with every checklist row and its status.

## 3. Changed files

New:

- `packages/database/src/automation/{attention,retention}.ts`
- `packages/database/prisma/migrations/20260919180000_ai_content_retention/migration.sql`
- `apps/api/test/ai-content-hardening.integration-spec.ts`
- `docs/operations/ai-content-runbook.md`
- `docs/planning/ai-phase-1-acceptance.md`
- this record

Changed:

- `packages/database/{prisma/schema.prisma,src/automation/{index,novelty,generation}.ts,src/editorial/ai-publication.ts}`
- `packages/domain/src/scheduled-tasks.ts`
- `apps/worker/src/scheduled-tasks.ts`
- `apps/api/src/{observability/metrics.registry.ts,observability/metrics.collector.ts,settings/ai-content-settings.ts,ai-content/ai-content.service.ts,ai-content/topic-rules.spec.ts}`
- `apps/admin/src/{api/ai-content.ts,pages/ai-content/{AiContentPages,AiContentPages.test,GenerationPanels}.tsx}`
- `docs/operations/{alert-response,monitoring}.md`
- `packages/contracts/*` (regenerated)

## 4. Tests and checks (local, isolated)

| Check | Result |
|---|---|
| New `ai-content-hardening.integration-spec.ts` | **6/6** |
| Admin (attention card, quiet state, Retry draft) | 29/29 in the AI pages and copy suites |
| `pnpm test` | database 31, API 346, admin 365, web 260, domain 141, mail 40, worker 131: **all passed** |
| `pnpm test:integration` | database 5/5; API **44 files, 405/405** |
| `pnpm test:e2e` | 20/20 |
| typecheck, lint, builds (web `tsc` only), `contracts:check`, `db:migrations:check` | pass |
| After the `auto_publish` refusal (added once the gate had started) | API unit 346/346; 1A, settings-groups and 1G integration 27/27; lint; contracts: pass |

The hardening spec covers:

- publication refused when a human article on the topic appeared later (the human article is unaffected);
- publication refused while an internal link leads to an unpublished article, and allowed again once it is republished;
- the kill switch refusing research, generation, image and slot at once, with no operation created;
- retry of a failed first draft (two budgeted requests, one article);
- retention purging only an expired finished topic, keeping what explains it, idempotent, never touching in-progress work;
- the dashboard attention figures and the `as_ai_*` series, with bounded labels only (no titles, ids or URLs).

**Test update, not weakening:** the settings rules test now expects `auto_publish` to be refused.

## 5. Mutation checks (1G spec, each restored)

| Mutation | Caught |
|---|---|
| Novelty re-check at publication removed | yes |
| Internal-link check removed | yes |
| Retry of a failed draft disallowed | yes |
| Retention allowed to purge in-progress topics | yes |

## 6. Security and data flow

- New metrics expose counts and ages only.
- Retention removes private text and never public or approval records.
- No new external calls, secrets or permissions.

## 7. Environment

- The 1G migration is on the test database and, owner-authorised (19 Sep 2026, after a dump), on dev: its schema is up to date.
- **At the end of this workstream, none of the dev servers were running** (web 4000, API 4001, admin 4002: no listener). They were up earlier in the session. They were not stopped by this work, and they were not restarted, because they are user-started processes.

## 8. Rollback

- The runbook §7.
- Retention can be slowed or stopped by raising `aiRetentionDays` (to at most 3650), or by switching the task off under Scheduled Tasks. It is not required for correctness.

## 9. Open items (for acceptance)

- The pilot (runbook §3) and owner review.
- Stable production observation.
- The owner's decision on the partly met rows AI-379, AI-384 and AI-386.
- The owner's Phase 1 acceptance.
- Phase 2 needs separate approval after that.
