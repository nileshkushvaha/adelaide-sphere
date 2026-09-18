# AI Content — Phase 1F completion record

**19 September 2026. Workstream 1F, "Configured cadence and automatic topic selection" (plan §O),** under the owner's 1F decisions of 19 September 2026 (1E accepted the same day).

| Status | 1F |
|---|---|
| IMPLEMENTED | Yes (branch `claude/ai-content-phase-1`) |
| TESTED | Yes, locally, with fixed clock times |
| MIGRATED ON ISOLATED TEST DB | Yes (`adelaide_sphere_test`) |
| MIGRATED ON RETAINED DB | **Dev only** (19 Sep 2026, owner-authorised, after a dump); production is untouched. |
| DEPLOYED | **No** |
| ENABLED | **No.** The daily slot (`postingEnabled`) is off by default; automation is off. |
| LIVE PROVIDER TESTED | Not applicable: a slot makes no paid call. |

**Stopped before 1G.**

## 1. Owner decisions (19 September 2026) and entry

Entry criteria "1C–1E accepted; operating time, caps and missed-slot policy set" were met by the owner's answers:

| Question | Decision |
|---|---|
| What a slot may do on its own | **Select a topic and run free research only.** A person still clicks Generate draft, so a slot never makes a paid call, generates, schedules or publishes. |
| Slot time | **07:00 Australia/Adelaide, every day** (daylight saving handled) |
| Missed slot | **Require review.** Recorded with its reason; nothing catches up automatically. |
| Caps and topic source | **1 per day, 30 per month.** Only topics a person approved: the manual queue, or discovery ideas once approved. |

**Repository fact found at entry.** 1C's "approve for research" starts research at once. A daily slot needs topics a person approved but whose research has not started. So 1F adds **"approve for the daily slot"**: the same novelty admission, under the same inventory lock and follow-up rules, but the topic stays queued (`awaitingSlotSince`) until a slot takes it. This is not a conflict with the SRS or the plan.

**Deliberately not implemented** (they follow from the decisions above):

- automatic paid generation from a slot;
- the skip and next-slot missed policies;
- more than one slot per day;
- automatic topic generation.

Discovery stays manual, as in 1C: its ideas still need approval.

## 2. What was built

- **Calendar rules** (`packages/domain/src/ai-schedule.ts`):
  - local date and weekday in the configured zone;
  - `zonedTimeToUtc`: a repeated hour resolves to its first occurrence; a skipped hour lands after the gap, never lost or doubled;
  - strict parsing of the slot time and weekdays.
- **Settings:**
  - `postingEnabled` (the daily slot, default off);
  - `targetPostsPerDay` (limited to 1);
  - `slotTime` (07:00), `slotWeekdays` (all seven), `maxSlotsPerMonth` (30), `slotGraceMinutes` (60);
  - validation refuses a malformed time or weekday.
- **Schema** (`20260919140000_ai_content_schedule`, additive):
  - `ai_schedule_slots`: unique (strategy, local date, ordinal); zone; due time in UTC; settings version (recorded, **not** part of the key); state `filled | missed | reviewed`; reason; item; reviewer and note; version;
  - `ai_content_items.awaitingSlotSince`.
- **Planner** (`packages/database/src/automation/schedule.ts`), registered task `ai-content.plan-slots` (every 5 minutes, overlap-safe):
  - Inactive unless automation **and** the daily slot are on.
  - Considers today, and yesterday only if the schedule was running in the week before.
  - One transaction per day, in this order:
    1. inserts the unique slot row first, so a concurrent tick blocks and then rolls back entirely;
    2. checks lateness against the grace period (missed `not_started_in_time`);
    3. checks the monthly ceiling (missed `monthly_cap`);
    4. otherwise takes the highest-priority topic approved for the slot, re-checking novelty under the inventory lock, and starts its research.
  - An empty queue is missed `queue_empty`. A topic taken by a human article since approval is missed `no_eligible_topic:novelty_changed`; the topic is left queued for review.
- **Bounded AI consumer** (plan §E, 1F row "short scheduler + bounded AI consumer"):
  - AI operations go to their own queue `adelaide-sphere-ai` (`queueForJob`).
  - The worker runs a second consumer with `AI_WORKER_CONCURRENCY` (default 1, at most 4), so research and provider calls never take mail, media or cache capacity.
  - The main consumer still accepts an AI job left on the main queue by an earlier release.
  - The Queue Monitor lists the new queue (operation id only).
- **API** (default-deny):
  - research action `approve_for_slot` (`ai_content.review`);
  - `GET schedule` (view);
  - `POST slots/:id/review` (review; version check and a required note);
  - the topic DTO gains `awaitingSlotSince`.
- **Admin:**
  - "Approve for the daily slot" beside "Approve topic for research now", with a waiting notice;
  - the new **AI Schedule** page: time, next slot, month use against the ceiling, grace, the waiting queue, and every slot with state and reason;
  - "Mark reviewed" with a note for missed slots.

## 3. Changed files

New:

- `packages/domain/src/ai-schedule.ts` (+ spec)
- `packages/database/prisma/migrations/20260919140000_ai_content_schedule/migration.sql`
- `packages/database/src/automation/schedule.ts`
- `apps/api/test/ai-content-schedule.integration-spec.ts`
- `apps/admin/src/pages/ai-content/SchedulePage.tsx`
- this record

Changed:

- `packages/domain/src/{queue,scheduled-tasks,index}.ts`
- `packages/database/{prisma/schema.prisma,src/index.ts,src/automation/{index,research}.ts}`
- `apps/worker/{.env.example,src/config.ts,src/main.ts,src/scheduled-tasks.ts}`
- `apps/api/src/{outbox/bullmq.queue.ts,queues/queue-registry.ts,queues/queue-registry.spec.ts,settings/ai-content-settings.ts}` and `apps/api/src/ai-content/{ai-content.dto,ai-content.service,ai-generation.controller,ai-generation.dto,ai-generation.service,ai-research.dto,ai-research.service}.ts`
- `apps/api/test/{integration/harness.ts,queue-dispatch.integration-spec.ts}`
- `apps/admin/src/{api/ai-content.ts,app/routes.tsx,auth/permissions.ts,layouts/AdminShell.tsx,pages/ai-content/{ResearchPanels,AiContentPages.test}.tsx}`
- `packages/contracts/*` (regenerated)

## 4. Tests and checks (local, isolated)

| Check | Result |
|---|---|
| New `ai-content-schedule.integration-spec.ts` (real MySQL/API, fixed clock) | **6/6** |
| Domain `ai-schedule.spec.ts` (07:00 in standard and daylight time, both change days including the skipped and repeated hour, local date and weekday, parsing, queue routing) | 5/5 |
| Admin (approve for slot, Schedule page with review note, renamed approve button) and API queue registry | pass |
| Full gate | see §8 |

The integration spec covers:

- admission without research; nothing runs while off, not yet due, or with automation off;
- three concurrent ticks make one slot and start one piece of research, of the highest-priority approved topic; only a `research` operation exists, with no generation, image or post;
- later ticks do nothing; the next day takes the next topic;
- an unapproved queued topic is never taken;
- an empty queue and a late start are missed; a day the worker was fully down is missed once, with no catch-up;
- review needs the review permission, a note and the current version;
- the monthly ceiling, weekdays, and refusal of a malformed time or weekday;
- a human article since approval leaves the topic for review; a paused topic is skipped;
- 07:00 across the start of daylight saving.

## 5. Mutation checks (1F spec, each restored)

| Mutation | Caught |
|---|---|
| No unique day (random ordinal, no existence check) | yes |
| No grace period | yes |
| No monthly ceiling | yes |
| No novelty re-check at slot time | yes |
| Slot takes unapproved queued topics | yes |
| Weekdays ignored | yes |

## 6. Security and data flow

- A slot only reads settings and topics, then starts the existing free, SSRF-safe research. It makes no provider call, spends nothing, and has no path to publication.
- Only topics a person approved (attributable `topicApprovedBy`) are taken.
- Every slot outcome and review is audited (`ai_content.slot.*`, `ai_content.topic.approved_for_slot`, `ai_content.research.started_by_slot`).

## 7. Deployment and rollback

**Deployment (not done):**

1. ~~Apply the migration on dev~~: done 19 Sep 2026 (owner-authorised).
2. Deploy API and worker together: the API sends AI jobs to the new queue, and only the new worker consumes it.
3. Turn on the daily slot and approve topics for it when ready.

**Rollback:**

- Turn the daily slot off (it stops at once).
- Topics waiting for a slot stay queued; approve them for research manually or cancel them.
- Keep the additive table.
- Rolling the worker back to a release without the AI consumer leaves AI jobs waiting on the AI queue. Roll back API and worker together, or drain first.

## 8. Final checks (all local, isolated)

| Check | Result |
|---|---|
| `pnpm test` | database 31, API 346, admin 362, web 260, domain 141, mail 40, worker 131: **all passed** |
| `pnpm test:integration` | database 5/5; API **43 files, 399/399** |
| `pnpm test:e2e` | 20/20 |
| typecheck, lint, API/admin/worker builds, web `tsc`, `contracts:check`, `db:migrations:check` | pass |

**Test updates, not weakening:**

- Two 1A tests and one 1B test used `targetPostsPerDay: 2/7` as an arbitrary setting change. That setting is now limited to 1 (owner decision), so they use `maxSlotsPerMonth` instead, testing the same behaviour.
- The admin test uses the renamed "Approve topic for research now" button.
- The queue-dispatch and queue-registry tests expect the new AI queue.

## 9. Known limitations

- The Scheduled Tasks registry shows the slot task; its runs are the usual task runs.
- A slot considers only today and yesterday, by design (no catch-up).
- "Approve for the daily slot" is available only for queued topics (not failed ones).

## 10. Traceability

Implemented at pilot level:

- **SRS §15:**
  - AI-183 (one per day, configurable, as a ceiling);
  - AI-184 (the existing scheduler: registered task);
  - AI-185 (explicit site timezone);
  - AI-186 (eligible items only, atomic claim);
  - AI-187 (no duplicate slot for multiple invocations);
  - AI-188 (missed policy: require review only; skip and next-slot not implemented, by owner decision);
  - AI-189 (pause: daily-slot switch, topic pause);
  - AI-190 (per-day and per-month slot caps).
- **SRS §17:** duplicate triggers.
- **SRS §26:** "Same cron runs on two servers", "Timezone/DST shift".
- **Failure modes:** F01, F28, F29, F35 (empty queue visible), F55 (bounded batch; separate AI consumer).
- **Plan T10** scheduling and time cases.

**Open:** automatic paid generation from a slot and automatic topic generation (owner decision: not now); the skip and next-slot policies.

## 11. Next workstream

1G (auto-publish hardening and Phase 1 acceptance) is **not started**. Per plan §O it needs reviewed pilot evidence and an explicit owner decision to enable an auto policy.
