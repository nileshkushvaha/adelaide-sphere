# AI Content — Phase 1B completion record

**18 September 2026. Workstream 1B, "Canonical integration and durable execution foundation" (plan §O).** Implemented and verified locally against the isolated `adelaide_sphere_test` database. **Not migrated on any retained database, not deployed and not enabled.** No provider, research, generation, image, discovery, cadence or social code was added. No paid or external call was made.

## 1. Pre-implementation audit and differences from the approved design

Phase 1A was re-verified against code and by running its tests: 97 API unit tests (ai-content, settings, identity, audit) and 33 real-MySQL integration tests (1A + existing settings + existing blog) passed before any 1B edit. The report's claims matched the code, with these findings:

| Finding | Effect |
|---|---|
| 1A files are uncommitted/untracked on `master`; `origin/master` (4961d0e) has none of them. The runbook deploys a git SHA, so "deployed" cannot be traced to a commit. | Not a design conflict. Recorded; 1B is built on the same working tree. **Owner action**: commit/label the accepted baseline (needs your authorization). |
| 1A's full admin suite was not run in 1A: its notice string (164 characters) broke the admin helper-text limit test (110). | Fixed in 1B (the only 1A UI copy change). |
| 1A stored `paused` as an item status (4-value enum). The plan's lifecycle has 12 states. | Additive: the enum gained the 8 SRS states; `paused` stays as the pre-processing hold. No redesign. |
| 1A omitted the plan's control row ("nothing executes yet"). | Added in 1B as `ai_automation_controls` (epoch). |
| 1A put the transition rules in `apps/api/src/ai-content/topic-rules.ts`; the plan's N1 location is `packages/domain`. | The pure transition table moved to `packages/domain/src/ai-content.ts` (the worker needs it). Hashing stays backend-only. |
| Plan E4 findings were still true: the scheduled publisher wrote no `post.published` event, and both paths evaluated blockers outside the transaction. | Parity added. The AI checks run inside the committing transaction. The pre-existing out-of-transaction checklist for ordinary posts is unchanged (known limitation, below). |
| The plan's 1B scope says slot/budget structures "as needed". | Not needed without cadence or paid calls. Deferred to 1F/1D, so there's no speculative infrastructure. |
| The approved master SRS DOCX is referenced but absent from the repo. The Markdown copy's SHA-256 matches the matrix (`6fb01027…`). | Used the Markdown copy, as the matrix already does. |

No material conflict between the SRS/plan and the repository was found.

## 2. Exact changed files (1B only)

New: `packages/database/prisma/migrations/20260918150000_ai_content_editorial_foundation/migration.sql`, `packages/database/src/retry.ts`, `packages/database/src/editorial/{index,sanitise,content-media,material,revisions,ai-publication,scheduled-publication}.ts`, `packages/database/src/automation/{index,control,operations,apply,apply.spec}.ts`, `packages/domain/src/ai-content.ts`, `packages/domain/src/ai-content.spec.ts`, `apps/worker/src/ai-content/operations.ts`, `apps/worker/src/ai-content/operations.spec.ts`, `apps/api/test/ai-content-editorial.integration-spec.ts`, this record.

Changed: `packages/database/{prisma/schema.prisma,package.json,src/index.ts}`, `packages/domain/{package.json,src/index.ts,src/queue.ts,src/queue.spec.ts,src/scheduled-tasks.ts}`, `pnpm-lock.yaml` (workspace links only; no new package versions), `apps/api/src/blog/{blog.service,sanitise}.ts`, `apps/api/src/media/content-media.ts`, `apps/api/src/common/database-retry.ts`, `apps/api/src/outbox/{outbox.service,outbox.dispatcher}.ts`, `apps/api/src/settings/settings-store.service.ts`, `apps/api/src/ai-content/{ai-content.service,ai-content.dto,topic-rules,topic-rules.spec}.ts`, `apps/api/test/{integration/harness.ts,ai-content.integration-spec.ts,queue-dispatch.integration-spec.ts}`, `apps/worker/src/{main,scheduled-tasks,scheduled-tasks.spec}.ts`, `apps/admin/src/api/ai-content.ts`, `apps/admin/src/pages/ai-content/{AiContentPages,AiContentPages.test}.tsx`, `packages/contracts/{openapi/api.json,src/api.d.ts}` (regenerated), READMEs and planning/status docs listed in §22.

`prisma format` also realigned whitespace across `schema.prisma`. `git diff -w` shows only the 1B additions.

## 3–4. Migration and schema

`20260918150000_ai_content_editorial_foundation` is additive only. The migration policy check passes.

- `ai_content_items`: the enum gains `researching, generating, needs_fact_review, ready_for_review, approved, scheduled, published, failed`; existing values are kept. New columns: `postId` (unique, FK `posts` RESTRICT, set once), `humanModifiedAt` / `humanModifiedByAdminId` (sticky, FK SET NULL), `failureStage`, `failureCode`.
- `ai_automation_controls`: one row `default` (seeded) holding `epoch`.
- `ai_generation_runs`: unique `(itemId, generationVersion)`. Holds settings version and control epoch at start, expected Post version and material hash, bounded artifact and its hash, `factCheck` (pending/passed/failed; only 1C may set passed), and the applied version and hash.
- `ai_operations`: unique `operationKey`, kind `apply`, state, attempts, `nextAttemptAt`, `lastEnqueuedAt`, `leaseOwner`, `leaseUntil`, `fencingToken`, `controlEpoch`, `resultCode`.
- `ai_approvals`: immutable content approval bound to Post id, version and material hash, with admin (SET NULL) and reason. Invalidation is a stamp (`invalidatedAt`, `invalidationReason`), never a rewrite.

No Post column or data changes. No FK cascades delete history.

## 5. API and contracts

No new routes. The Topic DTO gains `postId`, `humanModifiedAt`, `failureStage`, `failureCode`; the status enum and overview counts cover the 12 states. Topic `cancel` is now also allowed from researching/generating/failed, and fences operations. `reject` is allowed from ready_for_review/needs_fact_review. Cancel is refused for `scheduled`. Blog publish and schedule return the existing `409 PUBLICATION_BLOCKED` with AI reasons for linked articles. The OpenAPI JSON and types are regenerated; `contracts:check` passes.

## 6–7. Settings and permissions

There are no new settings keys. Any `ai_content` settings save that changes a key other than `location` or `editorialStrategy` advances the control epoch in the same transaction, which fences in-flight work. There are no new permissions: apply is a worker system action (null actor), and publishing still requires `posts.publish`.

## 8. Admin changes

Status labels now come from the shared domain list. Topic detail shows the linked article (a link to the existing editor), the sticky human-edit notice and the failure stage and code. The 1A notice was shortened to meet the admin copy limit. The existing Post editor is reused unchanged: `PUBLICATION_BLOCKED` reasons already render there.

## 9. Worker changes

`content.publish-scheduled` delegates each article to the shared `publishDueScheduledPost`. New job `ai.operation` (claim, then apply). BullMQ retries are not used; the database owns them. New registered task `ai-content.recover-operations` (every 5 minutes, overlap-safe, required for correctness). With AI switched off it has nothing to do.

## 10–11. Security, idempotency and concurrency guarantees

- **One seam, two paths.** `@adelaide-sphere/database/editorial` (backend-only subpath) holds the sanitiser and media-reference sync (moved; the API modules re-export them), revisions, the material hash, and `aiPublicationDecision`. The decision is called inside the committing transaction by `BlogService.transition` (publish/schedule) and by `publishDueScheduledPost`. BlogService remains the HTTP/policy entrypoint and the worker task remains the scheduled entrypoint.
- **Eligibility (fail-closed).** An item must be approved/scheduled/published. There must be a non-invalidated admin approval whose material hash equals the article's current hash, and the latest applied run must have `factCheck=passed`. Author and category must still be active at commit. The scheduled path additionally needs automation enabled. Unlinked articles do one indexed lookup and are otherwise untouched; a human article is never adopted.
- **Lock order everywhere:** Post, then item, then run/operation/approval.
- **Atomic mapping.** Post creation and `item.postId` commit together. The unique `postId` plus a unique `operationKey` and `(item, generationVersion)` mean a repeat gives one article.
- **Human protection.** Update, restore and slug-change open/close a human-edit handle in their transactions. A material change sets sticky `humanModifiedAt` and invalidates non-matching approvals; `approved` returns to `ready_for_review`. Automated apply requires an unchanged Post version and hash, no human modification, `draft` status and never-published. Otherwise the artifact is stored as a **proposal** and the article is untouched.
- **Leases and fencing.** Claims, extensions and assertions use the database clock (`UTC_TIMESTAMP(3)`). The fencing token increments on every claim. Every worker write asserts `(running, owner, token, unexpired)` under the row lock, and `finishOperation` repeats it. A lapsed lease never commits and is never treated as proof of failure. Recovery reclaims only DB-local kinds (`apply`).
- **Retries.** Only known rolled-back deadlocks retry inside a transaction (≤3). Attempt failures back off and re-deliver through the outbox. The cap (3) ends in operation `failed` with item `failed(application, attempts_exhausted)`. Validation or slug conflicts fail permanently with no retry storm.
- **Kill epoch.** A disable or safety-setting change mid-run gives `proposal:automation_disabled` or `proposal:control_changed`.
- **No network calls inside transactions.** There are no network calls in 1B at all. Every consequential AI audit entry and outbox row is written in the same transaction.
- **Event parity.** Both publishing paths write `post.published` (same type, resource, version and payload shape) together with cache invalidation and audit. The dispatcher still marks it dispatched (no consumer until Phase 2).
- **Recovery independent of BullMQ.** Pending operations not re-delivered within 5 minutes get a new outbox event; the queue is only a carrier.

## 12–14. Tests added and exact checks executed (all local, isolated)

| Check | Result |
|---|---|
| New `ai-content-editorial.integration-spec.ts` (T2/T3/T5/T6, real MySQL + API) | **18/18 passed** |
| Mutation checks on that spec: disable manual guard; disable scheduled guard; remove lease assertion | Each made the suite fail (the last after adding the lapsed-lease case), then restored |
| Full `pnpm test:integration` (database + API) | database 5/5; API **39 files, 344/344 passed** (after two expected test updates, below) |
| Full `pnpm test` (all workspaces) | database 31, API 346, admin 347, web 260, domain 99, mail 40, worker 71: **all passed** |
| `pnpm test:e2e` (API, no DB) | 20/20 passed |
| `pnpm typecheck`, `pnpm lint` | Pass. The only warnings are 6 existing `no-useless-escape` warnings in `packages/domain/src/media.ts` (not touched). |
| `db:migrations:check`, `db:build`, worker/admin/API builds, admin `budget`, `contracts:check` | Pass. Admin bundle entry 881 kB, first load 1601 kB. |
| Server-only boundary | No admin, web or ui source or manifest references `@adelaide-sphere/database`; the domain lifecycle module has no imports |

New tests: domain lifecycle (4; all SRS prohibitions AI-194–200), artifact validation and material hash (4), topic actions over the lifecycle (1), worker job handler and task registration (3), admin topic detail (1), and the integration spec above.

**Test updates, not weakening:** the pinned job-name list now includes `ai.operation`. The queue-dispatch test dispatches the new job through the real port. The 1A filter test now rejects the non-status `processing` instead of `generating`, which is now an SRS state, and asserts that `generating` filters. The worker publisher mock returns "no linked item" and now also asserts `post.published` parity. Admin fixtures carry the four new fields.

## 15. Browser checks

**Not performed.** The user-started API watch on 4001 serves the new code against `adelaide_sphere_dev`, which lacks three migrations: `20260917190000_domain_com_au_to_com`, 1A and 1B. Live admin checks would also need credentials, which are never typed. The topic-detail rendering is covered by the admin component test.

## 16–18. Environment, migration status and rollback

- There are no env, secret or infrastructure changes and no new package versions. Nothing was started or stopped. The user's API watch restarted itself on source changes.
- **Applied only to `adelaide_sphere_test`.** The dev database is behind by the 3 migrations above.
- **Consequence to act on:** until `pnpm db:migrate:deploy` runs against dev, the dev API's blog edit, publish, restore and slug routes fail. They now look up `ai_content_items`, which is absent on dev. AI routes already failed there before this session.
- Production: none.
- **Rollout (when authorized):** back up, `pnpm db:migrate:deploy`, deploy API and worker together (old workers without the AI guard must not coexist once AI posts exist; today none exist), and keep automation disabled.
- **Rollback:** leave the tables in place and never run a destructive down migration. With no AI-linked Posts, an older release is behaviourally identical for ordinary posts. Once AI Posts exist, roll back only after unscheduling or holding them (plan §M).

## 19–20. Known limitations and unresolved requirements

- The ordinary-post publication checklist is still evaluated outside the transaction (pre-existing). The AI guard re-checks author and category inside it for AI articles.
- Approval and fact-check writers do not exist yet. They are 1D and 1C respectively, so no AI article can currently pass the gate: fail-closed by design.
- The generation provenance fields (prompt/model/provider/schema versions, cost) are 1D. The inventory epoch, novelty, evidence and claims are 1C. Slots, quotas and budgets are 1D/1F. Images are 1E.
- AI jobs share the existing queue and worker concurrency. A separate bounded AI consumer is needed before long provider calls (1C/1D).
- There is no recovery path for external-effect kinds yet (none exist). Outcome-unknown handling must be added with the first external kind.

## 21. Traceability

**Implemented and verified (foundation level):** AI-055, 173, 192, 194–200 (transition table), 202, 203, 204, 206, 207 (DB-local), 208, 210, 212, 214, 264 (recovery), 270, 271, 272 (publish path), 275, 276, 287, 292, 293, 296, and F02, F18, F19, F20, F22, F24, F25, F37, F38, F39, F41, F42, F51, F52 for AI articles.

**Enforcement present, completion in later phases:** AI-054, 124, 170, 171, 172, 294 (gate present; 1C/1D add the verifier and approval), and AI-058, 136, 215 (run record present; provenance fields in 1D).

## 22. Next eligible workstream

**1C (research and novelty) is not eligible yet.** Its entry criteria are "1B invariants proven" (met, locally) **and** "editorial strategy/source policy approved for pilot", which is an owner decision that has not been given.

## 23. Owner actions

1. Approve the pilot editorial strategy and the free public source policy (source list, freshness and corroboration rules) to open 1C.
2. Authorize applying the pending migrations (the domain one, 1A and 1B) to the dev database, or run `pnpm db:migrate:deploy` yourself.
3. Commit or label the accepted 1A baseline and this 1B work (needs your git authorization).
