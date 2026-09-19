# AI Content — rollout, operation and rollback runbook

Phase 1G, 19 September 2026. Covers the AI Content feature (Phases 1A–1G) on the **existing** Adelaide Sphere stack. Nothing here applies to any other project on the host.

**Operating policy (owner decisions):**

- Review required: auto-publishing is not approved and cannot be saved.
- Every AI article needs a person to confirm its facts and approve it.
- Images are hybrid: made only on request, and approved by a person.
- The daily slot (07:00 Australia/Adelaide, at most 30 a month) only starts free research.
- Paid providers: OpenAI (text `gpt-5.6-terra` / `gpt-5.6-luna`; images `gpt-image-2.5-flare`), within approved prices and budgets.

## 1. Deploy (in this order)

1. **Back up** the target database (the existing backup procedure). Confirm that the dump completed.
2. **Migrate**: `pnpm db:migrate:deploy`. All AI migrations are additive; there is no data rewrite.
   - The AI-relevant ones: `20260918120000`, `…150000`, `…170000`, `…190000`, `…210000`, `20260919100000`, `…140000`, `…180000`.
3. **Deploy API and worker together**, from the same commit.
   - The API sends AI jobs to the `adelaide-sphere-ai` queue, and only the new worker consumes it.
   - The worker also still accepts AI jobs left on the main queue.
   - An old worker must never run alongside AI articles, because it lacks the publication guards.
4. **RBAC**: run the existing permission sync (`pnpm --filter api admin:seed-rbac`). Then assign deliberately:
   - `ai_content.view`, `.manage_topics`, `.review`, `.generate`, `.approve`, `.configure`.
   - Publishing still needs `posts.publish`.
5. **Secrets**: set `OPENAI_API_KEY` (and, for the image candidates, `XAI_API_KEY` / `GEMINI_API_KEY`) in the **worker's** server environment only, from separately billed API accounts, never consumer plans or the Gemini free tier. Never put them in settings, chat or a repository. Without a key, that provider is never called; without an approved price, no provider is.
6. **Worker settings**: `AI_WORKER_CONCURRENCY` (default 1, at most 4).

Automation stays **off** after deploy. Nothing happens until step 7.

## 2. Enable, deliberately

In the admin:

1. **AI Pricing:** propose and approve prices, from the official pricing page.
   - Terra and Luna.
   - For images, the size and quality you use, **with a per-image output-token bound** from your own evidence (the provider publishes none for 2.5-flare).
2. **AI Settings:**
   - the author of AI-assisted articles (an existing active author) and the disclosure wording;
   - text budget (USD 0.50 per day / 10.00 per month / 0.25 per article by default);
   - image budget (0 until set);
   - image mode (hybrid);
   - then **AI automation enabled**.
3. **Research Sources:** register the official sources for your topics.
4. **Daily slot** (optional): turn on "Daily slot enabled". Then approve topics with "Approve for the daily slot".

## 3. Pilot (the Phase 1 acceptance evidence still outstanding)

> **Image-provider pilot** (provider amendment 01 §23): use **Compare providers** on an article in review (needs `ai_content.generate` + `ai_content.configure`). Check the quoted total, then run. Review the results side by side and approve at most one through the normal approval. Read the recorded facts under **AI pricing → Image pilot evidence**. The hard ceiling is set by the image budget (375/375 minor for USD 3.75, corrected for configuration-dependent prices); raise `maxWorkflowCostMinor` to 75 for the pilot and restore 25 afterwards. Keep the pilot manual: `titleMode` manual, `postingEnabled` off and `publicationMode` review_required. For xAI, approve one price per resolution and quality used; a billed cost that does not match halts paid calls.

Run 1–3 controlled articles end to end and record, for each:

- **Topic and research:** the topic and the verified research packet (sources and dates).
- **Draft:** the generated draft, and every change a person made.
- **Facts:** the fact-review outcome.
- **Image:** if generated, the prompt, the image, the alt text written from it, and the disclosure.
- **Cost:** reserved, settled and uncertain amounts from the topic's history and the AI budget card, compared with the provider's usage page. They must agree. A mismatch halts paid calls by design (alert AI2).
- **Timing:** each step, and any alert that fired.

Review the drafts for accuracy and usefulness before publishing each one manually. Record the evidence in `docs/planning/ai-phase-1-acceptance.md`.

## 4. Operate

| Situation | Where | What to do |
|---|---|---|
| Needs attention on the AI Content dashboard | AI Content | Each line links to where to act; the same figures drive alerts AI1–AI6 (`alert-response.md`) |
| Unknown outcome (AI1) | Topic → history, or the image card | Check the provider dashboard. **Abandon** (counts the full reservation) or **Look up again** (text with a response id). Never re-generate first: the system refuses. |
| Paid calls halted (AI2) | AI Pricing | Reconcile the price, model or usage; approve a new price version if needed; **Resume after reconciling** with a note |
| Fact review | Fact Review | Fix unsupported statements, **Re-check**, then **Confirm facts** with a note, bound to that version |
| Missed slot (AI5) | AI Schedule | Fix the cause (queue empty, late worker, monthly cap, topic overlap); **Mark reviewed** with a note. Never caught up. |
| Failed first draft | Topic | **Retry draft**: a new, separately budgeted request |
| Work not moving (AI6) | Queue Monitor, Scheduled Tasks | Worker and AI consumer running? Recovery redelivers from the database every 5 minutes and never re-sends a paid request |

**Publication** is always a person's action: the article editor's Publish or Schedule. It is guarded by the shared AI policy on both paths, which requires all of these:

- approval of the exact version;
- a fact confirmation bound to the current research;
- fresh evidence;
- a ready featured image (any AI image approved as it stands);
- active author and category;
- the topic still new, with no newer article on it;
- all internal links published;
- automation on (for scheduled publication).

## 5. Kill switch

**AI Settings → turn off "AI automation enabled".** Immediately:

- No research, discovery, slot, draft or image request starts. In-flight operations are fenced (the control epoch advances), so late results are kept as proposals and never applied.
- **Scheduled AI articles are held.** Human publishing of ordinary articles is unaffected.
- Nothing is deleted.

A narrower stop:

- **Daily slot enabled** off: slots only.
- **Image mode** manual: no image generation.
- A budget set to 0: no paid calls of that kind.

## 6. Retention

The daily task `ai-content.retention` (03:40) removes the private working data of topics finished more than `aiRetentionDays` ago (default **180**):

- **Removed:** request payloads, retrieved page text, draft output and image prompts.
- **Kept:** identities and hashes, costs, approvals and fact confirmations, claims with short excerpts and source links, published articles and media, and the audit trail.

Topics still in progress are never touched.

## 7. Rollback

1. **Kill switch first** (§5).
2. Roll API and worker back **together** to a release that still has the AI publication guards (Phase 1B or later).
   - Never deploy a pre-AI release while AI articles exist: it would not know that a scheduled AI article needs approval.
   - If a pre-AI rollback is unavoidable, first unschedule or hold every AI article.
3. Leave all AI tables in place. **Never** run a destructive down migration. Older releases ignore the additive tables and columns.
4. AI jobs waiting on `adelaide-sphere-ai` stay recorded in the database. The recovery task of a release with the AI consumer redelivers them.

## 8. What is not built (owner decisions)

- Auto-publishing (setting refused).
- Automatic image generation (refused).
- Automatic paid drafts from the daily slot.
- Skip and next-slot missed policies.
- Supporting images.
- Phase 2 social.
