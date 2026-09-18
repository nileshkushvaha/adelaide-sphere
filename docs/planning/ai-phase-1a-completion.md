# AI Content — Phase 1A implementation and handoff

**18 September 2026. Phase 1A only. Stop here pending owner approval; do not begin 1B.**

## Implemented

The existing admin now has AI Content overview, a manual Topic Queue, topic detail and AI Settings. The API owns bounded topic commands, filtering/pagination, versioned priority/batch reordering, pause/resume and cancellation/rejection with a reason. Existing settings, permissions, audit/activity, HTTP envelopes, validation, admin shell and database conventions are reused.
    
All automation is **execution-inactive**, even if a future mode or enable preference is saved. No provider/client framework, generation, research, Post integration, scheduler, worker, publishing or social functionality was added. No existing blog source files were changed. Existing unrelated backup and other working-tree changes were preserved.

## Migration and persistence

Migration: `20260918120000_ai_content_topics`. One additive table, `ai_content_items`, and the corresponding Prisma `AIContentItem` / `AITopicStatus` definitions. An optional creator foreign key links to AdminUser; deleting an administrator nulls the link, not the topic history.

Columns: `id`, `title` (180), `brief` (nullable, 2000), `priority` (0–1000 via API), `source` (manual), `status`, `reason` (nullable, 500), `createdByAdminId`, timestamps, `version`, `requestKey`, `payloadHash`, `activeTitleHash`. Unique request key and active-title fingerprint; status/priority/createdAt/id and creator indexes. Hash columns are private and excluded from API responses.

Only four states exist: **queued, paused, cancelled, rejected**. Queued ↔ paused; either active state may cancel/reject. Terminal history is immutable through this API. No processing states, Post relation, automation control table, run, operation, evidence, claim, approval, slot, budget or social tables were added. Settings versions provide sufficient control-plane concurrency because nothing executes yet.

**Applied only to `adelaide_sphere_test` on 127.0.0.1:3317** by the integration harness. That harness also applied the already-existing pending domain migration to the isolated test database. Development and production migrations were not run. No retained development/production tables were reset. The existing disposable test harness clears test fixtures between suites.

## Permissions and audit

New catalogue entries:

- `ai_content.view`: overview, queue and detail.
- `ai_content.manage_topics`: create, reprioritize, pause/resume, cancel/reject; mutations also require view.
- `ai_content.configure`: read/write AI Settings and their registry metadata.

No approval, generation or social permissions. Existing permission synchronization and Super Admin behaviour are retained; no `migratesFrom` grants copy unrelated roles into these capabilities. Run existing RBAC synchronization during rollout and explicitly assign access to other roles.

Transactional AuditLog actions: `ai_content.topic.created`, `.reprioritized`, `.paused`, `.resumed`, `.cancelled`, `.rejected`; `settings.ai_content.update`, `.enabled`, `.disabled`. Topic events belong to the existing Content activity area; settings events to Configuration. Before/after status/priority/version and safe setting values are recorded. Title, brief, cancellation/rejection prose and editorial strategy are not copied into audit metadata; a reason remains on the authorized topic record. Request fingerprints/keys are not logged.

## Settings

Stored in the existing Setting table under `(ai_content, defaults)`. Missing row serves version zero and defaults. Unknown keys—including secrets—are rejected. All values are configuration only in 1A; every screen explicitly states that execution is unavailable.

| Key | Default | Validation / meaning |
|---|---|---|
| enabled | false | Configured enable preference; never starts execution in 1A. |
| titleMode | manual | manual / automatic / hybrid. Only manual topic creation exists. |
| publicationMode | review_required | review_required / auto_publish; no publication integration. |
| imageMode | manual | manual / hybrid / automatic; no image calls. |
| location | Adelaide, South Australia | 1–180 characters. |
| editorialStrategy | Useful local discovery, city guides, food, cafes, local businesses and services, lifestyle, and reliably sourced events. | 1–2000 characters. |
| postingEnabled | false | Configuration only; no task registration. |
| targetPostsPerDay | 1 | Integer 1–24, not an active schedule. |
| timezone | Australia/Adelaide | This deployment accepts Australia/Adelaide only. |
| budgetEnabled | true | Future control preference; no spending/ledger exists. |
| budgetCurrency | AUD | AUD / USD / EUR / GBP; no FX conversion. |
| warningThreshold | 80 | Integer percent 1–100. |
| hardMonthlyLimitMinor | 0 | Integer 0–100,000,000 minor units; 100 = 1.00. Zero is no approved paid budget. |

Settings CAS now performs `updateMany` with `(group,key,expectedVersion)` and requires exactly one affected row, then reads the saved record in the same transaction. First-create uniqueness races and stale writes return `409 STALE_VERSION`. An ORM single-row version predicate was insufficient under the real concurrency test and was replaced with the explicit conditional update. Existing no-change saves remain no-ops. Audit and invalidation retain their existing transaction path; the new group does not invalidate public content caches. No settings schema/table duplication.

## API routes

All routes below use the existing `/api/v1` prefix, authenticated default-deny guard chain, no-store headers and `{data}` / `{data,meta}` / error envelopes. Existing session/origin protections apply. New write DTOs reject undeclared properties; page size ≤50 and reorder batches ≤50.

| Method | Route after `/api/v1` | Behaviour |
|---|---|---|
| GET | `/admin/ai-content/overview` | Configured enabled value, **executionActive:false**, real status counts. |
| POST | `/admin/ai-content/topics` | Required `Idempotency-Key` (16–100 ASCII letters/digits/hyphen/underscore); title, optional brief, priority. Returns existing topic on matching replay. |
| GET | `/admin/ai-content/topics` | page/pageSize, status and bounded title query `q`; fixed priority descending, createdAt/id ascending order. |
| GET | `/admin/ai-content/topics/:id` | Topic detail/provenance/reason/version; no private fingerprints. |
| PUT | `/admin/ai-content/topics/:id/priority` | `expectedVersion`, priority. |
| PUT | `/admin/ai-content/topics/reorder` | Atomic array of id/expectedVersion/priority entries; duplicate IDs rejected. |
| POST | `/admin/ai-content/topics/:id/actions` | expectedVersion and pause/resume/cancel/reject; cancellation/rejection require nonblank reason. |
| GET | `/admin/settings/ai-content` | Owned settings document and version. |
| PUT | `/admin/settings/ai-content` | expectedVersion and declared values; versioned merge. |

Existing `/admin/settings/registry` now includes the AI group only for authorized configurators. Topic create/action POST responses use the existing Nest convention of 201; priority/reorder and settings PUT return 200. Matching request replay returns the same entity's current state, not a newly created topic.

## Idempotency, ordering and failure handling

- Create request identity is SHA-256 of actor ID plus client key; payload hash includes all accepted title/brief/priority input. Same key/different payload returns `409 IDEMPOTENCY_MISMATCH` without mutation. Same key/same payload returns the existing topic, even after cancellation. Identity remains with history.
- NFKC, lowercase and collapsed punctuation/whitespace produce the active-title fingerprint. Queued **and paused** topics reserve it. Database uniqueness arbitrates two administrators concurrently; loser gets `409 DUPLICATE_ACTIVE_TOPIC`. Cancellation/rejection releases the active fingerprint but retains request identity/history. Titles are not globally unique forever. Semantic similarity and existing-Post dedupe are explicitly deferred to 1C.
- Topic mutations use a conditional version update. Concurrent cancel vs priority has one winner and one 409. Batch priority updates lock in stable ID order and all commit or all roll back. Equal priorities have deterministic creation/id order. Replaying an already-applied reorder with an old version returns 409 without another effect; a current-version no-op leaves version/timestamp unchanged.
- Only known rolled-back Prisma deadlocks (`P2034`) retry, at most three attempts with short delay. Unknown failures are not silently retried. Client create replay is safe after a lost response because item and audit commit together. Exhausted failures use existing safe error handling.
- Disabling AI changes only configuration; existing topics/history remain administrable. No worker/task observes these preferences in 1A.
- UI retains form values after validation/network/version failures, keeps the create request key for retry, and requires an explicit new-request action before changing request identity. Version conflicts require an explicit latest-version load before reapplying a topic action. Forms disable while saving; unsaved-change guards protect navigation. Settings reload requires confirmation before replacing unsaved inputs.

## Admin UI

Existing Editorial navigation adds AI Content, Topic Queue and AI Settings, each permission-filtered. Routes: `/admin/ai-content`, `/admin/ai-content/topics`, `/admin/ai-content/topics/:id`, `/admin/ai-content/settings`.

Overview shows configured state, inactive execution and actual queued/paused/cancelled/rejected counts. No fake generation/cost statistics. Queue supports server pagination/status/search, create, priority editing, pause/resume and reasoned terminal actions. Detail shows source/creator/timestamps/version/brief/reason. Existing editor is not duplicated. Desktop and 320px browser checks passed without page errors or horizontal page overflow; wide queue tables scroll within their container.

## Tests and verification

New tests cover normalization, state graph, payload identity, settings defaults/validation, bounded deadlock retries, real-MySQL concurrent creates and CAS, request replay/mismatch, terminal history, stale/batch updates, pagination/validation envelopes, permission denial, audit rollback, and admin forms/navigation/conflicts/actions/settings.

| Check | Result |
|---|---|
| Focused API units: topic rules, settings registry/store, permission/activity catalogues | 44 tests passed (5 files). |
| Phase 1A API + real MySQL integration | 10 tests passed; includes two-admin races, settings insert/update races, every new action's denial, audit rollback, no-op preservation. |
| Existing settings-groups integration | 11 tests passed. |
| Existing manual blog integration | 12 tests passed: existing manual create/edit/publish workflow; no blog implementation files changed. |
| Admin new tests and existing permissions/shell/security/general/home settings regressions | 30 tests passed across 6 files (8 new AI admin tests plus 22 existing regressions). |
| API and admin TypeScript checks | Passed. |
| API oxlint; focused admin ESLint | Passed. |
| Database build / client generation; migration policy check | Passed. |
| API build / OpenAPI and generated contracts; admin production build and bundle budget | Passed. |
| Browser runtime, desktop 1280 and mobile 320 | Create/reprioritize/pause/settings save passed, zero page errors and horizontal page overflow. API responses intercepted as fixtures; real API behaviour verified separately in MySQL integration. No live account credentials used. |

Full repository test suite, full release gate, unrelated worker/web suites, staging/production migration and live authenticated production UAT were **not run**: outside Phase 1A scope. Browser fixture execution is not represented as a live-database browser journey. Tests deliberately use synthetic Posts only inside the existing manual-blog test suite; the AI feature creates no Post or article. Initial sandbox database access failed; the authorized isolated MySQL checks were then run with the required local access. Transient test-fixture/typing failures were corrected before the results above.

## Environment and rollout

No packages, lockfile, environment files, secrets, infrastructure or worker settings changed. No service started or stopped; the existing admin server was left running. No production deployment, Git commit/push/branch or RBAC synchronization against retained environments was performed.

Deployment instructions (not executed here):

1. Review this scoped diff and additive migration; use the project's existing backup/release procedure and target the correct Sphere database. Do not reset data. Inspect pending migrations so unrelated work is not accidentally deployed.
2. Apply reviewed migrations using `pnpm db:migrate:deploy` in the target environment; regenerate/build with `pnpm db:build`, build API/admin using the existing pipeline.
3. Deploy API/admin as a compatible pair. Run `pnpm --filter api admin:seed-rbac` through the existing secure operational process; it registers catalogue entries and preserves grant migration behaviour. Grant the three capabilities deliberately to appropriate roles. No new worker build/task is required by 1A.
4. Confirm defaults remain configured disabled/posting disabled, execution is always inactive, and no provider credential is requested. Smoke-test read/create/pause/reorder/cancel with a designated non-production topic; verify audit and 409 behaviour. Clear neither history nor request identities to retry.
5. Stop. Do not enable future workstreams merely because a mode setting is present. Phase 1B needs separate owner approval.

Rollback: set configured enabled/postingEnabled false if desired; revoke the AI capabilities or roll back API/admin together to the previous compatible release. Keep `ai_content_items`, settings and audit history; do not execute a destructive down migration. Existing Post/manual publishing is independent. Extra permission rows can remain inert with older code; do not delete grants/history. Because no AI jobs, Post integration or scheduler exists, 1A has no in-flight provider/publication effects to reconcile.

## Intentional Phase 1B+ exclusions

Provider/model integration; paid calls; research/trends; semantic/whole-site novelty checks; generation and image briefs/assets; Post creation/application/human-edit protection for generated articles; AI review/approval/publishing gates; daily slots/queues/leases/control epochs; spending ledger; scheduler activation; social connections/intents/adapters; tenant/billing architecture. These remain requirements of later approved slices, not hidden partial implementations.

**Confirmation:** no provider was called, no AI Post/article was generated, no AI scheduler was registered or activated, no social feature was implemented. Phase 1A ends here.

## Exact changed files for this slice

The list below excludes pre-existing unrelated working-tree changes and the approved planning baseline.

- [apps/api/src/ai-content/ai-content.controller.ts](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/api/src/ai-content/ai-content.controller.ts)
- [apps/api/src/ai-content/ai-content.dto.ts](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/api/src/ai-content/ai-content.dto.ts)
- [apps/api/src/ai-content/ai-content.module.ts](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/api/src/ai-content/ai-content.module.ts)
- [apps/api/src/ai-content/ai-content.service.ts](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/api/src/ai-content/ai-content.service.ts)
- [apps/api/src/ai-content/topic-rules.ts](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/api/src/ai-content/topic-rules.ts)
- [apps/api/src/ai-content/topic-rules.spec.ts](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/api/src/ai-content/topic-rules.spec.ts)
- [apps/api/src/common/database-retry.ts](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/api/src/common/database-retry.ts)
- [apps/api/src/settings/ai-content-settings.ts](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/api/src/settings/ai-content-settings.ts)
- [apps/api/test/ai-content.integration-spec.ts](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/api/test/ai-content.integration-spec.ts)
- [apps/admin/src/api/ai-content.ts](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/admin/src/api/ai-content.ts)
- [apps/admin/src/pages/ai-content/AiContentPages.tsx](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/admin/src/pages/ai-content/AiContentPages.tsx)
- [apps/admin/src/pages/ai-content/AiSettingsPage.tsx](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/admin/src/pages/ai-content/AiSettingsPage.tsx)
- [apps/admin/src/pages/ai-content/AiContentPages.test.tsx](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/admin/src/pages/ai-content/AiContentPages.test.tsx)
- [packages/database/prisma/migrations/20260918120000_ai_content_topics/migration.sql](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/packages/database/prisma/migrations/20260918120000_ai_content_topics/migration.sql)
- [packages/database/prisma/schema.prisma](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/packages/database/prisma/schema.prisma)
- [packages/contracts/openapi/api.json](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/packages/contracts/openapi/api.json)
- [packages/contracts/src/api.d.ts](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/packages/contracts/src/api.d.ts)
- [apps/api/src/app.module.ts](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/api/src/app.module.ts)
- [apps/api/src/audit/activity-catalogue.ts](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/api/src/audit/activity-catalogue.ts)
- [apps/api/src/identity/permissions.ts](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/api/src/identity/permissions.ts)
- [apps/api/src/settings/registry.ts](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/api/src/settings/registry.ts)
- [apps/api/src/settings/settings-store.service.ts](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/api/src/settings/settings-store.service.ts)
- [apps/api/src/settings/settings-store.service.spec.ts](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/api/src/settings/settings-store.service.spec.ts)
- [apps/api/src/settings/settings-groups.controller.ts](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/api/src/settings/settings-groups.controller.ts)
- [apps/api/src/settings/dto/settings-registry.dto.ts](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/api/src/settings/dto/settings-registry.dto.ts)
- [apps/api/test/integration/harness.ts](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/api/test/integration/harness.ts)
- [apps/admin/src/api/settings-groups.ts](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/admin/src/api/settings-groups.ts)
- [apps/admin/src/app/routes.tsx](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/admin/src/app/routes.tsx)
- [apps/admin/src/auth/permissions.ts](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/admin/src/auth/permissions.ts)
- [apps/admin/src/layouts/AdminShell.tsx](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/admin/src/layouts/AdminShell.tsx)
- [apps/api/README.md](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/api/README.md)
- [apps/admin/README.md](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/apps/admin/README.md)
- [packages/database/README.md](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/packages/database/README.md)
- [docs/planning/ai-phase-1a-change-scope.md](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1a-change-scope.md)
- [docs/planning/ai-phase-1a-completion.md](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1a-completion.md)
- [docs/planning/ai-automation-requirement-matrix.md](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-automation-requirement-matrix.md)
- [docs/ai/current-state.md](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/ai/current-state.md)
- [docs/requirements-traceability.md](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/requirements-traceability.md)
- [docs/setup-progress.md](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/setup-progress.md)
