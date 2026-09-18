# Phase 1A change scope — inspected before implementation

Approved scope: disabled automation configuration and manual topic administration only. No material conflict with the approved baseline. The owner's explicit instruction permits storing future mode choices, with all execution inactive and clearly labelled; no provider placeholders or execution hooks will be added.

## Minimal schema

One new `AIContentItem` / `ai_content_items` table: id; title VARCHAR(180); optional brief VARCHAR(2000); priority integer (0–1000); source `manual`; status enum queued/paused/cancelled/rejected; optional reason VARCHAR(500); nullable creator FK to AdminUser; createdAt/updatedAt; version; unique requestKey SHA-256 scoped to creator; payloadHash SHA-256; nullable unique activeTitleHash SHA-256. Index status/priority/createdAt/id. Queued and paused reserve a normalized title; cancelled/rejected release that reservation while retaining history and request replay identity.

Reuse Setting for all configuration, AuditLog for transactional activity, existing RBAC synchronization for three new capabilities. No automation control row is needed without execution. No future run/operation/evidence/approval/slot/budget/social tables. No Post columns or changes.

## Exact intended file surface (repository relative)

- New: `packages/database/prisma/migrations/20260918120000_ai_content_topics/migration.sql`; extend `packages/database/prisma/schema.prisma` only with topic enum/model and AdminUser backrelation.
- New: `apps/api/src/ai-content/ai-content.module.ts`, `ai-content.controller.ts`, `ai-content.service.ts`, `ai-content.dto.ts`, `topic-rules.ts`, `topic-rules.spec.ts`.
- Extend: `apps/api/src/app.module.ts`, `identity/permissions.ts`, `audit/activity-catalogue.ts` (and target labels if needed).
- New: `apps/api/src/settings/ai-content-settings.ts`; extend `settings/registry.ts`, `settings/settings-store.service.ts`, `settings/settings-groups.controller.ts`, `settings/dto/settings-registry.dto.ts`, related settings tests. The existing shared store receives only a version-predicate update/create-conflict correction and safe AI audit metadata.
- New: `apps/admin/src/api/ai-content.ts`, `apps/admin/src/pages/ai-content/AiContentPages.tsx`, `AiSettingsPage.tsx`, adjacent tests.
- Extend: `apps/admin/src/api/settings-groups.ts`, `app/routes.tsx`, `layouts/AdminShell.tsx`, `auth/permissions.ts`; existing permission/navigation tests where necessary.
- New: `apps/api/test/ai-content.integration-spec.ts`; extend integration harness table list and scoped regression tests as necessary.
- Regenerate existing `packages/contracts/openapi/api.json` and generated API types through existing command.
- Documentation: this scope, Phase 1A completion record, `docs/ai/current-state.md`, `docs/requirements-traceability.md`, `docs/setup-progress.md`, appropriate API/admin/database README references and approved AI matrix progress note.

No other application areas are intended to change. Test failures will be assessed for relation to this work before changing scope. Existing unrelated working-tree edits remain untouched.

## Final scope reconciliation

Implementation also adds `apps/api/src/common/database-retry.ts`, a bounded retry helper for known Prisma transaction rollback errors shared by topic actions and the settings CAS correction. No unknown/ambiguous failure is blindly retried. Completion evidence and exact final manifest: [Phase 1A completion report](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1a-completion.md). No later phase was started.
