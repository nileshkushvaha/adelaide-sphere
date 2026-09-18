# ADELAIDE SPHERE
## AI Content Automation & Social Distribution
### Master Technical SRS / Source of Truth

| Field | Value |
| :--- | :--- |
| **Document version** | 1.0 |
| **Project** | Adelaide Sphere |
| **Primary use** | Source of truth for implementation and future Claude Code execution prompts |
| **Current scope** | Phase 1: AI Blog Automation; Phase 2: Social Media Automation |
| **Architecture principle** | Extend the existing Adelaide Sphere application and admin; do not create a parallel project or admin |
| **Location focus** | Adelaide, Australia |
| **Content niche** | Adelaide local discovery, city guides, food, restaurants, local businesses, services, events, lifestyle and useful local guides |
| **Design principle** | Configuration-driven, provider-neutral, cost-aware, audit-friendly and future product/SaaS ready |

> **Non-negotiable:** This document defines product behaviour and guardrails. Implementation prompts must conform to it. Existing stable functionality must be preserved unless a change is explicitly approved.

---

## Document Structure
1. Purpose and Goals
2. Product Vision and Scope Boundaries
3. Existing-System Integration Principle
4. Functional Scope Overview
5. Phase 1 - AI Blog Automation
6. Topic and Title Modes
7. Topic Discovery and Trend Research
8. Existing Content Context and Internal Linking
9. Research and Fact Verification
10. AI Content Generation
11. SEO Generation and Quality Controls
12. Image Workflow and Modes
13. Review, Approval and Publishing Workflow
14. Admin UX and Required Screens
15. Scheduling and Daily Publishing
16. State Machine and Status Model
17. Duplicate Prevention and Idempotency
18. Manual Edit Protection and Content Ownership
19. Cost Controls and Budget Guardrails
20. Provider Abstraction and Configuration
21. Phase 2 - Social Media Automation
22. Social Platform Publishing Rules
23. Security, Permissions and Secrets
24. Audit Logs, Observability and Notifications
25. Failure Handling, Retry and Recovery
26. Edge Cases and Hardening Matrix
27. Data Model and Suggested Entities
28. Testing, Deployment and Rollback
29. Future Enhancements and Explicitly Deferred Scope

---

## 1. Purpose and Goals
* Automate creation of one high-quality blog post per day while keeping running cost and human effort low.
* Allow both manual and automatic topic/title selection through settings.
* Generate useful, non-fake, locally relevant content grounded in verified information.
* Reuse Adelaide Sphere's existing blog/content data as context to avoid duplication and improve internal linking.
* Support manual, hybrid and automatic image workflows without requiring code changes.
* Prepare the architecture so the same engine can later be packaged and sold as a configurable product.
* Add social media distribution as a separate Phase 2 after the content pipeline is stable.

### Success criteria
* A daily scheduled run can safely produce at most the configured number of posts, default 1/day.
* Unverified factual content never auto-publishes.
* The same blog or social post is never created twice because of retries, duplicate cron triggers or concurrency.
* No automation overwrites a human-edited post without an explicit, safe workflow.
* Changing operational behaviour should normally require changing admin settings, not code.
* Every AI-generated artefact is traceable to its run, sources, prompt/version, model/provider and cost.

---

## 2. Product Vision and Scope Boundaries
Adelaide Sphere is the first production use case and proving ground. The feature should solve today's Adelaide Sphere needs without prematurely building a full multi-tenant SaaS. However, boundaries and interfaces should avoid hard-coding Adelaide-specific assumptions into the core engine.

| In scope now | Deferred / future |
| :--- | :--- |
| Configuration-driven AI blog workflow | Full multi-tenant billing and subscriptions |
| Manual/auto/hybrid title generation | White-label client onboarding portal |
| Web research and fact verification | Advanced editorial collaboration |
| SEO, internal linking and images | Advanced analytics/attribution/revenue forecasting |
| Review queue + auto-publish controls | AI-generated video |
| Social posting in Phase 2 | Large-scale content syndication network |

---

## 3. Existing-System Integration Principle
* Do not build a new project, new blog engine or separate admin panel.
* Extend the existing Adelaide Sphere admin and existing blog models/services/routes wherever appropriate.
* Before any code change, audit the current blog schema, media handling, SEO fields, author/tag/category relations, routes, queues, scheduler and admin conventions.
* Reuse existing abstractions instead of duplicating them. Add new tables only where the new domain requires durable state.
* All migrations must be additive and backward compatible unless explicitly approved.
* No destructive schema operation, field rename or production data rewrite without migration/rollback plan.

---

## 4. Functional Scope Overview

| Area | Phase 1 | Phase 2 |
| :--- | :--- | :--- |
| **Topic/title** | Manual, auto, hybrid | N/A |
| **Research** | Trend + niche + existing content | Use blog data to produce social copy |
| **Fact verification** | Mandatory gate for factual claims | Use source blog as canonical |
| **Content** | Article + SEO + FAQ/structured fields where supported | Platform-specific captions/posts |
| **Images** | Manual/hybrid/automatic | Reuse blog/social image or configured derivative |
| **Approval** | Configurable draft/review/auto | Per-platform configurable review/auto |
| **Publishing** | Blog publish scheduler | Official platform APIs/connectors |
| **Hardening** | Dedupe, idempotency, budgets, audits | Per-platform dedupe, retry, audit |

---

## 5. Phase 1 - AI Blog Automation
Phase 1 is the priority. It must be production safe before Phase 2 begins.
1. Admin can add a topic/title manually, or allow the system to generate it.
2. System checks niche fit, duplication, cannibalisation risk and previously queued ideas.
3. System gathers relevant existing Adelaide Sphere content and fresh public web research.
4. System extracts verifiable facts and source references before article generation.
5. AI generates article draft using verified research plus existing-site context.
6. SEO metadata, suggested internal links, image plan/prompt and alt text are generated.
7. A quality/fact gate assigns the item to Ready for Review, Needs Fact Review or auto-publish eligibility.
8. Scheduler publishes only when all configured gates pass.

---

## 6. Topic and Title Modes

| Mode | Behaviour | Required controls |
| :--- | :--- | :--- |
| **Manual** | Admin supplies title/topic. System still performs duplicate, research and quality checks. | Allow title lock; optionally allow AI title refinement only with admin permission. |
| **Automatic** | System discovers/selects topic and generates title automatically. | Niche/location filters, trend weight, duplicate checks, approval mode, daily limit. |
| **Hybrid** | If admin supplies title, use it; if blank, AI generates one. Admin can override before generation/publish. | Per-item override, global default, no silent replacement of entered title. |

> **Core requirement:** Title mode and me approval mode are independent settings. Example: automatic title generation may still require human approval before article generation or publishing.

---

## 7. Topic Discovery and Trend Research
* Use both current/trending public information and Adelaide Sphere's existing content inventory.
* Trend research must be constrained to the configured niche and location.
* A trending topic is not automatically publishable; it must pass relevance, duplication and factual-source checks.
* Avoid chasing unrelated viral trends only for traffic.
* Prefer evergreen + timely local utility: guides, openings/changes, seasonal activities, neighbourhood/local-business discovery, useful explainers.
* Record why a topic was selected: manual, trend signal, content gap, internal data, seasonal rule or editorial queue.
* Keep a rejected-topic history so repeatedly rejected or duplicate ideas are not regenerated.

---

## 8. Existing Content Context and Internal Linking
* Do not send the entire blog database to the AI for each request.
* Retrieve a small, relevant set of existing posts using search/relevance logic; target roughly 3-5 strong related items unless a different number is configured.
* Use existing article titles, summaries/key facts, canonical URLs/slugs, categories/tags and relevant entities as context.
* New content must not copy or lightly paraphrase existing posts.
* Internal links must be contextually justified, not inserted mechanically.
* Prevent circular or excessive linking and cap internal-link suggestions by configuration.
* If an existing post already fully satisfies the topic, prefer updating/surfacing that post rather than generating a competing article; flag for editorial decision.

---

## 9. Research and Fact Verification
Fact accuracy is a hard publication gate. Adelaide Sphere must not invent places, businesses, addresses, opening hours, prices, events or other real-world facts.

| Rule | Requirement |
| :--- | :--- |
| **Source quality** | Prefer primary/official sources for businesses, venues, government, event organisers and authoritative local information. |
| **Cross-check** | For higher-risk or changeable facts, corroborate where reasonable. |
| **Freshness** | Store retrieval timestamp and source URL; treat hours, price, event dates and availability as highly time-sensitive. |
| **Unverified facts** | Mark as unresolved; do not present as fact. |
| **Publish gate** | Any material unresolved factual claim forces Needs Fact Review / Draft, even if full auto-publish is enabled. |
| **Source failure** | If research provider/search fails, never fall back to hallucination. Stop or create a research-incomplete draft. |

* Claims about a place or business should be associated with the source(s) used to verify them.
* If sources disagree, flag the discrepancy for review rather than choosing silently.
* Do not infer exact prices, ratings, operating hours, addresses or event details from stale memory.
* Use cautious language for inherently changeable information and avoid promises of permanence.

---

## 10. AI Content Generation
* Generate a useful article, not keyword-stuffed filler.
* Write for humans first; maintain Adelaide/local context and the site's editorial tone.
* Use a structured outline before final body generation when it improves quality/cost.
* Ground factual sections only in the research packet supplied to the model.
* Where supported by the existing blog schema, produce excerpt, introduction, headings, body, FAQs, conclusion/CTA, tags/categories and structured content fields.
* Preserve an immutable record of the AI run inputs/outputs needed for audit while respecting data-retention limits.
* Prompt/model changes must be versioned so differences can be traced.

---

## 11. SEO Generation and Quality Controls
* Generate SEO title, meta description, slug suggestion, canonical intent, primary topic/keyword and secondary semantic terms.
* Avoid duplicate SEO titles, duplicate slugs and keyword cannibalisation with existing posts.
* Do not promise ranking or traffic results.
* Generate clean heading hierarchy and readable excerpts.
* Where the existing site supports schema/structured data, populate only fields that can be truthfully supported.
* Generate image alt text based on the actual selected/generated image, not generic keyword stuffing.
* Apply length/readability checks as guidance, not rigid rules that reduce usefulness.

---

## 12. Image Workflow and Modes

| Image mode | Behaviour |
| :--- | :--- |
| **Manual** | System generates image brief/prompt, recommended placement/aspect ratio and alt-text draft. Admin creates/selects/uploads the image. |
| **Automatic** | System calls configured image provider, stores result through the existing media pipeline, and attaches only after validation. |
| **Hybrid** | Default can be prompt-only, with per-item 'Generate now' action; or automatic with admin replacement before publish. |

* Global default plus per-post override.
* Configurable maximum image count; low-cost default should be one featured image and optional supporting image only when justified.
* Never regenerate repeatedly because of retries; generated image jobs need idempotency keys.
* Validate file type, dimensions, size, storage success and media record before marking image step complete.
* Do not publish a broken image URL.
* If image generation fails, either continue with manual-image-needed status or hold publication according to settings.
* Store generation prompt/provider/model/cost metadata for audit.

---

## 13. Review, Approval and Publishing Workflow

| Status | Meaning | Can auto-publish? |
| :--- | :--- | :--- |
| **Idea / Queued** | Topic exists but processing not started | No |
| **Researching** | Research/fact extraction in progress | No |
| **Generating** | Article generation in progress | No |
| **Needs Fact Review** | One or more material facts unresolved/conflicting | Never |
| **Ready for Review** | Generation complete; human approval required by configuration | No until approved |
| **Approved** | Human-approved and eligible for schedule | Yes |
| **Scheduled** | Publish time reserved | Yes at scheduled time |
| **Published** | Canonical blog post successfully published | N/A |
| **Failed** | Processing/publish failure requiring retry or review | No |
| **Cancelled / Rejected** | Editorially stopped | No |

* Full-auto mode may skip human approval only if all mandatory verification and quality gates pass.
* A manual approval must be attributable to an admin user and timestamp.
* If an approved draft changes materially after approval, approval must be invalidated or re-confirmed.
* Publishing is a separate transactional step; generation success is not equal to publish success.

---

## 14. Admin UX and Required Screens
* **AI Content dashboard** with counts: Queued, Processing, Ready for Review, Needs Fact Review, Scheduled, Failed.
* **Topic Queue:** create manual topic/title, bulk add ideas, reorder/prioritise, pause/cancel.
* **AI Content Review:** article preview, source evidence, unresolved facts, SEO fields, image plan, internal links, approve/reject/regenerate selected section.
* **Needs Fact Review** filter/view as a first-class queue.
* **Settings:** content mode, title mode, approval mode, posting frequency, timezone, niche/location, provider/model choices, image mode, budget limits, source/research options.
* **Run history/audit view** showing status transitions, retry count, provider/model usage, estimated/actual cost and errors.
* Safe actions must require confirmation where destructive or costly.

---

## 15. Scheduling and Daily Publishing
* **Default schedule:** one post per day, configurable.
* Use the application's existing scheduler/queue infrastructure; do not create a second scheduler.
* Use site timezone explicitly.
* Scheduler should select only eligible items and atomically claim one job.
* Multiple scheduler invocations must not create multiple posts for the same slot.
* Missed schedules should follow configurable catch-up policy: skip, publish next slot or require review.
* Allow temporary pause without deleting queued ideas.
* Respect per-day and per-month generation/publishing caps.

---

## 16. State Machine and Status Model
State changes must be explicit, validated and auditable. Do not use loose boolean combinations that allow impossible states.

| From | Allowed examples | Blocked examples |
| :--- | :--- | :--- |
| **Queued** | Researching, Cancelled | Published |
| **Researching** | Generating, Needs Fact Review, Failed | Scheduled |
| **Generating** | Ready for Review, Needs Fact Review, Approved (auto mode), Failed | Published directly |
| **Ready for Review** | Approved, Rejected, Generating (controlled regeneration) | Published without approval |
| **Approved** | Scheduled, Published (if immediate), Ready for Review after material edit | Needs Fact Review without reason |
| **Scheduled** | Published, Failed, Cancelled | Generating |
| **Published** | Social queue creation in Phase 2 | Regenerate in place/overwrite body silently |

---

## 17. Duplicate Prevention and Idempotency
* Create durable idempotency keys for topic processing, article generation, image generation, publishing and each social-platform send.
* Use database-level unique constraints wherever a business invariant can be enforced there.
* A queue retry must continue/reconcile the same work item, not create a new blog post.
* Duplicate detection should check exact/normalised title, slug, semantic similarity, same source event/entity and previously rejected/queued ideas.
* Publishing must atomically associate the automation item with the canonical existing blog post ID.
* If a worker crashes after the external side effect succeeds but before local commit, reconciliation must detect the already-created result.
* Concurrency tests are mandatory for scheduler and publish paths.

---

## 18. Manual Edit Protection and Content Ownership
* Once a human edits an AI draft, record that it is human-modified and protect it from blind regeneration.
* Regenerate should be granular where practical: title, SEO, section, image prompt, or full article with explicit confirmation.
* Never overwrite an already published article through the automation pipeline.
* Updates to published content should be a separate future/update workflow, not the create workflow.
* If regeneration occurs after approval, invalidate approval if the changed fields are material.
* Store version/revision metadata for AI-generated drafts when practical.

---

## 19. Cost Controls and Budget Guardrails
* Optimise for low operating cost because the site is not yet earning meaningful revenue.
* Use cheaper models for lightweight tasks (classification, title candidates, metadata) and stronger models only where quality materially benefits.
* Do not send unnecessary full-site content to the model.
* Set configurable daily/monthly token, research and image budgets.
* **Soft threshold:** warn/admin dashboard alert. **Hard threshold:** stop new paid generation while preserving manual workflow.
* Never repeatedly spend money on the same failed task because of uncontrolled retries.
* Track estimated and actual provider usage by run, article and month.

---

## 20. Provider Abstraction and Configuration
* Core domain must not depend directly on one AI vendor.
* Use provider interfaces/adapters for text generation, image generation and research/search where practical.
* Provider credentials remain server-side; never expose secrets to browser code.
* Configuration should support model selection and controlled fallback.
* Fallback must not weaken the fact-verification rules.
* Provider outage should degrade gracefully to pending/review state, not produce fabricated content.

---

## 21. Phase 2 - Social Media Automation
* Phase 2 starts only after Phase 1 is stable in production.
* When a blog is published, create a social-distribution job according to configured platforms.
* Generate platform-specific copy from the canonical published blog, not from an unapproved draft.
* Support per-platform ON/OFF and approval/automatic modes.
* Allow selected existing published blogs to be backfilled into the social queue.
* Use official APIs/connectors where available; avoid mandatory paid third-party schedulers.
* Track platform post IDs/URLs/status so retries cannot double-post.

---

## 22. Social Platform Publishing Rules

| Rule | Requirement |
| :--- | :--- |
| **Canonical source** | Published Adelaide Sphere article |
| **Platform copy** | Adapt length/style per platform; do not merely paste identical text everywhere |
| **Link** | Use canonical article URL with safe tracking parameters if configured |
| **Media** | Reuse/select approved article image; do not auto-generate a new paid image unless configured |
| **Approval** | Global default + per-platform override |
| **Dedupe** | Unique constraint on article + platform + account + campaign/version |
| **Retry** | Retry transient failures; do not resend after confirmed external success |
| **Backfill** | Explicit admin action and date/rate limits to avoid spam |

* Initial target platforms may include Facebook/Instagram via Meta APIs and LinkedIn, subject to current account types, app permissions and platform policies at implementation time. Platform requirements must be re-verified before coding.

---

## 23. Security, Permissions and Secrets
* Only authorised admin roles can change AI providers, budgets, auto-publish, social credentials or automation settings.
* Separate permissions for view, generate, approve, publish, configure and manage credentials where the existing admin framework supports it.
* Encrypt or use secret storage for provider tokens; never log raw API keys/access tokens.
* Validate all admin inputs server-side.
* Treat web research content as untrusted input; prompts must defend against prompt injection in fetched content.
* Do not let source webpage instructions override system/application rules.
* Sanitise generated HTML/content using the existing safe rendering approach.

---

## 24. Audit Logs, Observability and Notifications
* Audit setting changes, approvals, rejections, manual overrides, budget changes, provider changes and publish actions.
* Log state transitions with correlation/run ID.
* Capture structured errors without leaking secrets.
* Dashboard should surface failed/stuck jobs and items needing review.
* Notify admin for repeated failures, budget hard-stop, missing credentials, source verification failure bursts or social auth expiry.
* Define stale-job detection and recovery procedure.

---

## 25. Failure Handling, Retry and Recovery

| Failure | Expected behaviour |
| :--- | :--- |
| **Research provider unavailable** | Retry with bounded backoff; then mark Failed/Research Incomplete. Never hallucinate. |
| **AI text generation timeout** | Retry same idempotent job within cap; no duplicate article. |
| **Image generation failure** | Follow setting: hold for manual image or continue without image only if allowed. |
| **Database write failure** | Transaction rollback; external side effects reconciled before retry. |
| **Publish succeeds, worker crashes** | Reconcile via durable mapping/idempotency; do not create another post. |
| **Scheduler runs twice** | Only one atomic claim for the slot/work item. |
| **Social API returns uncertain response** | Query/reconcile external state before retry if possible. |
| **Budget exceeded** | Stop paid generation and flag item; do not silently bypass budget. |

* Retries must be bounded and exponential/backoff aware where appropriate.
* Permanent validation or fact-verification failures are not retry storms.
* Provide admin 'Retry' for recoverable failures and 'Reset to review' where safe.

---

## 26. Edge Cases and Hardening Matrix

| Edge case | Guardrail |
| :--- | :--- |
| **Same cron runs on two servers** | Atomic DB claim/lock + unique schedule key |
| **Same manual title added twice** | Normalised duplicate + semantic similarity warning/block |
| **AI creates similar title with different wording** | Semantic/cannibalisation check |
| **Topic becomes stale before publish** | Freshness check before scheduled publish for time-sensitive content |
| **Business closes/changes hours after research** | Timestamp source; recheck high-volatility facts if delayed |
| **Sources conflict** | Needs Fact Review |
| **No reliable source exists** | Draft/Needs Fact Review, never invent |
| **Human edits while worker is running** | Optimistic version/updated_at guard; worker must not overwrite newer human version |
| **Admin changes settings mid-run** | Run uses snapshot of settings; next run uses new settings |
| **Provider returns malformed JSON** | Validate schema; repair once if safe; otherwise fail visibly |
| **Partial image upload** | Do not attach until storage + DB record valid |
| **Slug collision** | Use existing slug allocator/unique constraint; do not overwrite |
| **Post publish transaction partially fails** | Reconcile canonical post mapping |
| **Article approved then regenerated** | Invalidate approval |
| **Auto-publish ON but unresolved fact** | Fact gate wins; keep draft |
| **Monthly budget hits during multi-step run** | Stop before next paid step; preserve progress |
| **Queue retries after success** | Idempotency returns existing result |
| **Social token expired** | Mark auth-required; do not repeatedly retry |
| **Social post published but response lost** | Reconcile by request/idempotency/external lookup before resend |
| **Backfill hundreds of old blogs** | Rate-limit and require explicit batch controls |
| **Malicious prompt text in source webpage** | Treat source as data only; ignore embedded instructions |
| **Deleted related internal post** | Validate link existence before publish |
| **Existing post edited/slug changed** | Resolve canonical URL at publish time |
| **Timezone/DST shift** | Use explicit site timezone and timezone-aware scheduling |
| **Admin disables automation** | Do not start new jobs; define whether in-flight jobs finish or pause |
| **Database migration rollback** | Additive migrations; reversible where practical |
| **Worker dies while holding job** | Lease/stale claim timeout + safe requeue |
| **Duplicate external webhook/event** | Idempotent consumer |
| **Unknown model/provider cost spike** | Budget caps + provider/model allowlist |
| **Unexpected huge generated response** | Token/output limits + validation |

---

## 27. Data Model and Suggested Entities
Exact schema must be adapted to the existing project after audit. Names below describe domain responsibilities, not mandatory table names.

| Entity / concept | Purpose / key fields |
| :--- | :--- |
| **AIContentSetting** | Site-level defaults: title mode, approval mode, publish cadence, niche/location, provider/model IDs, image mode, budgets. |
| **AIContentItem** | One topic/article automation unit: source, proposed title, state, priority, scheduled_at, canonical blog_post_id, human_modified flag. |
| **AIResearchRun** | Query/research metadata, provider, status, source list, extracted claims, timestamps. |
| **AIContentRun** | Prompt/version, model/provider, input refs, output, token/cost metadata, status, retry count. |
| **AIFactClaim** | Claim text/type, source refs, verification status, volatility/freshness metadata. |
| **AIImageJob** | Prompt, provider/model, mode, media ID, status, cost/idempotency key. |
| **AIApproval** | Item, reviewer, decision, timestamp, content version/hash. |
| **AISocialJob (Phase 2)** | Article + platform/account, caption version, external post ID, status, scheduled_at, idempotency key. |
| **AIAuditEvent** | Actor/system, event type, before/after metadata, correlation ID. |

> Prefer relationships to existing blog, media, admin user, category/tag and SEO models instead of duplicating those records.

---

## 28. Testing, Deployment and Rollback

### Required tests
* **Unit tests** for state transitions, duplicate matching rules, budget decisions, approval invalidation and source-verification gates.
* **Integration tests** for research -> generation -> review -> publish flow using provider fakes/mocks.
* **Concurrency tests** for scheduler claim and publish idempotency.
* **Retry tests** proving one external result is created despite worker retries.
* **Permission tests** for settings, approvals, publish and credentials.
* **Regression tests** proving existing manual blog CRUD/publishing still works.
* **Phase 2 tests** for article+platform dedupe and lost-response reconciliation.

### Deployment approach
1. Feature-flag the automation initially.
2. Run migrations first; deploy code with automation disabled.
3. Configure provider credentials and budgets.
4. Use manual title + review-required + manual/hybrid images as safest first production mode.
5. Run controlled articles and inspect logs/cost/source evidence.
6. Enable daily scheduler after successful acceptance.
7. Enable full-auto only after quality is proven.
8. Phase 2 released behind separate feature flags.

### Rollback
* Disabling feature flags must immediately stop new automated work without breaking ordinary blog functions.
* Do not delete generated/published data during rollback.
* Failed deployment must not require destructive database rollback to restore existing blogging.

---

## 29. Future Enhancements and Explicitly Deferred Scope
* True multi-tenant SaaS configuration and tenant isolation.
* Client onboarding wizard and white-label branding.
* Subscription plans, quotas, metering and billing.
* Advanced content calendar and editorial teams.
* Performance feedback loop using Search Console/analytics to refine topic selection.
* Automated content refresh/update workflow for existing published posts.
* More social platforms and campaign scheduling.
* Image library reuse/deduplication and brand style profiles.
* Automated email/newsletter distribution.
* Guest-post marketplace workflows and monetisation tooling.
* Advanced revenue attribution and ad/affiliate opportunity scoring.
* AI video/reels generation only after text/social workflow is commercially justified.

---

## Implementation DO NOT List
* Do **NOT** create a separate application or separate admin panel.
* Do **NOT** bypass the existing blog service/model conventions without a documented reason.
* Do **NOT** auto-publish unverified factual claims.
* Do **NOT** allow retry logic to create duplicate blogs, images or social posts.
* Do **NOT** overwrite human-edited or already-published content silently.
* Do **NOT** hard-code Adelaide-specific configuration inside reusable core services where a setting belongs.
* Do **NOT** hard-code OpenAI or any single provider into the domain layer.
* Do **NOT** expose API keys/tokens to the client.
* Do **NOT** build deferred SaaS billing/multi-tenancy now.
* Do **NOT** optimise for article quantity at the expense of accuracy and usefulness.

---

## Claude Code Execution Rules
1. Treat this SRS as the source of truth. Do not invent product requirements.
2. Before implementation, audit the actual repository and produce a concise gap analysis: existing components to reuse, migrations needed, risks and files likely to change.
3. If the repository contradicts an assumption in this SRS, stop and report the conflict rather than silently restructuring the project.
4. Implement Phase 1 in small, testable workstreams. Do not begin Phase 2 until Phase 1 acceptance criteria pass.
5. Preserve backward compatibility and current manual blog operations.
6. Every workstream must include tests, migration safety, idempotency and failure-path handling.
7. At the end of each workstream, provide: changed files, migrations, tests, settings/env changes, deployment notes, rollback notes, unresolved items and proof that existing behaviour remains intact.

---

## Acceptance Checklists

### Phase 1 Acceptance Checklist
- [ ] Admin can select Manual / Automatic / Hybrid title mode.
- [ ] Automatic topics use trends + niche + existing content context.
- [ ] Duplicate/cannibalisation checks run before generation.
- [ ] Verified research packet is stored and visible for review.
- [ ] Unverified material facts force Needs Fact Review.
- [ ] Content + SEO + internal links are generated without overwriting existing posts.
- [ ] Manual / Hybrid / Automatic image modes work through settings.
- [ ] Ready for Review and Needs Fact Review admin queues exist.
- [ ] Approval and auto-publish are independently configurable.
- [ ] One-per-day scheduler is idempotent under duplicate triggers.
- [ ] Human edits are protected from background overwrites.
- [ ] Budget caps and usage logs work.
- [ ] Existing manual blog workflow passes regression tests.
- [ ] Feature can be disabled cleanly.

### Phase 2 Acceptance Checklist
- [ ] Published blog can create social jobs for enabled platforms.
- [ ] Each platform can be independently automatic or review-required.
- [ ] Captions are platform-specific and derived from the canonical published article.
- [ ] Same article cannot be posted twice to the same platform/account because of retries.
- [ ] Existing published blogs can be manually backfilled with rate controls.
- [ ] External post IDs/status are stored and auditable.
- [ ] Expired credentials and partial failures are surfaced without duplicate sends.

---

> **Final product principle:** Build the smallest production-grade core that is useful for Adelaide Sphere today, but keep configuration, provider boundaries, idempotency, auditability and data ownership strong enough that the engine can later become a sellable product without a rewrite.