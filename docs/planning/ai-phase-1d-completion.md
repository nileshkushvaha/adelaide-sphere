# AI Content — Phase 1D completion record

**18 September 2026. Workstream 1D, "Text generation, budgets and protected review draft" (plan §O),** under the owner's Phase 1D decisions of 18 September 2026 (1C accepted in the same instruction).

| Status | 1D |
|---|---|
| IMPLEMENTED | Yes (branch `claude/ai-content-phase-1`, uncommitted at the time of writing) |
| TESTED | Yes, locally: fakes and fixtures only |
| MIGRATED ON ISOLATED TEST DB | Yes (`adelaide_sphere_test`) |
| MIGRATED ON RETAINED DB | **No** (dev is 5 migrations behind; production untouched) |
| DEPLOYED | **No** |
| ENABLED | **No** (automation disabled by default; no approved price; no byline chosen) |
| LIVE PROVIDER TESTED | **No.** No server-side `OPENAI_API_KEY` is configured and no live call was authorised. **No external paid call was made.** |

**Stopped before 1E.**

## 1. Owner decisions applied

- **Provider and models.** Provider is the OpenAI API behind a provider-neutral adapter: the domain and database layers only know `TextRequest` and `TextProvider`. The approved models are code constants (`APPROVED_TEXT_MODELS`), not settings, so a model ID changes only through a reviewed code change:
  - `gpt-5.6-terra` for article prose;
  - `gpt-5.6-luna` only for light work (title/SEO/summary suggestions as proposals).
  - `gpt-5.6-sol` is not declared. There is no automatic fallback.
  - Every call is checked against the declared capabilities (role, structured output, output cap, context) before any reservation.
- **Research.** Only the 1C verified packet is factual authority. Model output is checked against it (§6) and never becomes evidence. No second-model corroboration; paid research stays off.
- **Data policy.** The request (`buildRequest`) contains only:
  - topic title and location;
  - the editorial strategy and category/tags;
  - verified claims (excerpts ≤ 300 characters, ≤ 60 claims) and their public source URLs;
  - published related articles from the bounded context.

  No drafts, autosaves, enquiries, contact, admin, session or secret data. The exact payload is stored with the operation (`requestPayload`) for audit.
- **Budget.** Defaults: USD; daily 50 minor (USD 0.50); monthly 1000 (USD 10.00); warning 70%; per-workflow 25 (USD 0.25).
  - Unknown price → refused.
  - Unknown cost → the full reservation is recorded as spent (`uncertain`), never zero.
  - Metadata suggestions and regenerations each reserve independently.
- **Authorship.** `articleAuthorId` defaults to empty. Generation refuses until an existing active author is chosen (validated in settings and at request time). No AI author exists.
- **Disclosure.** The owner's text is the `disclosureText` setting default, not hard-coded in services. Each run stores the text and its hash. The public article shows the disclosure of the latest applied run (`aiDisclosure`).
- **Operating mode.** Unchanged defaults:
  - manual topic;
  - review required;
  - manual images (prompt-only briefs);
  - auto-publish, cadence, paid image and paid research off.

  Publication still needs the 1C fact certificate, the 1B canonical guard and a human approval, now also bound to the research packet (§7).

## 2. Changed files

New:

- `packages/domain/src/ai-generation.ts` (+ spec)
- `packages/database/prisma/migrations/20260918190000_ai_content_generation/migration.sql`
- `packages/database/src/automation/{budget,providers,generation,review}.ts`
- `apps/worker/src/ai-content/{text-provider,openai-provider,generation}.ts` (+ `openai-provider.spec.ts`)
- `apps/api/src/ai-content/ai-generation.{controller,service,dto}.ts`
- `apps/api/test/ai-content-generation.integration-spec.ts`
- `apps/admin/src/pages/ai-content/{GenerationPanels,PricingPage}.tsx`
- this record

Changed:

- `packages/database/{prisma/schema.prisma,src/index.ts,src/automation/{index,apply,operations,research}.ts,src/editorial/ai-publication.ts}`
- `packages/domain/src/index.ts`
- `apps/worker/{.env.example,src/config.ts,src/main.ts,src/ai-content/operations.ts}`
- `apps/api/src/{identity/permissions.ts,settings/ai-content-settings.ts,settings/settings-groups.controller.ts,blog/blog-public.service.ts,blog/dto/public-post.dto.ts}` and `apps/api/src/ai-content/{ai-content.module,ai-content.service,ai-content.dto,topic-rules.spec}.ts`
- `apps/api/test/{integration/harness.ts,ai-content.integration-spec.ts,ai-content-editorial.integration-spec.ts}`
- `apps/web/src/components/article-view.tsx`
- `apps/admin/src/{api/ai-content.ts,app/routes.tsx,auth/permissions.ts,layouts/AdminShell.tsx,pages/ai-content/{AiContentPages,AiContentPages.test,AiSettingsPage}.tsx}`
- `packages/contracts/*` (regenerated)

## 3. Migration and schema

`20260918190000_ai_content_generation` is additive: new tables, new columns, enum widening only. The schema-vs-migration diff is empty and the migration policy check passes.

- **`ai_price_schedules`:** version, provider, model, service tier, currency, input/cached/output micro-units per million tokens, long-context threshold, source URL, effective date, and status `proposed | approved | retired`.

  Two **proposed** (not approved) versions are seeded from the official pricing page (checked 18 Sep 2026, standard tier):
  - `openai-gpt-5.6-terra-2026-07-30`: USD 2.00 / 0.20 / 12.00;
  - `openai-gpt-5.6-luna-2026-07-30`: USD 0.20 / 0.02 / 1.20.
- **`ai_budget_buckets`:** unique scope + period + currency, with reserved and settled micro-units.
- **`ai_operations`:**
  - kind `generate` and state `outcome_unknown`;
  - scope, provider, model, provider phase (`prepared | sending | sent | done`), request hash and payload, unique provider response id, `sentAt`;
  - price schedule, estimated/reserved/settled micro-units, cost state, bucket ids and token counts;
  - error class, requesting admin and resolution note.
- **`ai_generation_runs`:** provenance (scope, provider, model, prompt/schema versions and hashes, research packet id/hash, disclosure text/hash, operation, coverage result, image briefs, internal links).
- Other tables:
  - `ai_approvals` gains the research packet id and hash;
  - `ai_research_packets` gains `contentHash`;
  - `ai_content_items` gains `categoryId`;
  - `ai_automation_controls` gains `paidCallsHaltedAt` and `paidHaltReason`.

## 4. Adapter and capabilities

The adapter (`openai-provider.ts`) uses the Responses API in background mode (`background: true`, `store: false`, `service_tier: 'default'`, strict `json_schema`) and polls `GET /v1/responses/{id}`. The key is read from `OPENAI_API_KEY` in the worker's environment only, and is sent only in the `Authorization` header.

Outcome classes:

- **Permanent:** 400, 401, 403, 404, 422, and 429 with `insufficient_quota`.
- **Retryable, no charge assumed:** 429 (rate limit) and 503, never sooner than Retry-After.
- **Unknown:** 500, 502, 504, network loss, timeout, or a success without an id. Unknown is never retried automatically.

Refusal, incomplete output or missing usage are reported as such, never as success or zero cost. Provider idempotency keys are not relied on.

## 5. Budget, pricing and settlement

Order of checks before any send:

1. capability;
2. an approved price (exactly one per model, same currency as the budget);
3. the worst case (`maxCallCostMicros`: input bytes as tokens plus the output cap). A request that could enter the long-context band is refused.
4. The per-workflow cap, then the day bucket and month bucket, row-locked in a fixed order inside one transaction. A warning is audited at 70%.

Settlement happens once, from reported usage (cached input included, rounded up). The global paid-call halt is set when:

- the reported model or tier differs;
- usage is unpriceable;
- actual cost exceeds the reservation.

Only `ai_content.configure` can clear the halt, with a note. A price change is a new version; approving one retires the previous one.

## 6. Generation and fact coverage

- **Full generation** (`researching` or `ready_for_review` item with a fresh verified packet) produces a structured article: sections, claim citations, FAQ, SEO, image briefs and internal-link choices from the supplied published context. Output is rendered into the existing Markdown body. Model markup is escaped, and links are only our own resolved paths.
- **Coverage.** Every text unit (title, summary, SEO, sections, FAQ, alt text) is checked:
  - every factual value (time, price, number, day, contact, link) must match a cited verified claim;
  - every proper name must be supported by the packet.

  Any violation sends the item to Needs Fact Review with the violations listed. It can only leave by a person editing the draft and re-checking.
- **Metadata scope** uses the light model and creates a proposal only.
- **Human protection.** A result for a human-edited, moved or published article is kept as a proposal. It is applied only by `runs/:id/apply` against the article version the person compared (CAS). A published article is never regenerated.

## 7. API and admin

All routes are under the default-deny chain in `/api/v1/admin/ai-content`.

| Route | Permission |
|---|---|
| `PUT topics/:id/article` (category) | view + review |
| `POST topics/:id/generate` (Idempotency-Key required) | view + **generate** |
| `GET topics/:id/generation` | view |
| `POST topics/:id/approve` | view + **approve** |
| `POST topics/:id/recheck-facts` | view + review |
| `POST runs/:id/apply` | view + generate + `posts.update` |
| `POST operations/:id/resolve` | view + configure |
| `GET budget` | view |
| `POST budget/resume` | configure |
| `GET`/`POST prices`, `POST prices/:id/approve` | configure |

The new permissions `ai_content.generate` and `ai_content.approve` are not granted automatically (run RBAC sync, then assign).

- **Approval** is bound to the Post version, material hash, packet id and packet `contentHash`. The shared publication policy now refuses when research changed after approval.
- **Admin screens:**
  - an article card (generate, approve, re-check, proposals and diff/apply, run history with cost and provenance);
  - a budget card;
  - the AI pricing page;
  - author select and disclosure in settings.
- The route permission map now also covers the 1C Fact Review, Sources and new Pricing routes (a 1C gap, fixed).

## 8. Tests and checks run (local, isolated)

| Check | Result |
|---|---|
| New `ai-content-generation.integration-spec.ts` (real MySQL, API and worker runner; fake provider) | **16/16**. Covers: prerequisites, missing credential, one draft/one send, unsupported fact to fact review, approval binding, research change, daily-cap race, per-article cap, model/usage discrepancy halt, unknown outcome, lost worker mid-send vs after acceptance, Retry-After, permanent refusal, proposal on human edit, light-model metadata, no regeneration after publish, permission denials |
| Domain `ai-generation.spec.ts` | 13/13 |
| Worker adapter spec (no network) | passed; worker suite 126/126 |
| Admin (generation, pricing, settings, permissions) | admin suite 356/356 |
| `pnpm test` | database 31, API 346, admin 356, web 260, domain 128, mail 40, worker 126: **all passed** |
| `pnpm test:integration` | database 5/5; API **41 files, 380/380** |
| 1A/1B specs after fixture updates (research-bound approvals, owner defaults) | passed within the above |
| `pnpm test:e2e` | 20/20 |
| typecheck, lint, API/admin/worker builds, web `tsc` | pass (web not rebuilt: `next dev` is running) |
| `contracts:check`, `db:migrations:check` | pass |

In one full integration run, 8 admin-lifecycle tests hit their 30 s timeout. They passed in isolation and in the full rerun. This was load, not code: those tests are unrelated to 1D.

**Test updates, not weakening:**

- The 1A/1B default assertions now expect the owner's budget.
- The 1B approval fixtures record the research packet, because the guard is stricter.

## 9. Mutation checks (each run against the full spec, then restored)

| Mutation | Caught |
|---|---|
| M1 daily-cap check removed | yes (race test) |
| M2 coverage check bypassed | yes |
| M3 approval–research binding removed from the publication guard | yes |
| M4 lost send treated as retryable | yes |
| M5 unpriceable usage settled as zero | yes |
| M6 approval allowed without a passing fact check | at first **no**. A human-edit unsupported-fact test was added, and it is now caught |

This proves that:

- duplicates cannot create a second Post or repeat a paid call;
- racing reservations cannot exceed the caps;
- unsupported facts cannot reach Ready or Approved.

## 10. External calls, security and data flow

- **External calls made:** none. The worker builds the OpenAI provider only when a key is present. None is present locally, so generation fails closed ("no credential") and releases the reservation (tested).
- **Secrets:** only an empty `OPENAI_API_KEY=` placeholder in `.env.example`. The changed files were scanned: no keys. The key is never logged, stored or returned.
- **Model output is untrusted text.** It passes a strict schema, bounded lengths and escaping. Links come only from our own resolved paths.

## 11. Deployment requirements (not done)

1. Authorise and apply the 5 pending migrations on dev (`.com` domain, 1A, 1B, 1C, 1D). Production follows the normal release path.
2. Set `OPENAI_API_KEY` in the worker's server secret store only.
3. Run RBAC sync and assign `ai_content.review`, `ai_content.generate` and `ai_content.approve`.
4. Check and **approve** the two seeded price versions on the Pricing page.
5. Choose the article author, and enable automation.
6. Optionally, run the controlled live smoke test (one Terra call within the USD 0.25 cap) once separately authorised.

## 12. Rollback

- Disable automation: it fences in-flight work and stops new sends. Alternatively, leave paid calls halted.
- Remove the key.
- Keep the additive tables. Older releases ignore them. Never run a destructive down migration.
- The public disclosure field is optional and absent without AI runs.

## 13. Known limitations

- Name and value coverage is deterministic and conservative. Paraphrased facts are sent to fact review rather than guessed.
- The token estimate uses bytes, deliberately over-reserving.
- Unknown outcomes need an operator: reconcile if a provider id exists, otherwise abandon, recorded as the full reservation.
- There is no provider usage-report reconciliation job (a manual price review only).
- Image briefs are text only (1E).
- AI jobs share the existing queue.

## 14. Traceability

Implemented and verified at pilot level (fakes only):

- **Rows:** AI-047, 054, 079, 090, 093 (review path; auto-publish eligibility stays 1G), 056, 058, 080, 091, 092 (without images), 048/110/111 (bounded published context and internal links), 082 (review mode).
- **SRS §:** budget, unknown outcome, disclosure and byline rules.
- **Failure modes:** unknown provider outcome, budget race, price drift, unsupported fact, human-edit overwrite.

Not complete: 1E images (AI-049/081), 1F cadence, 1G auto-publish, Phase 2.

## 15. Owner decisions required to open 1E

See the final report of this session. In short: the image approach (paid generation or not), provider/model and price, image budget, required vs optional featured image, and credit/disclosure wording for AI images.
