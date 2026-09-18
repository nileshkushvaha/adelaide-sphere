# AI Content — Phase 1E completion record

**19 September 2026. Workstream 1E, "Complete image modes" (plan §O),** under the owner's Phase 1E image decisions (1D accepted, with its review fixes, the same day).

| Status | 1E |
|---|---|
| IMPLEMENTED | Yes (branch `claude/ai-content-phase-1`) |
| TESTED | Yes, locally: fakes, fixtures and in-memory storage only |
| MIGRATED ON ISOLATED TEST DB | Yes (`adelaide_sphere_test`) |
| MIGRATED ON RETAINED DB | **Dev only** (19 Sep 2026, owner-authorised, after a dump); production is untouched. |
| DEPLOYED | **No** |
| ENABLED | **No.** Automation is off, no image price is approved, and the image budget is zero. |
| LIVE PROVIDER TESTED | **No.** No key is configured and no live call was authorised. **No external paid call was made.** |

**Stopped before 1F.**

## 1. Entry audit

- **Documents re-read:** the master AI SRS (§12 images, §17 idempotency, §19 budget, §20 providers, §25–26 failures), the implementation plan (§E, §H, §I, §L F16/F17/F32, §N T9, §O 1E), the requirement-matrix rows for 1E, and the 1A–1D completion records.
- **1D invariants re-checked before any 1E change:** the four AI specs plus the blog spec passed, 79/79.
- **Existing media pipeline audited (authoritative, reused unchanged):**
  - `MediaAsset` quarantine, then validation, then `media.uploaded` outbox, then worker `processMediaAsset` (re-encoded WebP variants, EXIF dropped), then `ready`;
  - rights and credit fields; `Post.coverMediaId` and `coverAlt`, both part of the material hash.
- **Official provider facts checked before coding** (developers.openai.com, 19 Sep 2026):
  - `POST /v1/images/generations`;
  - current models `gpt-image-2.5-flare` (fast, everyday) and `gpt-image-2.5-sunburst` (editing precision);
  - base64 output only (no URL) for GPT image models;
  - sizes 1024×1024 / 1536×1024 / 1024×1536; quality low to max;
  - `usage` reported in tokens; no Idempotency-Key; no background mode;
  - standard price: USD 5.00 per 1M text-input tokens, 30.00 per 1M image-output tokens;
  - **no official per-image output-token count for 2.5-flare** (§12).

### Differences from the plan, recorded as owner decisions, not contradictions

1. **Automatic image mode.** The plan's 1E exit says "all three modes work". The owner's 1E decision is automatic generation OFF, paid images only through an explicit Generate Image action.
   - Automatic is therefore **not implemented**: saving it is refused (`imageMode: "Automatic image generation is not approved"`), and any unknown mode acts as manual.
   - The matrix rows for the automatic mode remain open.
2. **The existing public caption said "Photograph: {credit}".** Storing the AI disclosure as a credit would have printed "Photograph: Illustrative image created with AI." Instead the disclosure has its own field (`coverDisclosure`) and caption. Photographer credits are unchanged.

## 2. Owner decisions applied

| Decision | Implementation |
|---|---|
| Hybrid initially; prompt-only by default | Setting `imageMode` defaults to `hybrid`. Nothing is generated until a person clicks Generate image. There is a per-article override (`manual`, `hybrid`, or null to follow the setting). |
| Paid image only by explicit action; automatic OFF | The only path is `POST topics/:id/images` (needs `ai_content.generate`, an Idempotency-Key and a confirmation dialog). No task or worker ever requests one. |
| OpenAI first, provider-neutral | `ImageProvider` interface in the worker; `OpenAiImageProvider` adapter. Domain and database code know only `ImageRequest`. The approved model is a code constant (`APPROVED_IMAGE_MODEL = gpt-image-2.5-flare`), checked against declared capabilities before any reservation. |
| Pricing proposed until admin approval | An image price must name its size, quality and a per-image output-token bound (§12). No image price is seeded. Unknown price or bound means `PRICE_UNKNOWN`. |
| Separate image budget | New bucket scopes `image_day` and `image_month`. Settings `imageDailyLimitMinor` and `imageMonthlyLimitMinor` default to **0** (no image spend until you set them). The per-article cap is cumulative across text **and** images. The paid-call halt is shared. |
| One generated featured image; supporting images OFF | One slot (`featured`); a regeneration is the next explicit image version. There is no supporting-image slot. |
| A READY featured image is required, and may be uploaded | `featuredImageRequired` (default true) is enforced in the shared publication policy. An uploaded or library image needs no AI approval; existing media, rights and alt rules apply to it. |
| Every AI image needs human approval; alt text from the actual image | `POST images/:id/approve` (`ai_content.approve` + `posts.update`) is refused until the asset is `ready`. It requires alt text typed by the person, never the pre-generation draft (`altTextProblem`), plus the confirmation `altWrittenFromImage: true`. |
| Approval bound to version and hash; regeneration or replacement invalidates it | The approval records the asset checksum, an alt-text hash, the disclosure hash and the article version. The gate re-checks all three at publish. A newer image version supersedes it. |
| Never depict a named real establishment as evidence | The prompt screen refuses any named place, business, event or person (only the configured location's words are allowed). A fixed illustrative-only policy is appended (`image-policy.v1`). Readers see the disclosure. |
| Disclosure "Illustrative image created with AI." | Setting `imageDisclosureText`, not hard-coded in reusable logic. Each image records its wording and hash. It is shown only for an approved AI cover. |
| Media pipeline authoritative; no provider URL public | The worker validates bytes like an upload, writes them to the **private quarantine bucket** under a server key, and creates a quarantined `MediaAsset` plus `media.uploaded`. The existing processing publishes only re-encoded variants. The provider gives base64 only, and no URL is stored. |
| Unknown outcome never triggers paid regeneration | Timeout, lost connection, 5xx, or a worker lost mid-send all become `outcome_unknown`. A new image for the article is refused until an operator resolves it. Abandon counts the full reservation as spent. |
| Human-selected media never overwritten | A result is never attached automatically. Attaching is a person's approval under compare-and-set on the article version, and it marks the item human-modified (sticky). |
| Both publication paths use the same gate | `imagePublicationReasons` runs inside `aiPublicationDecision`, used by the admin publish and schedule commands and the scheduled publisher. |
| Existing fact, research and content gates stay mandatory | Attaching an image is a material change (cover and alt are in the material hash). It invalidates the fact confirmation and content approval, so both must be given again. The alt text is screened as a fact unit. |

## 3. Changed files

New:

- `packages/domain/src/ai-images.ts` (+ spec)
- `packages/database/prisma/migrations/20260919100000_ai_content_images/migration.sql`
- `packages/database/src/automation/images.ts`
- `packages/database/src/editorial/ai-image-gate.ts`
- `apps/worker/src/ai-content/{image-provider,openai-image-provider,images}.ts` (+ `openai-image-provider.spec.ts`)
- `apps/api/test/ai-content-images.integration-spec.ts`
- `apps/admin/src/pages/ai-content/ImagePanels.tsx`
- this record

Changed:

- `packages/database/{prisma/schema.prisma,src/index.ts,src/automation/{budget,index,operations,providers,review}.ts,src/editorial/{ai-publication,index}.ts}`
- `packages/domain/src/index.ts`
- `apps/worker/src/{main.ts,ai-content/{operations,openai-provider}.ts}`
- `apps/api/src/{settings/ai-content-settings.ts,blog/blog-public.service.ts,blog/dto/public-post.dto.ts}` and `apps/api/src/ai-content/{ai-content.module,ai-content.service,ai-content.dto,ai-generation.controller,ai-generation.service,ai-generation.dto,topic-rules.spec}.ts`
- `apps/api/test/{integration/harness.ts,ai-content-editorial.integration-spec.ts,ai-content-generation.integration-spec.ts}`
- `apps/web/src/components/article-view.tsx`
- `apps/admin/src/{api/ai-content.ts,pages/ai-content/{AiContentPages,AiContentPages.test,GenerationPanels,PricingPage}.tsx}`
- `packages/contracts/*` (regenerated)

## 4. Migration and schema

`20260919100000_ai_content_images` is additive: enum widening, nullable columns and one table. The schema diff is empty and the policy check passes.

- `ai_operations.kind` gains `image`.
- `ai_budget_buckets.scope` gains `image_day` and `image_month`.
- `ai_price_schedules` gains `imageSize`, `imageQuality` and `maxOutputTokens` (nullable).
- `ai_content_items.imageMode` (nullable override).
- **`ai_image_jobs`:**
  - item, slot (`featured`), `imageVersion` (unique item + slot + version) and a unique operation;
  - status `requested | stored | approved | rejected | failed | outcome_unknown | superseded`;
  - prompt, prompt hash and policy version; provider, model, size and quality;
  - unique `mediaAssetId` (FK RESTRICT), checksum and dimensions;
  - disclosure text and hash;
  - requester and approver (SET NULL); approval checksum, alt hash, disclosure hash and article version;
  - review note, failure code, `supersededAt`, version.

## 5. API, admin and public

API routes (default-deny chain):

| Route | Permission |
|---|---|
| `POST topics/:id/images` (Idempotency-Key, optional prompt) | view + generate |
| `GET topics/:id/images` | view |
| `POST images/:id/approve` (`expectedPostVersion`, `altText`, `altWrittenFromImage: true`) | view + approve + `posts.update` |
| `POST images/:id/reject` (note) | view + review |

- `PUT topics/:id/article` accepts `imageMode`, and now changes only the fields sent (before, an image-mode-only request would have cleared the category).
- Price proposal accepts the image model with size, quality and bound. Budget status adds the image day and month buckets.
- **Admin:** a Featured image card on the topic page:
  - mode override; the brief, with its alt draft labelled as written before any image exists; the prompt;
  - Generate image with a cost confirmation;
  - each version with preview, status, cost, disclosure and failure;
  - approve (alt text plus an explicit checkbox; warns it replaces the current image and that facts and approval must be confirmed again); reject; abandon for an unknown outcome.
- The Pricing page gains the image fields; the budget card shows the image budget.
- **Public:** the article detail gains `coverDisclosure`, shown as the figure caption for an approved AI cover.

## 6. Worker

- `ai.operation` routes `image` to `runImage`:
  1. controls re-checked;
  2. "sending" committed;
  3. one call, with the lease kept alive during the call;
  4. the bytes are inspected with `sharp` and the upload rules (`imageRejectionReason`), then stored in quarantine;
  5. `completeImage` settles the cost once and creates the asset plus the outbox event.
- **An unusable paid result** (no bytes, invalid image, storage failure) is recorded as charged and failed, never retried.
- **A reported size or quality different from the request** halts paid calls and settles as `uncertain`.
- **Recovery** treats image like text generation: "prepared" is re-runnable; "sending" becomes outcome unknown. Exhausted retries fail the image, never the article.
- The same server-side `OPENAI_API_KEY` builds the image adapter; without it, no request is sent.

## 7. Tests run (local, isolated)

| Check | Result |
|---|---|
| New `ai-content-images.integration-spec.ts` (real MySQL, API, worker runner and real media processing; fake providers; in-memory storage) | **10/10**, run twice |
| Domain `ai-images.spec.ts` (mode, prompt screen, alt text, cost bound, usage mapping) | 7/7 |
| Worker `openai-image-provider.spec.ts` (request shape, key only in header, unknown vs refused, Retry-After/hold, paid-but-unusable) | 4/4 |
| Admin: generate confirmation and request key, manual mode and unknown hold, alt-from-image approval | 3 new; AI pages and copy-limit suites 24/24 |
| `pnpm test` | database 31, API 346, admin 360, web 260, domain 136, mail 40, worker 131: **all passed** |
| `pnpm test:integration` | database 5/5; API **42 files, 393/393** |
| `pnpm test:e2e` | 20/20 |
| typecheck, lint, API/admin/worker builds, web `tsc`, `contracts:check`, `db:migrations:check` | pass (web not rebuilt: `next dev` is running) |

The integration spec covers:

- refusals: automatic mode, an unbounded price, zero image budget, a manual override (and that it keeps the category), a named-place prompt; nothing spent;
- one reservation and one send; the image-only bucket;
- quarantine, outbox and processing; no auto-attach; redelivery does nothing;
- not approvable before ready; draft alt refused; missing confirmation; permission; stale version;
- approval attaches and invalidates the fact confirmation and approval; re-confirm, approve, publish;
- public disclosure; renditions only, no provider or quarantine URL;
- the alt-text edit and regeneration supersede; an uploaded image needs no AI approval;
- a late result never replaces a person's image;
- unknown outcome: no re-send, no new request, abandon counts the cost, article untouched;
- a worker lost mid-send;
- Retry-After and refusal, without failing the article;
- a paid but unusable result; the size-mismatch halt;
- the image-cap race; images in the per-article cap;
- permission denials; reject.

**Test updates, not weakening:** the 1B and 1D fixtures that publish AI articles now attach an ordinary uploaded, ready featured image first, because a featured image is now required. The 1A settings defaults test expects the owner's image defaults and that automatic is refused.

## 8. Mutation checks (1E spec, each restored)

| Mutation | Caught |
|---|---|
| Image gate not called in the publication policy | yes (2 tests) |
| Alt text not bound to the approval | yes |
| No supersede on regeneration | yes |
| No in-flight / unknown-outcome block | yes |
| Image reserved against the text budget | yes (4 tests) |
| Recovery skips image operations (lost send not held) | yes |
| Prompt screen disabled | yes (2 tests) |
| Approvals not invalidated when an image is attached | yes |

No mutated code remains (checked by search).

## 9. External calls, security and data flow

- **External calls made:** none. There is no key and no live authorisation.
- **Data sent to the image provider:** only the prompt, which is the model's brief from verified research or a person's text. It is screened to contain no names, and the fixed policy is appended. No article text, draft, enquiry, contact, admin or secret data is sent.
- **Stored:** bytes go only to the private quarantine bucket. The public receives only re-encoded WebP renditions, EXIF dropped.
- **Secrets:** no new ones; the existing `OPENAI_API_KEY` placeholder only. The changed files were scanned: clean.

## 10. Deployment requirements (not done)

1. ~~Apply the migration on dev~~: done 19 Sep 2026 (owner-authorised). The dev article detail route works again. Production follows the normal release path.
2. Set image budgets (`imageDailyLimitMinor`, `imageMonthlyLimitMinor`).
3. Propose and approve an image price (size, quality, per-image output bound).
4. The key must already be set for 1D.
5. Optionally, run one authorised live image smoke test.

## 11. Rollback

- Set the image mode to manual, or the image budget to 0, or disable automation. Generation stops.
- Existing approved images stay valid media.
- Keep the additive tables. Never run a destructive down migration.
- Turning `featuredImageRequired` off relaxes only the required-image rule; AI images still need approval.

## 12. Known limitations and open items

- **No official per-image output-token figure for 2.5-flare.** An admin must enter a bound from their own evidence (for example billing observation). Usage above it halts paid calls.
- The alt text is a person's description. The system cannot verify it matches the pixels; it can only require that it is written after, and from, the image.
- The prompt screen is deliberately strict: capitalised names are refused (the location's words excepted).
- A newly regenerated image supersedes the approved one even if a person prefers the old one. They can still choose any other library image.
- **Automatic image mode is not implemented** (owner decision); plan exit "all three modes" is only partially met.
- There is no supporting-image slot; the social image and other AI uses of the asset are Phase 2 or out of scope.
- The disclosure is shown on the article page, not on list cards.
- A pending (unsent) request cancelled with its topic keeps its reservation counted (conservative; same as 1D).

## 13. Traceability

Implemented and verified at pilot level (fakes only):

- **Rows:**
  - images: AI-049 and AI-081 (manual and hybrid; automatic not approved); AI-144 (actual-image alt); AI-148 (manual); AI-150 (hybrid, per-item Generate); AI-151 (global plus per-post);
  - image rules: AI-152 (one featured; supporting off); AI-153 (idempotency, no retry regeneration); AI-154 and AI-155 (validation, no broken URL); AI-156 (required image holds publication); AI-157 (prompt, provider, model and cost audit);
  - admin: AI-177 and AI-179 (review UI, image settings); AI-181 (confirmations);
  - idempotency and cost: AI-202 and AI-203 (image keys and unique constraints); AI-220 and AI-221 (image budget, hard stop); AI-222 (no repeat spend); AI-225 and AI-226 (image adapter); AI-318 (AIImageJob); AI-362;
  - owner rows U07.01, U07.03, U07.04, U07.05, U13.02, U13.03.
- **Failure modes:** F16, F17 (paid result not stored: recorded, not re-requested), F21, F32, F33 (image cap race), F48.

**Open:** AI-149 and U07.02 (automatic), AI-384 (three modes), and supporting images.

## 14. Next workstream

1F (cadence and automatic topic selection) is **not started**. Its entry needs 1C–1E accepted and the operating time, caps and missed-slot policy set.
