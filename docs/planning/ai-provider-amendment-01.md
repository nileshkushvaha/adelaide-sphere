# AI Automation — Provider amendment 01: OpenAI, Google Gemini and xAI as provider-neutral candidates

**Status: PROPOSED, awaiting owner review.** 19 September 2026. Planning and documentation only: no application code, schema, settings or dependency was changed, and no provider was called.

**Form.** On the owner's explicit instruction, the requirement text is also **appended to the master SRS** as "Amendment 01" (additive; the original text is byte-for-byte unchanged, verified). This document holds the evidence and rationale. It remains **additive** to the master AI SRS (`docs/adelaide_sphere_ai_content_automation_srs.md`). It is kept as a separate document so that the SRS text and its traceability (AI-001 to AI-391, U-rows) stay exactly as approved. The CLAUDE.md rule is never to edit the SRS to match an implementation; an owner-directed scope change is recorded as an amendment instead. The new requirement IDs below are added to the requirement matrix.

## 0. Correction to the premise of the request

The request was written for the point **before** Phase 1E. The repository is further along:

| Phase | State |
|---|---|
| 1D text generation | Implemented and accepted. The OpenAI Responses adapter sits behind `TextProvider`. |
| 1E images | Implemented and accepted (`cdac021`). The OpenAI Image API adapter sits behind `ImageProvider`. |
| 1F daily slot | Implemented and accepted |
| 1G hardening | Implemented and accepted |
| Phase 1 overall | Implemented, **not accepted** (pilot open) |

So "implement the provider-neutral image foundation first" is **already true**: the 1E seam is provider-neutral. Its request type, budget, idempotency, unknown-outcome handling, media intake, approval and publication gate do not depend on OpenAI.

This amendment therefore does **not** restructure 1E. It adds follow-on workstreams (§5) that add Google as a second adapter and generalise the few places that still assume one provider (§4). Completed 1D/1E business logic is not reopened.

## 1. Verified facts (official Google documentation only, checked 19 September 2026)

| Topic | Fact | Source |
|---|---|---|
| Workspace vs API | The API terms treat the Gemini API as a Paid Service only "when accessing the API through a Cloud Project associated with an active billing account". They do not address Google Workspace. **A Workspace Gemini subscription is not Gemini API entitlement.** API use is a separate, Cloud-billed cost centre. | ai.google.dev/gemini-api/terms |
| Free-tier data use | Free tier: Google uses content "to improve, and develop Google products and services", and "human reviewers may read, annotate, and process your API input and output". Paid tier: Google "doesn't use your prompts … or responses to improve our products". **Only the paid tier fits the owner's data policy.** | terms; pricing |
| Age and region | Users must be 18 or over. The service may not be used "as part of a website, application, or other service … directed towards or is likely to be accessed by individuals under the age of 18". In the EEA, Switzerland and the UK, only Paid Services. **Needs owner/legal review** (see §6). | terms |
| Current text models (stable) | `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.5-pro`. Preview: `gemini-3.1-pro-preview`. | ai.google.dev/gemini-api/docs/models |
| Current image models | `gemini-3.1-flash-image` (Nano Banana 2); `gemini-3.1-flash-lite-image` (Nano Banana 2 Lite); `gemini-3-pro-image` (Nano Banana Pro). `gemini-2.5-flash-image` is **deprecated, shutting down 2 October 2026**: never approve it. | models; pricing |
| Text prices (standard, per 1M tokens) | `gemini-3.8-flash`: USD 0.75 in / 3.75 out **until 31 December 2026, then 1.50 / 7.50**. `gemini-3.5-flash-lite`: 0.30 / 2.50. `gemini-3.1-flash-lite`: 0.25 / 1.50. `gemini-2.5-flash-lite`: 0.10 / 0.40. `gemini-2.5-pro`: 1.25 / 10.00 (≤200k). | pricing |
| Image prices | `gemini-3.1-flash-image`: output images USD 60/1M tokens; per image 0.045 (0.5K), **0.067 (1K)**, 0.101 (2K), 0.151 (4K); **tokens per image 747 / 1,120 / 1,680 / 2,520**. `gemini-3.1-flash-lite-image`: 30/1M; **0.0336 (1K only)**, 1,120 tokens. `gemini-3-pro-image`: 120/1M; 0.134 (1K/2K), 0.24 (4K). Text output from image models is also billed (3.00, 1.50 and 12.00 per 1M respectively). None of the image models has a free tier. | pricing |
| Image API shape | Interactions endpoint (`/v1beta/interactions`). Images are returned as **inline base64** (no URLs). `response_format` with `aspect_ratio` (1:1 to 21:9, **16:9 on all three**) and `image_size` (`1K`; Flash also 0.5K/2K/4K; Pro 1K/2K/4K). **All images carry a SynthID watermark.** **Thinking is on by default and cannot be disabled**, and text accompanies the image. `gemini-3.1-flash-image` offers Google Search grounding. | ai.google.dev/gemini-api/docs/image-generation |
| Interactions API | Generally available. `background=true` runs long tasks, but is **incompatible with `store=false`**. Interactions can be retrieved by id (`interactions.get`). Paid-tier retention is 55 days by default, configurable to 7, 14, 28 or 55 days. | ai.google.dev/gemini-api/docs/interactions |
| Structured output | `response_format: { type: "text", mime_type: "application/json", schema }`, a JSON Schema subset (`properties`, `required`, `additionalProperties`, `enum`, `items`, `minItems`/`maxItems`). "Output is syntactically correct JSON", but "always validate values". | ai.google.dev/gemini-api/docs/structured-output |
| Errors and retry | Retry only transient errors (429, 408, 5xx); do not retry 400/403. **No Retry-After or RetryInfo is documented. No idempotency key is documented.** | ai.google.dev/gemini-api/docs/troubleshooting |

Prices and models above are **evidence for an activation decision**, not product requirements. In the application they enter only through the admin-approved, versioned price schedule and the code-declared capability registry.

## 2. Added requirements

### Provider requirements

| ID | Requirement |
|---|---|
| **AI-PROVIDER-01** | The engine supports several approved **text** providers through the existing `TextProvider` boundary. Initial candidates are OpenAI and Google Gemini. Selection is configuration-driven and requires no change to content-domain logic. |
| **AI-PROVIDER-02** | The engine supports several approved **image** providers through the existing `ImageProvider` boundary. Initial candidates are OpenAI image generation and Google Gemini native image generation (Nano Banana family). Model ids, capabilities and prices are verified against official documentation before activation and are never permanent product requirements. |
| **AI-PROVIDER-03** | A Google Workspace Gemini entitlement is **not** Gemini API billing entitlement. Server-side generation uses the Gemini Developer API or Vertex AI through a **paid** (Cloud-billed) project, with separately verified credentials, quota, billing and data-handling policy. The free tier is never used, because free-tier content may be human-reviewed and used for product improvement. |
| **AI-PROVIDER-04** | Each provider/model capability record declares, at minimum: provider; model id; text generation; structured output; image generation; supported sizes and aspect ratios; input/output limits; grounding capability (and whether it is disabled); idempotency and reconciliation capability (for example, retrieve by id, and at what retention cost); pricing version; enabled/approved state. |
| **AI-PROVIDER-05** | Changing the text or image provider never weakens research verification, claim/evidence requirements, fact confirmation, approval, human-edit protection, publication gates, budget controls, idempotency or audit. |
| **AI-PROVIDER-06** | Fallback is explicit, configured and budgeted. A fallback provider is **never** invoked after an unresolved or unknown outcome of the previous call. Default: no fallback. |
| **AI-PROVIDER-07** | Provider credentials stay server-side. They are never stored in ordinary settings, exposed to the browser, placed in prompts or written to logs. |
| **AI-PROVIDER-08** | Provider grounding (for example, Google Search grounding) is **disabled** in generation requests. Grounded output is never factual evidence: facts come only from the Phase 1C evidence, claim and fact-confirmation pipeline. |
| **AI-PROVIDER-09** | Where a provider documents no retry-delay header, retries of a request **definitely not processed** (for example, 429 before acceptance) use bounded exponential backoff. A 5xx or timeout on a paid call remains an **unknown outcome**, even where the provider's generic guidance says to retry 5xx. |
| **AI-PROVIDER-11** | Every provider price is a versioned schedule that stays **proposed** until an administrator approves it. With no approved price, or a price that cannot bound the call, no paid call is made. |
| **AI-PROVIDER-10** | A controlled comparative evaluation (the same verified packets or image briefs sent to each approved provider) is supported. Each call is budgeted and recorded as normal. Nothing is published from an evaluation run. |

### Image provider requirements

| ID | Requirement |
|---|---|
| **AI-IMAGE-PROVIDER-01** | Gemini native image generation is an approved **candidate** adapter behind the existing interface. Production mode stays HYBRID: the prompt is automatic; paid generation happens only on an explicit action; automatic generation is OFF. |
| **AI-IMAGE-PROVIDER-02** | An administrator may select an approved image provider and model from the server-side allowlist. An unsupported model, size, aspect ratio or quality fails validation **before** any paid request. |
| **AI-IMAGE-PROVIDER-03** | Each image request records: provider; model; prompt policy version; prompt and hash; requested size and aspect; provider request id where available; estimated maximum cost; actual or reconciled usage; result checksum; resulting MediaAsset id; time; approval state and version. |
| **AI-IMAGE-PROVIDER-04** | Every generated image, from any provider, goes through: provider result → server intake → quarantine → validation → media processing → READY MediaAsset → human approval → post attachment. A provider-hosted URL never becomes canonical public media. |
| **AI-IMAGE-PROVIDER-05** | Search or image grounding offered by an image provider does not make generated imagery documentary evidence. AI imagery is never presented as an authentic photograph of a named real business, venue, event or establishment. Provider watermarks (for example, SynthID) are preserved and do not replace the reader disclosure. |
| **AI-IMAGE-PROVIDER-06** | At most one AI featured image per article initially; supporting AI images off; regeneration only by explicit human action; every regeneration budgeted independently. |
| **AI-IMAGE-PROVIDER-08** | The reader disclosure for AI images is configurable. It is initially proposed as "Illustrative image created with AI.", recorded per image, and shown with an approved AI featured image, never as a photographer credit. |
| **AI-IMAGE-PROVIDER-09** | An unknown provider outcome never triggers automatic paid regeneration, with any provider. |
| **AI-IMAGE-PROVIDER-07** | An image price must bound **everything** the provider bills for one image: image output tokens, **and** any text or thinking output tokens and input tokens. Where a provider always returns billed text or thinking tokens and publishes no bound for them, the price must carry an approved bound, or the call fails closed. |

## 3. The owner's 20 points, and their status now

| # | Point | Requirement | Status in the repository today |
|---|---|---|---|
| 1 | Configurable OpenAI/Gemini selection | AI-PROVIDER-01/02 | **Gap.** The seam is neutral, but the approved models are single-provider code constants (`APPROVED_TEXT_MODELS`, `APPROVED_IMAGE_MODEL`); there is no provider setting. |
| 2 | Server-side credentials only | AI-PROVIDER-07 | **Met** for OpenAI (worker `OPENAI_API_KEY`); a Gemini key would follow the same rule |
| 3 | Capability allowlist | AI-PROVIDER-04 | **Partly met.** The registry is keyed by provider, but lacks aspect-ratio, grounding and reconciliation fields. |
| 4 | Pricing version and reservation | — | **Met**, provider-keyed. Image prices need a text/thinking-output field (AI-IMAGE-PROVIDER-07). |
| 5 | Provider-independent fact and publication gates | AI-PROVIDER-05 | **Met**: the gates never read the provider |
| 6 | Explicit safe fallback only | AI-PROVIDER-06 | **Met, trivially**: no fallback exists |
| 7 | No fallback after an unknown outcome | AI-PROVIDER-06 | **Met**: an unknown outcome blocks every new request for the article |
| 8 | Provider-specific Retry-After and rate limits | AI-PROVIDER-09 | **Met for OpenAI.** A Gemini adapter needs backoff without a header. |
| 9 | Gemini native image generation | AI-IMAGE-PROVIDER-01 | **Gap**: no adapter yet |
| 10 | MediaAsset pipeline canonical | AI-IMAGE-PROVIDER-04 | **Met** (1E), provider-independent |
| 11 | No raw provider URL | AI-IMAGE-PROVIDER-04 | **Met**; Gemini also returns base64 only |
| 12 | Human approval of images | — | **Met** (1E) |
| 13 | Version- and hash-bound image approval | — | **Met** (1E) |
| 14 | One featured AI image | AI-IMAGE-PROVIDER-06 | **Met** (1E) |
| 15 | Supporting images off | AI-IMAGE-PROVIDER-06 | **Met** (1E) |
| 16 | Hybrid prompt-first | AI-IMAGE-PROVIDER-01 | **Met** (1E) |
| 17 | Automatic paid images off | AI-IMAGE-PROVIDER-01 | **Met**: refused in settings (1E) |
| 18 | Imagery never documentary evidence | AI-IMAGE-PROVIDER-05 | **Met**: prompt screen, policy suffix, disclosure (1E). Gemini grounding must also be off (AI-PROVIDER-08). |
| 19 | Cost, provider, model and prompt provenance | AI-IMAGE-PROVIDER-03 | **Met**, except the image request's provider request id (OpenAI returns none; Gemini's interaction id would be recorded) |
| 20 | Controlled OpenAI-vs-Gemini evaluation | AI-PROVIDER-10 | **Gap**: no evaluation mode |

## 4. What must change in code (for the follow-on workstreams, not done now)

1. **Provider selection.**
   - Replace the single-provider constants with a code-declared per-provider allowlist.
   - Add owner-configurable settings: `textProvider`, `articleModel`, `lightModel`, `imageProvider`, `imageModel`, each validated against that allowlist; `fallbackProvider` stays `none`.
   - The model id still changes only by choosing from the reviewed allowlist, never by free text.
2. **Image request shape.** The provider-neutral `ImageRequest` moves from an OpenAI `WIDTHxHEIGHT` size to `{ aspectRatio, resolutionTier }`. Each adapter maps it to its provider (for Gemini, 16:9 at 1K).
3. **Image price model.**
   - Add `textOutputMicrosPerMTok` and a bound on text/thinking tokens per image.
   - `imageTokenUsage` then prices text output instead of treating it as unpriceable. Today a Gemini image response would always halt paid calls, because text is always returned.
4. **Gemini adapters** (worker):
   - Text through the Interactions API with structured output, where each approved model must declare it.
   - Images through Interactions with `response_format` and grounding off.
   - Classification: 400/403/404 permanent; 429 retryable with backoff; 5xx and timeouts unknown.
   - Usage mapping from the response's reported token counts. The exact field names are to be verified when the adapter is written; the extract above did not show them.
5. **Reconciliation choice** (owner decision, §6): background mode with `store=true` (lost responses can be looked up by id, but Google retains the interaction for 7 or more days), or synchronous calls with `store=false` (nothing retained, but a lost response is an unknown outcome to abandon).
6. **Evaluation mode**: an explicit admin action that generates a draft or image with a chosen approved provider as a **proposal only**, budgeted, never applied or published automatically.

## 5. Follow-on workstreams (proposed)

| Workstream | Entry | Scope | Tests | Exit |
|---|---|---|---|---|
| **P1: Provider selection and registry** | This amendment approved | §4.1–4.3: settings and allowlist, neutral image request, image text-output pricing. No new provider yet. | Unit (registry, validation); integration (OpenAI unchanged; selection refused for unapproved); regression of the 1D/1E specs | OpenAI works exactly as today; a second provider can be declared without touching domain logic |
| **P2: Gemini image adapter** (the plan's "1E-G") | P1; the owner approves Gemini (paid project), a model and a reconciliation choice | §4.4 image; server key `GEMINI_API_KEY` in the worker only | Adapter contract suite with fakes (the same cases as `openai-image-provider.spec.ts`), and the 1E integration spec parameterised over both providers | The same 1E guarantees for Gemini; no live call without separate authorisation |
| **P3: Gemini text adapter** (the plan's "1D-G") | P1; the owner approves Gemini text models | §4.4 text | Adapter contract suite, and the 1D integration spec over both providers | The same 1D guarantees; the core does not know which provider wrote an article |
| **P4: Comparative pilot** | P2 and/or P3; keys and budgets set by the owner | §4.6 evaluation mode; 5–10 non-documentary image briefs and 1–3 verified packets per provider | Evaluation records quality, adherence, latency and cost against the provider's usage page | Owner selects the default provider per task; it stays a setting, never hard-coded |

## 6. First-pass recommendation (superseded by §9)

**Images: pilot `gemini-3.1-flash-image` at 16:9, 1K first, with `gemini-3.1-flash-lite-image` as the low-cost comparison.**

- Google publishes the tokens per image (1,120 at 1K), so the image part of the cost is officially bounded: USD 0.067, or 0.0336 for Lite. OpenAI publishes no per-image token count for `gpt-image-2.5-flare`, which is why its approval needs an owner-entered bound.
- **But** thinking and text tokens are always billed on Gemini image calls and have no published bound (AI-IMAGE-PROVIDER-07). That bound must be set from a controlled test.
- The media pipeline's hero rendition targets 1,600 pixels wide and never upscales, so a 1K image (Google does not state the exact 16:9 pixel size on the pages checked) may give a smaller hero. Compare it with 2K (USD 0.101) in the pilot.

**Text: keep OpenAI as the approved default until P4.**

- `gemini-3.8-flash` costs USD 0.75 / 3.75 per 1M tokens until 31 December 2026, then 1.50 / 7.50. Against Terra's 2.00 / 12.00, it could lower article cost.
- For light tasks, Luna (0.20 / 1.20) is already cheaper than the Gemini Flash-Lite options, except `gemini-2.5-flash-lite` (0.10 / 0.40).
- Choose on measured quality and cost, not list price.

**Owner decisions required before P1/P2:**

1. **Approve Google as a provider**, with the Gemini Developer API on a **paid, Cloud-billed** project, or Vertex AI if you need regional data processing or enterprise controls. Keep OpenAI as well?
2. **Reconciliation versus retention:**
   - allow `store=true` with the shortest retention (7 days), so background calls can be reconciled; or
   - `store=false`, so a lost response is abandoned and counted.
3. **Terms review of the under-18 clause.** Adelaide Sphere is a public site. Content generation happens server-side with no minor interacting with Gemini, but the clause needs your (or legal) confirmation before activation.
4. **Which image models to allow for the pilot**, and at what size and aspect.
5. **Image budget**, and a bound on thinking/text tokens per image from a controlled test.
6. **Order:** P1 then P2 (images) first, as recommended; P3 (text) after P4 evidence, or together.
7. **Fallback:** confirm "none" (recommended).


## 7. Two-way comparison (superseded by the three-way comparison in §15)

Official sources only, checked 19 September 2026:

- OpenAI: developers.openai.com — image-generation guide, images API reference, `gpt-image-2.5-flare` and `gpt-image-2` model pages, pricing, data controls.
- Google: ai.google.dev — models, pricing, image-generation, Interactions API, rate limits, troubleshooting, terms.

The candidates compared are OpenAI `gpt-image-2.5-flare` (the model 1E declares; `gpt-image-2.5-sunburst` is OpenAI's editing-precision sibling) and Google `gemini-3.1-flash-image`, with `gemini-3.1-flash-lite-image` and `gemini-3-pro-image` noted.

| Criterion | OpenAI | Google Gemini | Notes |
|---|---|---|---|
| **API cost** | Text input USD 5 / 1M; image output USD 30 / 1M (standard). **No official per-image token count for 2.5-flare**: the model page says its rates match GPT Image 2, and the calculator does not estimate it. So the per-image cost has **no published bound**. | Flash Image: USD 0.045 (0.5K), **0.067 (1K)**, 0.101 (2K), 0.151 (4K) per image; **tokens per image published** (1,120 at 1K). Flash-Lite Image: **USD 0.0336** (1K). Pro Image: 0.134 (1K/2K), 0.24 (4K). **Plus billed text and thinking output (USD 3 / 1M for Flash), unbounded.** | Gemini's image part is officially bounded, its thinking part is not; OpenAI's whole output is unbounded officially. Either way the admin price must carry an approved bound (AI-IMAGE-PROVIDER-07). |
| **Quality / featured editorial images** | Official claims only: improved instruction-following; "may struggle" with precise text, recurring brand consistency and layout-precise composition | Official claims only: Flash is the "general-purpose balance of quality, latency and cost"; Pro targets demanding assets | **Neither is objectively comparable from documentation.** Needs the comparative pilot (AI-PROVIDER-10). |
| **Prompt adherence** | Documented as strong but imperfect (layout, text) | Not quantified | Pilot |
| **Aspect ratios / resolution** | 1024×1024, 1536×1024, 1024×1536, or custom multiples of 16 (1:3 to 3:1, up to 3840 per edge; above 2560×1440 is experimental). **16:9 only as a custom size.** | Named ratios 1:1 to 21:9 **including 16:9 natively**. Flash: 0.5K/1K/2K/4K; Flash-Lite: 1K only; Pro: 1K/2K/4K | The featured image and hero rendition (1,600 wide) suit 16:9; Gemini is simpler here |
| **Editing / reference images** | `/v1/images/edits` with a mask on the first image; up to 4 reference images shown | Conversational editing; **up to 14 reference images** (varies by model) | Not needed by the current policy (generation only). Future. |
| **Latency** | "Complex prompts may take up to 2 minutes" | Not documented; thinking is on and cannot be disabled | Pilot; 1E's 180-second provider timeout covers OpenAI's stated worst case |
| **Usage reporting** | `usage.input_tokens` / `output_tokens` with text and image details | Token counts reported (exact response fields to be confirmed when implemented) | Both are token-based; Gemini adds billed text and thinking output |
| **Rate limits / retries** | Tier 1: 5 images/minute (2.5-flare); 429 with Retry-After, which 1E honours | Per-project tiers (Tier 1 with billing; Tier 2 after USD 100 plus 3 days). Numbers are shown in AI Studio, not on the docs page. **No Retry-After documented**; exponential backoff advised. | Both ample for one image a day |
| **Idempotency / reconciliation** | No idempotency key; the synchronous images endpoint has **no retrieval**, so a lost response is an unknown outcome to abandon | No idempotency key. **Interactions background mode lets a result be retrieved by id**, but only with `store=true` (retention 7–55 days on paid). With `store=false`, as unrecoverable as OpenAI. | Gemini can reconcile at the cost of retention |
| **Data / privacy** | Not used for training by default; abuse logs up to 30 days. **Zero Data Retention eligibility lists `gpt-image-2.5-sunburst`, gpt-image-2 and 1.x, but not 2.5-flare.** Data residency includes **Australia (regional storage)**. | Paid tier: not used to improve products. **Free tier: human review and product use, so never use it.** Paid retention of stored interactions 55 days by default, configurable to 7. EEA/UK: paid only. **Under-18 clause** in the terms. Vertex AI regional processing in Australia **not verified** (the docs page did not load). | OpenAI has the clearer Australian residency story; Gemini needs a paid project and the retention decision |
| **Provenance marks** | C2PA not mentioned in the guide | **SynthID watermark on all images** | Our reader disclosure stays required either way |
| **Status in this repository** | **Adapter implemented and tested with fakes** (1E, `cdac021`) | Not implemented; needs the P1 changes (neutral aspect and resolution request; text and thinking-output pricing) plus an adapter | |

## 8. Revised Phase 1E structure, mapped to what already exists

| Workstream | Content | Repository state |
|---|---|---|
| **1E.1** Provider-neutral foundation | `ImageProvider` boundary; MediaAsset intake (quarantine, validation, processing); separate image budget; provenance (`ai_image_jobs`); hash-bound human approval; idempotency; unknown-outcome hold; publication gate; configurable disclosure; the policy of §A2 | **Implemented, tested and accepted** (1E). Two generalisations remain, as P1 in §5: the neutral `{aspectRatio, resolutionTier}` request, and pricing that includes text and thinking output. |
| **1E.2** First approved image provider | The provider the owner activates first: code adapter, allowlist entry, approved price | **Owner decision** (§9). If OpenAI: code exists; activation needs an approved price with an owner-entered per-image bound. If Gemini: P1 plus P2 (adapter) first. |
| **1E.3** Optional second provider | The other adapter, kept inactive (no approved price means no calls) | If Gemini is 1E.2, the OpenAI adapter already exists and simply stays inactive. If OpenAI is 1E.2, Gemini (P2) is deferred. |

## 9. Earlier two-way recommendation (superseded by §20: decide after the controlled comparison)

This is a recommendation; the decision is the owner's. Reasons from the official documentation:

1. **Cost control.**
   - Google publishes per-image token counts and per-image prices, so the image part of the worst case is known before approval: USD 0.067 at 1K, 0.101 at 2K.
   - OpenAI publishes neither for 2.5-flare, so its approved bound would rest entirely on the owner's own evidence.
   - Gemini's thinking and text output still needs a bound set by a controlled test.
2. **Fit for featured images.** 16:9 is native at 1K and 2K. The Flash-Lite model offers a USD 0.0336 option at 1K.
3. **Reconciliation.** Interactions background mode can look a result up after a lost connection. With OpenAI's synchronous images endpoint, the only safe action is to abandon and count the cost.
4. **Provenance.** SynthID is applied to every image.

**Against Gemini as 1E.2** (why this is close):

- OpenAI is **already implemented and tested**; Gemini needs P1 and P2 first.
- OpenAI offers Australian data residency.
- Reconciliation on Gemini requires letting Google store requests for at least 7 days.
- The Gemini terms' under-18 clause needs review.

**If the priority is to pilot soonest, activate OpenAI as 1E.2 instead.** Then consider `gpt-image-2.5-sunburst` over 2.5-flare where Zero Data Retention matters, since only sunburst is listed as eligible. Both paths keep the other adapter available.

## 10. Second adapter: in 1E or deferred? (see also §20)

**Defer.**

- If Gemini is 1E.2, the OpenAI adapter already exists: 1E.3 costs nothing further, and it stays inactive until a price is approved.
- If OpenAI is 1E.2, build Gemini (P2) only when the comparative pilot (P4) is wanted.

Implementing both before any live pilot adds surface without evidence.

## 11. Gemini text integration plan (P3, additive to 1D; 1D itself is not rewritten)

1. The same `TextProvider` contract used by the OpenAI adapter:
   - `submit` → accepted with an id, or rejected (retryable or permanent), or unknown;
   - `retrieve(id)` → pending, done or unavailable.
2. Adapter: Interactions API, background mode with a chosen retention (owner decision), `response_format` with the existing strict article and metadata schemas (translated to Google's JSON Schema subset), grounding off, usage mapped to input, cached and output tokens.
3. Allowlist: approved text models per provider, each declaring structured-output support. Proposed pilot candidates: `gemini-3.8-flash` (articles; promotional price until 31 December 2026) and `gemini-2.5-flash-lite` or `gemini-3.1-flash-lite` (light tasks).
4. Everything downstream is untouched: coverage screen, fact confirmation, approval, human-edit protection, budget, publication gates. They never read the provider.
5. Tests: the adapter contract suite with a fake fetch (the same cases as `openai-provider.spec.ts`), and the 1D integration spec run against a Gemini fake.

## 12. Gemini image integration plan (P2)

1. P1 first:
   - the neutral image request `{aspectRatio, resolutionTier}`, mapped per adapter (OpenAI: a size; Gemini: `aspect_ratio` plus `image_size`);
   - `textOutputMicrosPerMTok` and a thinking/text-token bound on image prices;
   - `imageProvider` and `imageModel` settings from the allowlist.
2. Adapter:
   - Interactions API with `response_format { type: "image", mime_type, aspect_ratio: "16:9", image_size: "1K" }` and grounding off;
   - base64 decoded and passed to the unchanged 1E intake;
   - usage mapped to input, image output, and text or thinking output;
   - the interaction id recorded as the provider request id;
   - classification: 400/403/404 permanent; 429 retryable with backoff; 5xx and timeout unknown.
3. Tests: `openai-image-provider.spec.ts` cases for the Gemini fake, and the 1E integration spec run over both providers.

## 13. Workspace Gemini vs Gemini API billing

- **Google Workspace with Gemini** is an end-user service in Google's own apps, used by a person. It is not an API credential and is not referenced by the Gemini API terms.
- The **Gemini API** is billed through Google Cloud. It counts as a Paid Service "when accessing the API through a Cloud Project associated with an active billing account", with its own per-project usage tiers and per-token prices.
- Without billing it is the **free tier**, whose content Google may review and use to improve its products. That is unacceptable here.
- **So Adelaide Sphere needs its own Google Cloud project with billing and an API key**, stored only in the worker's server environment. Its spend is a separate cost centre, under the application's own image and text budgets.


## 14. xAI / Grok: verified facts (official sources only, checked 19 September 2026)

Sources:

- docs.x.ai: image generation (`/developers/model-capabilities/images/generation`), the Imagine guide, models, pricing, the `grok-imagine-image-2.0` model page, rate limits, debugging, the security FAQ, regional endpoints, and the retirement notice for `grok-imagine-image-quality`;
- x.ai/legal: enterprise terms of service.

`x.ai/api` returned HTTP 403 to the fetch and could not be read. The documentation now brands the company "SpaceXAI".

| Topic | Fact |
|---|---|
| **Consumer plan ≠ API** | The API is governed by the **Enterprise** terms (separate from the Consumer terms for the Grok apps) and is **priced per generated image**. None of the pages read says a consumer plan, free or paid, includes API use. **The Grok consumer Free plan is not free API image generation.** |
| Models | `grok-imagine-image-2.0` (current); `grok-imagine-image` (older); `grok-imagine-image-quality` (**retiring 2 November 2026**, with 60 days' notice from 2 September) |
| **Price** | `grok-imagine-image-2.0`: **USD 0.04 per image**. `grok-imagine-image`: 0.02. `grok-imagine-image-quality`: 0.05. **No price difference by resolution (1K/2K) or quality is documented** on the pricing or model pages. A search summary mentioned an input-image (edit) charge that is **not confirmed** on the official pages read. |
| Quality tiers | `quality`: `low`, `medium`, `auto` (default) |
| Resolution | `resolution`: `1k` (default), `2k` |
| **Aspect ratios** | 1:1, **16:9**, 9:16, 4:3, 3:4, 3:2, 2:3, 2:1, 1:2, 19.5:9, 9:19.5, 20:9, 9:20, 21:9, 5:2, `auto` (default) |
| Editing / reference | `/v1/images/edits`; up to **5** reference images; public URL or base64 data URI |
| Images per request | `n` 1–10 (default 1) |
| **Response format** | `response_format`: `url` (**default**, "temporary hosted URLs") or `b64_json`. **We must request `b64_json`**, since a provider URL must never be kept. Under Zero Data Retention only base64 is allowed anyway. |
| Endpoint | `POST /v1/images/generations`, documented as **OpenAI-SDK compatible** (`base_url https://api.x.ai/v1`) |
| Usage reporting | Response usage fields are **not documented**. Because billing is per image, cost is price × images returned (deterministic). |
| Rate limits | Tiered by cumulative API spend since 1 January 2026 (Tier 0–4, then Enterprise). Image models use requests per second only: **6 RPS at Tier 0, up to 100 RPS**. The model page shows 6 RPS. |
| Retry-After | **Not documented**; exponential backoff is recommended on 429 |
| Request / provider id | **No request-id header is documented** |
| Idempotency / reconciliation | **No idempotency key documented.** Synchronous generation; no documented way to retrieve a lost result. The Batch API exists (disabled under ZDR); not used here. |
| Errors | 400, 401, 403, 404, 405, 415, 422 and 429 are documented. **5xx is not documented**; our rule applies (unknown outcome). |
| **Data** | API requests and responses are stored 30 days for abuse auditing; "xAI never trains on your API inputs or outputs without your explicit permission". **Zero Data Retention**: self-serve in the console where available, or negotiated. It forces base64-only image results. |
| **Processing location** | The model page lists **us-east-1, us-west-2**. The global endpoint "does not guarantee a processing region". The US endpoint serves only `grok-4.6` (no images). **There is no Australian or APAC region.** |
| Commercial use | Enterprise terms: "Customer owns all right, title and interest in and to the Output"; outputs "may not be unique" and may be inaccurate |
| **Lifecycle** | A retired model is **not refused**: requests to `grok-imagine-image-quality` "are served by `grok-imagine-image-2.0` with `quality` set to `low`", with a different price. **This is silent model and setting substitution**, so AI-PROVIDER-13 is required. |
| Moderation | The SDK exposes `respect_moderation` (whether the image passed moderation). No watermark or C2PA is documented. |

## 15. Three-way image comparison: OpenAI vs Gemini vs xAI

"Not documented" means the official pages read say nothing; nothing is inferred.

| Criterion | OpenAI `gpt-image-2.5-flare` | Gemini `gemini-3.1-flash-image` | xAI `grok-imagine-image-2.0` |
|---|---|---|---|
| **Cost / image** | **Unpublished.** Token rates only (USD 5 per 1M text in, 30 per 1M image out); no per-image token count | USD 0.067 at 1K, 0.101 at 2K, **plus unbounded billed thinking and text** (USD 3 per 1M). Flash-Lite: 0.0336 at 1K. Pro: 0.134. | **USD 0.04 flat** (1K or 2K, as documented) |
| Cost certainty for our fail-closed budget | Owner-entered bound needed | Image part published; thinking part needs a bound | **Exact**: no token uncertainty |
| Editorial quality | Vendor claims only | Vendor claims only | Vendor claims only |
| Prompt adherence | Claimed strong; admits weakness in layout and text placement | Not quantified | Not quantified |
| Photorealism | Not quantified | Not quantified | Not quantified |
| Text rendering | Documented "may struggle with precise text placement" | Not documented | Not documented |
| **16:9** | Only as a custom size (multiples of 16) | Native | Native |
| Resolution | Up to 3840 per edge (above 2560×1440 experimental) | 0.5K/1K/2K/4K (Flash) | 1K / 2K |
| Editing / references | Edits with mask; 4 references shown | Up to 14 references | Edits; up to 5 references |
| Latency | "up to 2 minutes" for complex prompts | Not documented (thinking always on) | Not documented |
| Usage reporting | Token usage in the response | Token usage, including thinking | Not documented (per-image billing) |
| Rate limits | 5 images/min at Tier 1 | Per-project tiers; numbers only in AI Studio | 6 RPS at Tier 0 upwards |
| Retry-After | Sent; honoured by 1E | Not documented | Not documented |
| Idempotency / reconciliation | None; a lost response is abandoned | None, **but a result can be retrieved by id** if stored (7–55 days) | None; a lost response is abandoned |
| Training / retention | Not trained on by default; abuse logs up to 30 days; ZDR lists 2.5-sunburst, **not flare** | Paid tier not used for improvement; **free tier must never be used**; stored interactions 7–55 days | Not trained on without permission; **30 days by default**; ZDR self-serve or negotiated |
| Processing location | **Australia available (regional storage)** | Not verified (Vertex page did not load) | **US regions only; location not guaranteed** |
| Provenance mark | Not documented | SynthID | Not documented |
| Lifecycle behaviour | Snapshots named per model | Deprecations dated (for example `gemini-2.5-flash-image` on 2 October 2026) | **Silent redirect of retired models** |
| API maturity | Mature images API | Interactions API generally available (path `v1beta`) | OpenAI-compatible; young product, recently rebranded |
| **Effort in this repository** | **Done** (adapter and tests) | **Medium-high** (new API shape, thinking-token pricing, optional reconciliation) | **Low-medium** (OpenAI-compatible; needs per-image pricing, `b64_json`, and model-substitution detection) |

Quality, prompt adherence, photorealism and text rendering **cannot be compared from documentation**. That is exactly what the controlled comparison (§19) is for. Photorealism is not simply a virtue here: the policy wants images that are clearly illustrative, never mistaken for documentary photographs.

## 16. Approximate monthly image cost (USD, standard prices, before tax)

"Regeneration" means a second paid image for the same article: 30 + 10 = 40 paid images.

| Model | 30 images | 30 + 10 regenerations (40) | 100 images |
|---|---:|---:|---:|
| xAI `grok-imagine-image-2.0` (0.04) | **1.20** | **1.60** | **4.00** |
| xAI `grok-imagine-image` (0.02) | 0.60 | 0.80 | 2.00 |
| Gemini `3.1-flash-lite-image` 1K (0.0336 plus thinking) | 1.01+ | 1.34+ | 3.36+ |
| Gemini `3.1-flash-image` 1K (0.067 plus thinking) | 2.01+ | 2.68+ | 6.70+ |
| Gemini `3.1-flash-image` 2K (0.101 plus thinking) | 3.03+ | 4.04+ | 10.10+ |
| Gemini `3-pro-image` 1K/2K (0.134 plus thinking) | 4.02+ | 5.36+ | 13.40+ |
| OpenAI `gpt-image-2.5-flare` | **not calculable officially** | — | — |
| OpenAI, *assumption*: 2,000 output tokens per image (≈ USD 0.06) | 1.80 | 2.40 | 6.00 |

"+" means billed thinking and text tokens come on top. At about 1,000 such tokens per image at USD 3 per 1M, they would add ≈ USD 0.003 per image: an assumption to be measured, not a documented figure.

**At Adelaide Sphere's volume, every option costs under about USD 14 a month.** The difference between providers is a few dollars. **Quality, adherence to the illustrative-only policy, and operational reliability should decide, not price.** The owner's USD 0.25 per-article cap and the image budget absorb any of them.

## 17. Implementation effort in this repository

| Provider | Work needed after P1 | Size |
|---|---|---|
| OpenAI | None beyond P1 (move to the neutral request). Optionally allow `gpt-image-2.5-sunburst` (ZDR-eligible). | Small |
| xAI | Adapter reusing the OpenAI image adapter shape (different base URL; `aspect_ratio`, `resolution` and `quality` instead of `size`; `response_format: b64_json`; 429 backoff without a header); per-image pricing unit; model-substitution guard; contract tests | Small-medium |
| Gemini | New adapter on the Interactions API; image-plus-text response; thinking and text pricing; grounding off; optional background/store reconciliation; contract tests | Medium-high |

**P1 (shared)**, needed before any second provider:

- the neutral image request;
- the price-unit model (per-token or per-image, plus a text/thinking bound);
- provider and model selection settings from the allowlist;
- provider request id capture;
- reported-model verification.

## 18. Gaps in the existing provider contract (1E)

1. **Request shape**: `ImageRequest.size` is an OpenAI `WIDTHxHEIGHT` value. It must become `{ aspectRatio, resolutionTier, quality }`, mapped by each adapter.
2. **Pricing unit**: price schedules and `maxImageCallCostMicros` are token-only. **Per-image pricing (xAI, and Gemini's published per-image prices) is not representable.** AI-IMAGE-PROVIDER-10.
3. **Settlement**: `imageTokenUsage` expects tokens and treats text output as unpriceable. That fails for xAI (no documented usage) and Gemini (always billed thinking). Settlement must support count × price, plus bounded text and thinking tokens.
4. **Model identity**: image results do not return the served model. An xAI-style silent substitution would go unnoticed. The adapter must return the reported model, and a mismatch or absence must be handled under AI-PROVIDER-13 (halt, or require a provider that reports it).
5. **Provider request id**: `ai_image_jobs` records no provider-side id (OpenAI returns none; Gemini an interaction id; xAI none documented).
6. **Response format**: the adapter must force inline base64 (xAI defaults to URLs). The contract should state "inline bytes only" (AI-IMAGE-PROVIDER-11).
7. **Selection**: `APPROVED_IMAGE_MODEL` is a single constant. Allowlist per provider, plus settings (`imageProvider`, `imageModel`).
8. **Capability record**: add aspect ratios, resolution tiers, quality tiers, pricing unit, reconciliation capability, processing location and retention (AI-PROVIDER-04 and -14).
9. **Retry without a header**: `retryAfterMs` returns 0 when no header is sent, which lets `releaseForRetry`'s own exponential backoff apply. That is correct for Gemini and xAI; it only needs a test per adapter.
10. **Comparison mode**: none yet (§19).

## 19. Proposed controlled provider comparison

- **Where:** the topic page's Featured image card, as a "Compare providers" action. It needs `ai_content.generate` **and** `ai_content.configure`.
- **What it does:** takes one approved, screened prompt (the same prompt-policy suffix and the same aspect and resolution, 16:9) and creates **one image operation per selected provider**. Only providers with an approved price and a configured key can be selected.
- **Confirmation:** a dialog listing each provider's reserved maximum and the total. It never runs automatically, and the daily slot can't use it.
- **Money:** each operation is reserved and settled separately against the image budget and the per-article cap. A refusal for one provider (budget, halt, missing price) doesn't cancel the others.
- **Results:** they go through quarantine, processing and READY, and are shown side by side with provider, model, cost, latency and any failure. They are marked `evaluation`: they **never supersede** an approved production image and are never attached automatically.
- **Choosing:** a person may choose one through the normal approval (actual image, alt text from the image, disclosure). That supersedes the others.
- **Records:** a short evaluation record per run (reviewer's scores for editorial fit, adherence, "illustrative, not documentary", text artefacts, and a note), kept for the provider decision.
- **Unknown outcomes:** an unknown outcome from one provider holds that job only.
- **Pilot size:** 5–10 briefs × 3 providers = 15–30 images, about USD 1–3 in total (§16).

## 20. Revised recommendation and pilot proposal

- **All three enter the controlled comparison:**
  - OpenAI `gpt-image-2.5-flare`, or `2.5-sunburst` if ZDR matters;
  - Gemini `gemini-3.1-flash-image` (1K, with 2K on a subset) and `gemini-3.1-flash-lite-image` as the low-cost reference;
  - xAI `grok-imagine-image-2.0` (1K and 2K, `quality: medium`).
- **Do not choose 1E.2 from price or documentation.** At under about USD 14 a month for any of them, the decision should rest on:
  - the pilot's editorial quality and adherence to the illustrative-only policy;
  - reliability: rate-limit and retry behaviour, and how often outcomes are unknown;
  - the data terms the owner accepts: xAI US-only processing with no guaranteed region and 30-day retention; OpenAI's Australian residency; Gemini's paid-tier terms and the under-18 clause.
- **Pragmatic order:**
  1. P1 (the shared contract fixes; required for any second provider).
  2. The xAI adapter (smallest).
  3. The Gemini adapter.
  4. Comparison mode.
  5. The pilot.
  6. The owner picks 1E.2.

  The remaining adapters stay built but inactive (no approved price means no calls). The existing OpenAI adapter can be piloted on its own immediately after P1.
- **Second adapter:** is no longer "deferred". **Building all three is what makes a fair comparison possible**, and after P1 each is a contained adapter, with no domain change.

## 21. Owner decisions remaining

1. **Approve this amendment** (SRS Amendment 01 and the matrix rows) and the work order P1 → xAI → Gemini → comparison mode → pilot, or a subset.
2. **Accounts**, each separately billed and **never a consumer plan**:
   - an OpenAI API key (exists, not configured);
   - a Google Cloud project with billing (Developer API or Vertex);
   - an xAI API team account.
3. **Data acceptance per provider:**
   - xAI: US-only processing, no region guarantee, 30-day retention (or request ZDR, base64 only);
   - Gemini: store for reconciliation (7+ days) or not; the under-18 clause (legal);
   - OpenAI: Australian residency (+10%) or not; the ZDR model choice.
4. **The pilot budget** (for example USD 5) and the briefs to use (5–10 non-documentary Adelaide editorial scenes).
5. **Resolutions to test** (1K vs 2K, for the 1,600-pixel hero).
6. **Choose 1E.2 after the pilot.**
7. **Fallback:** confirm none.

## 22. Implementation record: P1, xAI, Gemini and comparison mode (19 September 2026)

Owner-approved scope of 19 September 2026: **P1, then the xAI adapter, the Gemini image adapter, comparison mode and pilot preparation, then STOP.** 1E.2 is **not** selected. Nothing has been committed, pushed or deployed. **No live provider call** was made: every test uses fakes or fixture `fetch`.

### 22.1 What was built

| Slice | What |
|---|---|
| **P1: neutral request** | `ImageRequest {provider, model, prompt, aspectRatio, resolution, quality}`. Each adapter maps it to its own API: OpenAI to an exact size through the registry's `nativeSizes` (3:2 at 1k = 1536x1024, **byte-identical to 1E**); xAI to `aspect_ratio`/`resolution`/`quality`; Gemini to `aspect_ratio`/`image_size` "1K"/"2K". |
| **P1: capability registry** | `IMAGE_MODELS` in `packages/database/src/automation/providers.ts` replaces the single constant. Each entry declares: aspect ratios, resolutions, qualities, price unit, billed text/thinking, inline-bytes rule, served-model reporting, request id, reconciliation ("none" for all three), unknown outcome ("hold"), grounding, processing location, retention, prompt limit and sources. Listed: `gpt-image-2.5-flare`, `grok-imagine-image-2.0`, `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`. |
| **P1: selection** | The settings `imageProvider`, `imageModel`, `imageAspectRatio` and `imageResolution` (plus `imageQuality`, now with `auto`). Only a listed model is accepted, and only a request that model supports; defaults reproduce 1E. |
| **P1: pricing units** | Price schedules gain `pricingUnit` (`token`/`image`), `perImageMicros`, `textOutputMicrosPerMTok` and `maxTextOutputTokens`. `imageSize` now holds the resolution tier; the migration maps the 1E size 1536x1024 to `1k`. The domain `maxImageCallCostMicros`/`imageCallCostMicros` bound and price both units. Text or thinking output is priced whenever reported, and is unpriceable (never zero) without a rate. A per-image price that also bills tokens needs usage to settle. A proposal is refused unless its unit matches the model's billing and every billed part has a rate and a bound. |
| **P1: settlement** | `settleOperation({pricedMicros})` settles in the price's own unit. The served model is passed as the reported model. |
| **P1: provenance** | `ai_image_jobs` gains `aspectRatio`, `resolution`, `providerRequestId`, `servedModel` and `latencyMs`. |
| **P1: model substitution** (AI-PROVIDER-13) | A served model other than the approved one: settled as *uncertain*, **paid calls halted**, and the job fails as `model_substituted` (never a candidate). |
| **xAI adapter** | `apps/worker/src/ai-content/xai-image-provider.ts`: `POST /v1/images/generations`, **always `response_format: b64_json`**; a URL-only result is a charged result without bytes, and the URL is never kept. Billing is per image. **Superseded by §24:** the price is per configuration, the reservation takes the highest approved configuration, and settlement uses the reported `cost_in_usd_ticks`. Documented refusals are classified; 429 without Retry-After uses the shared backoff; 5xx and timeouts are unknown. |
| **Gemini adapter** | `gemini-image-provider.ts`: `POST /v1beta/interactions` with the key in `x-goog-api-key`, inline base64 image, **no tools** (grounding off) and **`store: false`**. Usage maps thought + text output to billed text output (without a modality breakdown, *all* output is priced as text on top of the image: an overstatement, never an understatement). The interaction id is recorded; `in_progress`, 408, 5xx and timeouts are unknown. |
| **Comparison mode** | `POST topics/:id/image-comparisons/quote` (creates nothing) and `POST topics/:id/image-comparisons` (Idempotency-Key; `expectedTotalMicros` must equal the quote). It needs `ai_content.view` + `generate` + `configure`. It takes 2–4 distinct settings with a shared aspect ratio and sends the same screened, policy-suffixed prompt to each. **One operation per provider**, each reserved and settled independently against the image budget and the per-article cap. The comparison is created **whole or not at all**: a refusal for one rolls back all, so a comparison is never lopsided. |
| **Comparison results** | Results use the new `comparison` slot, grouped by `comparisonRunId`. They go through the normal quarantine and media pipeline, **never supersede a featured version** and are never attached. A person approves one through the normal approval (image hash, alt text from the image, disclosure); that replaces the rest of the comparison. Approval also supersedes any other approved AI image (at most one). |
| **Evidence** | `GET image-evidence` (paginated, ≤ 50; `view` + `configure`) and the "Image pilot evidence" card on AI pricing. Per image, it shows: provider/model and served model; prompt, hash and policy version; aspect, resolution and quality; latency; reserved and actual cost; provider request id; MediaAsset id and hash; whether it was a regeneration (an earlier request for the article to the same provider and model); and the result. **No automated scoring.** |
| **Admin** | The price form is driven by `GET image-models` (per-image, text/thinking fields). The image card shows the served model, request id and time; "Compare providers" (quote table with each maximum, processing location and total, then "Run comparison (up to …)"); results side by side. |

### 22.2 Deviations and decisions made in implementation

- **All-or-nothing comparison**: §19 proposed that one provider's refusal would not cancel the others. The implementation refuses the whole comparison instead, for fairness and a predictable total. Every call is still reserved separately.
- **Per-article cap still applies** to comparison calls (not weakened). A four-way comparison reserves about USD 0.26 at the worst case, above the owner's USD 0.25 cap once a draft has been paid, so the pilot needs a temporary cap (§23).
- **Gemini `store: false`**: no retrieval-by-id reconciliation (the default would keep interactions 55 days). An unknown outcome is held, as for the others. Changing that is an owner decision (§21.3).
- **Gemini quality** is only `auto` (the API has no quality setting); its prices are keyed `auto`.
- **Served-model check** uses the existing rule that accepts `<approved>-<suffix>` snapshots and refuses anything else.
- **Not verified from official docs** (so the code is defensive): the exact placement of xAI's `model` field (top level or per image, both read); Gemini's error body `status` (read if present); per-image processing regions for the Gemini Developer API.

### 22.3 Verification (local, isolated test DB, fakes/fixtures only)

| Check | Result |
|---|---|
| Domain image pricing | 7/7 (per-image, token, per-image + thinking, unpriceable cases) |
| Worker AI adapters | OpenAI 6, **xAI 7, Gemini 7** contract tests (fixture fetch, no network) |
| 1E images integration spec | **13/13**: the original 10, plus xAI end to end (exact USD 0.04 settlement, `b64_json` enforced, substitution halt), Gemini end to end (image + input + thinking settled, interaction id) and the comparison (quote, 403 without configure, COST_CHANGED, all-or-nothing budget refusal, idempotent repeat, same prompt to all three, featured slot untouched, nothing attached, approval of one supersedes the rest, gate strictness, evidence) |
| `pnpm test` | database 31, API 346, admin 369, web 260, domain 141, mail 40, worker 146 |
| `pnpm test:integration` | database 5/5; API **44 files, 408/408** |
| `pnpm test:e2e` | 20/20 |
| typecheck, lint, builds (API, admin, worker), `contracts:check`, `db:migrations:check` | pass |
| Mutation checks (each restored) | substitution guard removed: 3 tests fail; comparison results allowed to supersede featured versions: the comparison test fails |

### 22.4 Migrations

- `20260919200000_ai_image_providers_p1`: additive columns, plus a one-row-class `UPDATE` mapping price `imageSize` 1536x1024 to `1k`.
- `20260919210000_ai_image_comparison`: adds the `comparison` slot value and `comparisonRunId`.

Both are applied to `adelaide_sphere_test` only. **Dev is two migrations behind and not migrated** (it needs owner authorisation). Until then the running dev API's image, pricing and evidence endpoints fail against dev.

## 23. Controlled image-quality pilot: proposal awaiting owner approval (no call made)

### 23.1 Matrix

8 briefs × 4 settings at 16:9, 1K:

- OpenAI `gpt-image-2.5-flare` medium;
- xAI `grok-imagine-image-2.0` **medium** (explicit; `auto` is not offered, §24);
- Gemini `gemini-3.1-flash-image` auto;
- Gemini `gemini-3.1-flash-lite-image` auto.

Plus a 2K subset on briefs 1–3 for xAI (2K medium) and Gemini Flash (for the 1,600 px hero), and at most 4 regenerations. That is **42 images at most.**

### 23.2 Cost ceiling (corrected 19 September 2026 for configuration-dependent xAI pricing, §24)

Worst-case **reservation** per call, with a 1,400-byte prompt. A call settles at or below its reservation, or it is recorded as uncertain at no less than its reservation and **all paid calls halt**:

| Setting | Maximum reserved per image | Basis |
|---|---:|---|
| OpenAI flare 1K medium | USD 0.097 | 1,400 × 5/M input + **3,000-token output bound** × 30/M (the owner sets the bound; no official per-image count) |
| xAI 2.0, any configuration | **USD 0.080** | reserved at the **highest approved configuration** (2K medium, USD 0.08); settled at the reported `cost_in_usd_ticks` (1K medium expected USD 0.06, 2K medium 0.08) |
| Gemini Flash Image 1K or 2K | **USD 0.114** | reserved at the **highest approved configuration** (2K: 0.101) + input (≤ 0.50/M, *to be confirmed on the pricing page*) + **4,000-token thinking bound** × 3/M; a 1K image settles near 0.068–0.080 |
| Gemini Flash-Lite Image 1K | USD 0.040 | 0.0336 + input + 4,000 × 1.50/M |

Pilot maximum (reservations):

- main 8 × (0.097 + 0.080 + 0.114 + 0.040) = 8 × 0.331 = **2.648**;
- 2K subset 3 × (0.080 + 0.114) = **0.582**;
- regenerations 4 × 0.114 = **0.456**;

for a total of **USD 3.686**.

Earlier figures:

- USD 2.98 assumed a flat USD 0.04 for xAI;
- USD 3.41 corrected xAI but reserved Gemini 1K at its own price. The isolated rehearsal (§24.7) showed the highest-approved-configuration rule applies to every per-image model.

**Enforced hard ceiling: USD 3.75**, by setting `imageDailyLimitMinor = imageMonthlyLimitMinor = 375` for the pilot. Budget reservations are released on settlement, so the ceiling bounds actual spend plus anything still reserved.

The only way to exceed it is a single call that the provider bills above its reservation. That call is recorded at the reported amount and halts every further paid call.

Expected xAI actual cost at the stated prices: 8 × 0.06 + 3 × 0.08 = USD 0.72, of 0.88 reserved.

The 8 host articles need drafts. Using existing drafts costs nothing. New drafts stay under the existing text caps (USD 0.50/day, at most USD 0.25 each, ≤ **USD 2.00**).

**Overall ceiling: USD 5.75**, with the text part optional.

### 23.3 Credentials and configuration required (owner)

1. **API accounts**, separately billed and never consumer plans:
   - an OpenAI API organisation;
   - an xAI API team under the Enterprise terms, with billing (ZDR optional);
   - a Google Cloud project with billing linked (paid tier; **never the free tier**) and a Gemini API key restricted to the Generative Language API.
2. **Keys**: `OPENAI_API_KEY`, `XAI_API_KEY` and `GEMINI_API_KEY`, only in `apps/worker/.env` or the secret store (never in chat, settings or git). Restart the worker afterwards.
3. **Dev DB**: the two migrations are applied (owner-authorised 19 Sep 2026, §24.4).
4. **Prices**, proposed then approved on AI pricing, **checked against the official pages on the day** (the public pricing page read on 19 Sep showed a flat USD 0.04; the owner's recheck found configuration-dependent prices):
   - OpenAI flare: `1k`/`medium`, token unit, maxOutputTokens 3,000.
   - xAI 2.0, image unit, input 0:
     - `1k`/`medium`: 60,000 micros;
     - `2k`/`medium`: 80,000 micros.

     Approve only the configurations the pilot uses (the reservation takes the highest approved one).
   - Gemini Flash, image unit: `1k`/`auto` 67,000 and `2k`/`auto` 101,000, input rate, text 3,000,000/M, bound 4,000.
   - Flash-Lite: `1k`/`auto` 33,600, text 1,500,000/M, bound 4,000.
5. **AI Settings for the pilot (entirely manual, §24.3):**
   - `enabled` on (required for any paid call);
   - `titleMode` manual;
   - `postingEnabled` off;
   - `publicationMode` review_required;
   - image mode hybrid;
   - image budgets 375/375 minor;
   - `maxWorkflowCostMinor` raised temporarily to **75** (restored to 25 afterwards);
   - disclosure and byline set.
6. **Data acceptance per provider** (§21.3):
   - xAI: US processing and 30-day retention;
   - Gemini: store off, SynthID, and the under-18 clause (legal);
   - OpenAI: residency not configured.

### 23.4 Proposed briefs

These are generic and illustrative, name no places, businesses or events (the prompt screen refuses names), and carry no readable text except brief 8:

1. A café breakfast flat-lay on pale timber: flat white, sourdough toast, sliced citrus, soft morning light.
2. An empty bar counter at dusk with warm pendant lights, stools and glassware, no signage.
3. A picnic rug under large gum trees, a basket and seasonal fruit, people shown only as hands.
4. A farmers' market stall with crates of seasonal produce and blank price cards, no logos.
5. A tree-lined riverside cycling path at golden hour, no landmarks.
6. Three wine glasses on a barrel top, soft vineyard rows in the background, no labels.
7. A calm beach at sunrise with a generic timber pier, no people and no identifiable structures.
8. A café chalkboard decorated with drawn coffee cups and leaves, **no words** (a text-artefact stress test).

Reviewers record, per result:

- editorial fit;
- prompt adherence;
- "illustrative, not documentary";
- text artefacts;
- a note.

These are recorded in the pilot record, not scored automatically. The owner then selects 1E.2.

## 24. Correction: configuration-dependent xAI pricing and provider-reported cost (19 September 2026)

### 24.1 What changed and why

The owner rechecked the xAI documentation and found configuration-dependent pricing for `grok-imagine-image-2.0`:

| Configuration | Price |
|---|---:|
| 1K / low | USD 0.04 |
| 2K / low | USD 0.06 |
| 1K / medium | USD 0.06 |
| 2K / medium | USD 0.08 |

The owner also found the reported cost field `usage.cost_in_usd_ticks`.

**Re-audit (official docs read 19 Sep 2026):**

| Source | What it says |
|---|---|
| Cost tracking | "1 USD = 10,000,000,000 ticks", and `cost_in_usd_ticks` is "the actual amount billed" (the image example is 400,000,000 = USD 0.04) |
| REST reference (images) | lists `usage.cost_in_usd_ticks` with token counts |
| Release notes | quality `auto` "currently uses `low` for image generation", and "images are billed at the quality they are served at" |
| Pricing and model pages, as fetched | still render a flat "$0.04 / image" |

The official pages disagree, so the implementation no longer depends on any single figure.

### 24.2 Implementation

- **Registry:**
  - xAI qualities are now `low` and `medium` only (`auto` is refused in settings, price proposals and the adapter, because its billed quality is decided by the provider);
  - `reportsCost: true` is declared for xAI;
  - one approved price per resolution and quality (approving one never retires another).
- **Reservation:** for per-image models, the most expensive **approved** configuration of the model (plus any token bounds). A result served in another approved configuration still fits the reservation.
- **Adapter:** `usage.cost_in_usd_ticks` is converted to micro-USD rounded **up** (10,000 ticks = 1 micro). Anything that is not a non-negative safe integer is ignored.
- **Settlement:**
  - where a cost is reported, the call settles at the reported amount, and it must equal the approved price for the requested configuration × images (tolerance 1 micro, for tick rounding);
  - otherwise it is settled as **uncertain**, at no less than its reservation (or the reported amount if higher), and **paid calls halt**, naming the price version;
  - without a reported cost, the approved configuration price settles it;
  - a model substitution still takes precedence and makes the result unusable;
  - `ai_image_jobs.reportedCostMicros` records the reported amount. The column was added to the uncommitted P1 migration, so dev still takes exactly two migrations, and `adelaide_sphere_test` was rebuilt with the owner's consent.
- **Evidence and admin:** the evidence table shows "provider billed" beside reserved and actual, and the price form says xAI needs one price per resolution and quality and that each result's billed cost must match.

### 24.3 The pilot stays entirely manual

A paid call needs the global `enabled` switch on. Under the pilot configuration (§23.3.5) the existing gates keep everything else off. This is **demonstrated by an integration test** ("keeps the pilot configuration entirely manual"):

| Entry point | Result under the pilot configuration |
|---|---|
| `ai-content.plan-slots` (every 5 min) | run at 07:05 local: "Daily slot inactive (slot disabled)"; `planSlots` returns `slot_disabled`, with nothing filled or missed |
| `ai-content.recover-operations` | "Nothing to recover" (it only re-queues existing operations and never repeats an external request) |
| `ai-content.retention` | "Nothing expired" |
| Topic discovery | has **no scheduled task**; the admin request is refused with `MANUAL_TITLE_MODE` |
| Generation, images, comparison | only by a person's explicit request |
| Automatic images, auto-publishing | refused when saved (400) |
| Publication | the scheduled publisher only publishes posts a person scheduled |

The test checks that operations, pending work, topics, slots, published and scheduled posts, and every budget bucket are unchanged, and that the schedule screen reports `active: false`.

### 24.4 Verification (fixtures only; no live call)

| Check | Result |
|---|---|
| xAI adapter contract | 8/8 (worker AI suites 79/79): tick conversion and rounding, invalid tick values ignored, `auto` refused before any request |
| Images/comparison integration spec | **14/14**: xAI reserved at 2K medium (80,000) and settled at the reported 60,000; a 2K cost on a 1K request settles uncertain at 80,000 and halts with the price version named; a cost above the reservation is recorded at 120,000, not capped; 600,000,001 ticks settles at 60,001; no reported cost settles at the approved price; substitution still halts; comparison quote reserves xAI at 80,000; the evidence shows the provider-billed figure; the pilot configuration is manual-only |
| Mutation: cost discrepancy disabled | caught (the xAI test fails) |
| `pnpm test` | database 31, API 346, admin 369, web 260, domain 141, mail 40, worker 147 |
| `pnpm test:integration` | database 5/5; API **44 files, 409/409** |
| `pnpm test:e2e`, typecheck, lint, contracts, migration policy, builds | pass |

### 24.5 Conflict noted (not changed)

SRS AI-IMAGE-PROVIDER-11 allows a received provider URL to be "fetched once, server-side, into quarantine". The adapters are stricter: a URL is never fetched, and the result is recorded as charged without bytes. The SRS is not edited; the owner may confirm the stricter behaviour.

### 24.6 Dev database migration and fixes found in live verification

- **Dev migrated (owner-authorised 19 Sep 2026, after a dump):**
  - a `mysqldump` of `adelaide_sphere_dev` (75 tables, "Dump completed") was taken to session scratch, not the repo;
  - `20260919200000_ai_image_providers_p1` and `20260919210000_ai_image_comparison` were applied with `pnpm db:migrate:deploy`, and the schema is up to date;
  - production is untouched, and no provider key is set in the dev worker, so no paid call is possible from dev.
- **Fixed after live checks on dev:**
  - the AI budget card showed "over 70%" for a zero image budget (a 1E display bug: 0 ≥ 70% of 0). The server no longer warns at a zero limit, and the card shows "no budget set" (admin and integration assertions added);
  - the price form's provider note ended in a doubled full stop;
  - the AI Settings header still said the values "do not enable execution in Phase 1A". It now says paid calls also need an approved price, a budget and a server-side key.

### 24.7 Rehearsal, correction override and admin placeholders (19 September 2026)

- **Isolated rehearsal** (`adelaide_sphere_test`, fixture providers only, no network). The owner's corrected topic was taken through:
  - fixture research (packet verified);
  - a fixture draft (covered, applied; Needs Fact Review);
  - the eight pilot prices, and the manual pilot settings;
  - a four-way comparison, quoted then confirmed.

  | Result | Reserved | Settled |
  |---|---:|---:|
  | OpenAI | 0.0915 | 0.0424 |
  | xAI | 0.0800 | 0.0600 (the reported cost matched the price) |
  | Gemini Flash | 0.1132 | 0.0684 (image, input and thinking) |

  All three processed to READY; nothing was attached.

  The Flash-Lite fixture wrongly reported `gemini-3.1-flash-image`. The substitution guard settled it as uncertain, halted paid calls and kept the image out. This showed the guard working and was a fixture error. It also showed that the highest-approved-configuration reservation applies to **every** per-image model, which led to the ceiling correction in §23.2 (USD 3.75).
- **Live dev research with real data** (owner-requested; free, no AI call):
  - The owner's topic brief named the wrong city and was truncated, so it was cancelled with a reason and re-added corrected.
  - Novelty then held the correction against its own cancelled original. This is correct under SRS §7 (rejected and cancelled history is never silently re-admitted), but there was no way to resubmit.
  - With owner approval, a **correction override** was added:
    - a reviewer may approve a topic whose *only* overlap is a cancelled topic, with a reason;
    - the cancelled topic stays on record, audited `ai_content.topic.replaced_by_correction`, and leaves novelty;
    - a rejected idea, an active topic or an article still decides;
    - no schema change;
    - research spec +2 tests, admin +1.
  - Dev research then fetched flinders.edu.au and studyadelaide.com (200, about 9 k and 19 k characters). The packet is in Needs Fact Review: no structured claims, and the hosts are unclassified in the source registry. The owner adds evidence-backed claims next. The draft is a paid call and was not made.
- **Admin placeholders** (owner request): every visible admin input now carries a static `placeholder` attribute (92 added).
  - Excluded where the attribute is invalid or never shown: file pickers (3), a radio (1), native date/time inputs (7), hidden form fields (6), a read-only link (1) and the `FormSelect` pass-through (callers set it).
- **Other UI fixes found live:**
  - stale AI Settings help text and save message (budget "no spending in this release", "future warnings");
  - provider and tier labels (OpenAI, xAI, Google Gemini, 1K/2K);
  - the image model as a dropdown of listed models;
  - lower-case topic action titles.
- **Browser verification in the isolated stack** was only partly completed. The owner's session there was not re-established before the stack stopped, so the comparison dialog, grouped results and forbidden states were verified by admin component tests and the integration spec, not by a live browser pass. Dev screens were verified live: settings, pricing and capabilities, the evidence empty state, validation, and the topic workflow.
