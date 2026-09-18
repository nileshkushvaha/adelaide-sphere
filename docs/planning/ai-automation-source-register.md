# AI Automation SRS source register

Also cross-checked against the [repository Markdown copy](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/adelaide_sphere_ai_content_automation_srs.md) (SHA-256 `6fb01027ab15cbc900f3d767a41f511c63759aba6a98fac89ced6a85fdc9833c`). Its requirements match the DOCX apart from a non-semantic extra “me” in §6. The numbered DOCX register remains the stable trace reference.

Source: [master SRS](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/Adelaide_Sphere_AI_Content_Automation_Master_SRS_v1.0.docx). SHA-256: `9cef4ed2fb4fc176b4bec46299b6a45ee3f037d4b4255c4a63ba39569d2c3fb4`. Read-only extraction of document paragraphs and table rows in document order. Table cells are separated by ` | `. IDs below exist only to make the accompanying [matrix](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-automation-requirement-matrix.md) auditable. The DOCX remains authoritative; its contents have not been edited.

<a id="srs-001"></a>

**001** ADELAIDE SPHERE

<a id="srs-002"></a>

**002** AI Content Automation & Social Distribution

<a id="srs-003"></a>

**003** Master Technical SRS / Source of Truth

<a id="srs-004"></a>

**004** Field | Value

<a id="srs-005"></a>

**005** Document version | 1.0

<a id="srs-006"></a>

**006** Project | Adelaide Sphere

<a id="srs-007"></a>

**007** Primary use | Source of truth for implementation and future Claude Code execution prompts

<a id="srs-008"></a>

**008** Current scope | Phase 1: AI Blog Automation; Phase 2: Social Media Automation

<a id="srs-009"></a>

**009** Architecture principle | Extend the existing Adelaide Sphere application and admin; do not create a parallel project or admin

<a id="srs-010"></a>

**010** Location focus | Adelaide, Australia

<a id="srs-011"></a>

**011** Content niche | Adelaide local discovery, city guides, food, restaurants, local businesses, services, events, lifestyle and useful local guides

<a id="srs-012"></a>

**012** Design principle | Configuration-driven, provider-neutral, cost-aware, audit-friendly and future product/SaaS ready

<a id="srs-013"></a>

**013** Non-negotiable: This document defines product behaviour and guardrails. Implementation prompts must conform to it. Existing stable functionality must be preserved unless a change is explicitly approved.

<a id="srs-014"></a>

**014** Document Structure

<a id="srs-015"></a>

**015** 1. Purpose and Goals

<a id="srs-016"></a>

**016** 2. Product Vision and Scope Boundaries

<a id="srs-017"></a>

**017** 3. Existing-System Integration Principle

<a id="srs-018"></a>

**018** 4. Functional Scope Overview

<a id="srs-019"></a>

**019** 5. Phase 1 - AI Blog Automation

<a id="srs-020"></a>

**020** 6. Topic and Title Modes

<a id="srs-021"></a>

**021** 7. Topic Discovery and Trend Research

<a id="srs-022"></a>

**022** 8. Existing Content Context and Internal Linking

<a id="srs-023"></a>

**023** 9. Research and Fact Verification

<a id="srs-024"></a>

**024** 10. AI Content Generation

<a id="srs-025"></a>

**025** 11. SEO Generation and Quality Controls

<a id="srs-026"></a>

**026** 12. Image Workflow and Modes

<a id="srs-027"></a>

**027** 13. Review, Approval and Publishing Workflow

<a id="srs-028"></a>

**028** 14. Admin UX and Required Screens

<a id="srs-029"></a>

**029** 15. Scheduling and Daily Publishing

<a id="srs-030"></a>

**030** 16. State Machine and Status Model

<a id="srs-031"></a>

**031** 17. Duplicate Prevention and Idempotency

<a id="srs-032"></a>

**032** 18. Manual Edit Protection and Content Ownership

<a id="srs-033"></a>

**033** 19. Cost Controls and Budget Guardrails

<a id="srs-034"></a>

**034** 20. Provider Abstraction and Configuration

<a id="srs-035"></a>

**035** 21. Phase 2 - Social Media Automation

<a id="srs-036"></a>

**036** 22. Social Platform Publishing Rules

<a id="srs-037"></a>

**037** 23. Security, Permissions and Secrets

<a id="srs-038"></a>

**038** 24. Audit Logs, Observability and Notifications

<a id="srs-039"></a>

**039** 25. Failure Handling, Retry and Recovery

<a id="srs-040"></a>

**040** 26. Edge Cases and Hardening Matrix

<a id="srs-041"></a>

**041** 27. Data Model and Suggested Entities

<a id="srs-042"></a>

**042** 28. Testing, Deployment and Rollback

<a id="srs-043"></a>

**043** 29. Future Enhancements and Explicitly Deferred Scope

<a id="srs-044"></a>

**044** 1. Purpose and Goals

<a id="srs-045"></a>

**045** Automate creation of one high-quality blog post per day while keeping running cost and human effort low.

<a id="srs-046"></a>

**046** Allow both manual and automatic topic/title selection through settings.

<a id="srs-047"></a>

**047** Generate useful, non-fake, locally relevant content grounded in verified information.

<a id="srs-048"></a>

**048** Reuse Adelaide Sphere's existing blog/content data as context to avoid duplication and improve internal linking.

<a id="srs-049"></a>

**049** Support manual, hybrid and automatic image workflows without requiring code changes.

<a id="srs-050"></a>

**050** Prepare the architecture so the same engine can later be packaged and sold as a configurable product.

<a id="srs-051"></a>

**051** Add social media distribution as a separate Phase 2 after the content pipeline is stable.

<a id="srs-052"></a>

**052** Success criteria

<a id="srs-053"></a>

**053** A daily scheduled run can safely produce at most the configured number of posts, default 1/day.

<a id="srs-054"></a>

**054** Unverified factual content never auto-publishes.

<a id="srs-055"></a>

**055** The same blog or social post is never created twice because of retries, duplicate cron triggers or concurrency.

<a id="srs-056"></a>

**056** No automation overwrites a human-edited post without an explicit, safe workflow.

<a id="srs-057"></a>

**057** Changing operational behaviour should normally require changing admin settings, not code.

<a id="srs-058"></a>

**058** Every AI-generated artefact is traceable to its run, sources, prompt/version, model/provider and cost.

<a id="srs-059"></a>

**059** 2. Product Vision and Scope Boundaries

<a id="srs-060"></a>

**060** Adelaide Sphere is the first production use case and proving ground. The feature should solve today's Adelaide Sphere needs without prematurely building a full multi-tenant SaaS. However, boundaries and interfaces should avoid hard-coding Adelaide-specific assumptions into the core engine.

<a id="srs-061"></a>

**061** In scope now | Deferred / future

<a id="srs-062"></a>

**062** Configuration-driven AI blog workflow | Full multi-tenant billing and subscriptions

<a id="srs-063"></a>

**063** Manual/auto/hybrid title generation | White-label client onboarding portal

<a id="srs-064"></a>

**064** Web research and fact verification | Advanced editorial collaboration

<a id="srs-065"></a>

**065** SEO, internal linking and images | Advanced analytics/attribution/revenue forecasting

<a id="srs-066"></a>

**066** Review queue + auto-publish controls | AI-generated video

<a id="srs-067"></a>

**067** Social posting in Phase 2 | Large-scale content syndication network

<a id="srs-068"></a>

**068** 3. Existing-System Integration Principle

<a id="srs-069"></a>

**069** Do not build a new project, new blog engine or separate admin panel.

<a id="srs-070"></a>

**070** Extend the existing Adelaide Sphere admin and existing blog models/services/routes wherever appropriate.

<a id="srs-071"></a>

**071** Before any code change, audit the current blog schema, media handling, SEO fields, author/tag/category relations, routes, queues, scheduler and admin conventions.

<a id="srs-072"></a>

**072** Reuse existing abstractions instead of duplicating them. Add new tables only where the new domain requires durable state.

<a id="srs-073"></a>

**073** All migrations must be additive and backward compatible unless explicitly approved.

<a id="srs-074"></a>

**074** No destructive schema operation, field rename or production data rewrite without migration/rollback plan.

<a id="srs-075"></a>

**075** 4. Functional Scope Overview

<a id="srs-076"></a>

**076** Area | Phase 1 | Phase 2

<a id="srs-077"></a>

**077** Topic/title | Manual, auto, hybrid | N/A

<a id="srs-078"></a>

**078** Research | Trend + niche + existing content | Use blog data to produce social copy

<a id="srs-079"></a>

**079** Fact verification | Mandatory gate for factual claims | Use source blog as canonical

<a id="srs-080"></a>

**080** Content | Article + SEO + FAQ/structured fields where supported | Platform-specific captions/posts

<a id="srs-081"></a>

**081** Images | Manual/hybrid/automatic | Reuse blog/social image or configured derivative

<a id="srs-082"></a>

**082** Approval | Configurable draft/review/auto | Per-platform configurable review/auto

<a id="srs-083"></a>

**083** Publishing | Blog publish scheduler | Official platform APIs/connectors

<a id="srs-084"></a>

**084** Hardening | Dedupe, idempotency, budgets, audits | Per-platform dedupe, retry, audit

<a id="srs-085"></a>

**085** 5. Phase 1 - AI Blog Automation

<a id="srs-086"></a>

**086** Phase 1 is the priority. It must be production safe before Phase 2 begins.

<a id="srs-087"></a>

**087** Admin can add a topic/title manually, or allow the system to generate it.

<a id="srs-088"></a>

**088** System checks niche fit, duplication, cannibalisation risk and previously queued ideas.

<a id="srs-089"></a>

**089** System gathers relevant existing Adelaide Sphere content and fresh public web research.

<a id="srs-090"></a>

**090** System extracts verifiable facts and source references before article generation.

<a id="srs-091"></a>

**091** AI generates article draft using verified research plus existing-site context.

<a id="srs-092"></a>

**092** SEO metadata, suggested internal links, image plan/prompt and alt text are generated.

<a id="srs-093"></a>

**093** A quality/fact gate assigns the item to Ready for Review, Needs Fact Review or auto-publish eligibility.

<a id="srs-094"></a>

**094** Scheduler publishes only when all configured gates pass.

<a id="srs-095"></a>

**095** 6. Topic and Title Modes

<a id="srs-096"></a>

**096** Mode | Behaviour | Required controls

<a id="srs-097"></a>

**097** Manual | Admin supplies title/topic. System still performs duplicate, research and quality checks. | Allow title lock; optionally allow AI title refinement only with admin permission.

<a id="srs-098"></a>

**098** Automatic | System discovers/selects topic and generates title automatically. | Niche/location filters, trend weight, duplicate checks, approval mode, daily limit.

<a id="srs-099"></a>

**099** Hybrid | If admin supplies title, use it; if blank, AI generates one. Admin can override before generation/publish. | Per-item override, global default, no silent replacement of entered title.

<a id="srs-100"></a>

**100** Core requirement: Title mode and approval mode are independent settings. Example: automatic title generation may still require human approval before article generation or publishing.

<a id="srs-101"></a>

**101** 7. Topic Discovery and Trend Research

<a id="srs-102"></a>

**102** Use both current/trending public information and Adelaide Sphere's existing content inventory.

<a id="srs-103"></a>

**103** Trend research must be constrained to the configured niche and location.

<a id="srs-104"></a>

**104** A trending topic is not automatically publishable; it must pass relevance, duplication and factual-source checks.

<a id="srs-105"></a>

**105** Avoid chasing unrelated viral trends only for traffic.

<a id="srs-106"></a>

**106** Prefer evergreen + timely local utility: guides, openings/changes, seasonal activities, neighbourhood/local-business discovery, useful explainers.

<a id="srs-107"></a>

**107** Record why a topic was selected: manual, trend signal, content gap, internal data, seasonal rule or editorial queue.

<a id="srs-108"></a>

**108** Keep a rejected-topic history so repeatedly rejected or duplicate ideas are not regenerated.

<a id="srs-109"></a>

**109** 8. Existing Content Context and Internal Linking

<a id="srs-110"></a>

**110** Do not send the entire blog database to the AI for each request.

<a id="srs-111"></a>

**111** Retrieve a small, relevant set of existing posts using search/relevance logic; target roughly 3-5 strong related items unless a different number is configured.

<a id="srs-112"></a>

**112** Use existing article titles, summaries/key facts, canonical URLs/slugs, categories/tags and relevant entities as context.

<a id="srs-113"></a>

**113** New content must not copy or lightly paraphrase existing posts.

<a id="srs-114"></a>

**114** Internal links must be contextually justified, not inserted mechanically.

<a id="srs-115"></a>

**115** Prevent circular or excessive linking and cap internal-link suggestions by configuration.

<a id="srs-116"></a>

**116** If an existing post already fully satisfies the topic, prefer updating/surfacing that post rather than generating a competing article; flag for editorial decision.

<a id="srs-117"></a>

**117** 9. Research and Fact Verification

<a id="srs-118"></a>

**118** Fact accuracy is a hard publication gate. Adelaide Sphere must not invent places, businesses, addresses, opening hours, prices, events or other real-world facts.

<a id="srs-119"></a>

**119** Rule | Requirement

<a id="srs-120"></a>

**120** Source quality | Prefer primary/official sources for businesses, venues, government, event organisers and authoritative local information.

<a id="srs-121"></a>

**121** Cross-check | For higher-risk or changeable facts, corroborate where reasonable.

<a id="srs-122"></a>

**122** Freshness | Store retrieval timestamp and source URL; treat hours, price, event dates and availability as highly time-sensitive.

<a id="srs-123"></a>

**123** Unverified facts | Mark as unresolved; do not present as fact.

<a id="srs-124"></a>

**124** Publish gate | Any material unresolved factual claim forces Needs Fact Review / Draft, even if full auto-publish is enabled.

<a id="srs-125"></a>

**125** Source failure | If research provider/search fails, never fall back to hallucination. Stop or create a research-incomplete draft.

<a id="srs-126"></a>

**126** Claims about a place or business should be associated with the source(s) used to verify them.

<a id="srs-127"></a>

**127** If sources disagree, flag the discrepancy for review rather than choosing silently.

<a id="srs-128"></a>

**128** Do not infer exact prices, ratings, operating hours, addresses or event details from stale memory.

<a id="srs-129"></a>

**129** Use cautious language for inherently changeable information and avoid promises of permanence.

<a id="srs-130"></a>

**130** 10. AI Content Generation

<a id="srs-131"></a>

**131** Generate a useful article, not keyword-stuffed filler.

<a id="srs-132"></a>

**132** Write for humans first; maintain Adelaide/local context and the site's editorial tone.

<a id="srs-133"></a>

**133** Use a structured outline before final body generation when it improves quality/cost.

<a id="srs-134"></a>

**134** Ground factual sections only in the research packet supplied to the model.

<a id="srs-135"></a>

**135** Where supported by the existing blog schema, produce excerpt, introduction, headings, body, FAQs, conclusion/CTA, tags/categories and structured content fields.

<a id="srs-136"></a>

**136** Preserve an immutable record of the AI run inputs/outputs needed for audit while respecting data-retention limits.

<a id="srs-137"></a>

**137** Prompt/model changes must be versioned so differences can be traced.

<a id="srs-138"></a>

**138** 11. SEO Generation and Quality Controls

<a id="srs-139"></a>

**139** Generate SEO title, meta description, slug suggestion, canonical intent, primary topic/keyword and secondary semantic terms.

<a id="srs-140"></a>

**140** Avoid duplicate SEO titles, duplicate slugs and keyword cannibalisation with existing posts.

<a id="srs-141"></a>

**141** Do not promise ranking or traffic results.

<a id="srs-142"></a>

**142** Generate clean heading hierarchy and readable excerpts.

<a id="srs-143"></a>

**143** Where the existing site supports schema/structured data, populate only fields that can be truthfully supported.

<a id="srs-144"></a>

**144** Generate image alt text based on the actual selected/generated image, not generic keyword stuffing.

<a id="srs-145"></a>

**145** Apply length/readability checks as guidance, not rigid rules that reduce usefulness.

<a id="srs-146"></a>

**146** 12. Image Workflow and Modes

<a id="srs-147"></a>

**147** Image mode | Behaviour

<a id="srs-148"></a>

**148** Manual | System generates image brief/prompt, recommended placement/aspect ratio and alt-text draft. Admin creates/selects/uploads the image.

<a id="srs-149"></a>

**149** Automatic | System calls configured image provider, stores result through the existing media pipeline, and attaches only after validation.

<a id="srs-150"></a>

**150** Hybrid | Default can be prompt-only, with per-item 'Generate now' action; or automatic with admin replacement before publish.

<a id="srs-151"></a>

**151** Global default plus per-post override.

<a id="srs-152"></a>

**152** Configurable maximum image count; low-cost default should be one featured image and optional supporting image only when justified.

<a id="srs-153"></a>

**153** Never regenerate repeatedly because of retries; generated image jobs need idempotency keys.

<a id="srs-154"></a>

**154** Validate file type, dimensions, size, storage success and media record before marking image step complete.

<a id="srs-155"></a>

**155** Do not publish a broken image URL.

<a id="srs-156"></a>

**156** If image generation fails, either continue with manual-image-needed status or hold publication according to settings.

<a id="srs-157"></a>

**157** Store generation prompt/provider/model/cost metadata for audit.

<a id="srs-158"></a>

**158** 13. Review, Approval and Publishing Workflow

<a id="srs-159"></a>

**159** Status | Meaning | Can auto-publish?

<a id="srs-160"></a>

**160** Idea / Queued | Topic exists but processing not started | No

<a id="srs-161"></a>

**161** Researching | Research/fact extraction in progress | No

<a id="srs-162"></a>

**162** Generating | Article generation in progress | No

<a id="srs-163"></a>

**163** Needs Fact Review | One or more material facts unresolved/conflicting | Never

<a id="srs-164"></a>

**164** Ready for Review | Generation complete; human approval required by configuration | No until approved

<a id="srs-165"></a>

**165** Approved | Human-approved and eligible for schedule | Yes

<a id="srs-166"></a>

**166** Scheduled | Publish time reserved | Yes at scheduled time

<a id="srs-167"></a>

**167** Published | Canonical blog post successfully published | N/A

<a id="srs-168"></a>

**168** Failed | Processing/publish failure requiring retry or review | No

<a id="srs-169"></a>

**169** Cancelled / Rejected | Editorially stopped | No

<a id="srs-170"></a>

**170** Full-auto mode may skip human approval only if all mandatory verification and quality gates pass.

<a id="srs-171"></a>

**171** A manual approval must be attributable to an admin user and timestamp.

<a id="srs-172"></a>

**172** If an approved draft changes materially after approval, approval must be invalidated or re-confirmed.

<a id="srs-173"></a>

**173** Publishing is a separate transactional step; generation success is not equal to publish success.

<a id="srs-174"></a>

**174** 14. Admin UX and Required Screens

<a id="srs-175"></a>

**175** AI Content dashboard with counts: Queued, Processing, Ready for Review, Needs Fact Review, Scheduled, Failed.

<a id="srs-176"></a>

**176** Topic Queue: create manual topic/title, bulk add ideas, reorder/prioritise, pause/cancel.

<a id="srs-177"></a>

**177** AI Content Review: article preview, source evidence, unresolved facts, SEO fields, image plan, internal links, approve/reject/regenerate selected section.

<a id="srs-178"></a>

**178** Needs Fact Review filter/view as a first-class queue.

<a id="srs-179"></a>

**179** Settings: content mode, title mode, approval mode, posting frequency, timezone, niche/location, provider/model choices, image mode, budget limits, source/research options.

<a id="srs-180"></a>

**180** Run history/audit view showing status transitions, retry count, provider/model usage, estimated/actual cost and errors.

<a id="srs-181"></a>

**181** Safe actions must require confirmation where destructive or costly.

<a id="srs-182"></a>

**182** 15. Scheduling and Daily Publishing

<a id="srs-183"></a>

**183** Default schedule: one post per day, configurable.

<a id="srs-184"></a>

**184** Use the application's existing scheduler/queue infrastructure; do not create a second scheduler.

<a id="srs-185"></a>

**185** Use site timezone explicitly.

<a id="srs-186"></a>

**186** Scheduler should select only eligible items and atomically claim one job.

<a id="srs-187"></a>

**187** Multiple scheduler invocations must not create multiple posts for the same slot.

<a id="srs-188"></a>

**188** Missed schedules should follow configurable catch-up policy: skip, publish next slot or require review.

<a id="srs-189"></a>

**189** Allow temporary pause without deleting queued ideas.

<a id="srs-190"></a>

**190** Respect per-day and per-month generation/publishing caps.

<a id="srs-191"></a>

**191** 16. State Machine and Status Model

<a id="srs-192"></a>

**192** State changes must be explicit, validated and auditable. Do not use loose boolean combinations that allow impossible states.

<a id="srs-193"></a>

**193** From | Allowed examples | Blocked examples

<a id="srs-194"></a>

**194** Queued | Researching, Cancelled | Published

<a id="srs-195"></a>

**195** Researching | Generating, Needs Fact Review, Failed | Scheduled

<a id="srs-196"></a>

**196** Generating | Ready for Review, Needs Fact Review, Approved (auto mode), Failed | Published directly

<a id="srs-197"></a>

**197** Ready for Review | Approved, Rejected, Generating (controlled regeneration) | Published without approval

<a id="srs-198"></a>

**198** Approved | Scheduled, Published (if immediate), Ready for Review after material edit | Needs Fact Review without reason

<a id="srs-199"></a>

**199** Scheduled | Published, Failed, Cancelled | Generating

<a id="srs-200"></a>

**200** Published | Social queue creation in Phase 2 | Regenerate in place/overwrite body silently

<a id="srs-201"></a>

**201** 17. Duplicate Prevention and Idempotency

<a id="srs-202"></a>

**202** Create durable idempotency keys for topic processing, article generation, image generation, publishing and each social-platform send.

<a id="srs-203"></a>

**203** Use database-level unique constraints wherever a business invariant can be enforced there.

<a id="srs-204"></a>

**204** A queue retry must continue/reconcile the same work item, not create a new blog post.

<a id="srs-205"></a>

**205** Duplicate detection should check exact/normalised title, slug, semantic similarity, same source event/entity and previously rejected/queued ideas.

<a id="srs-206"></a>

**206** Publishing must atomically associate the automation item with the canonical existing blog post ID.

<a id="srs-207"></a>

**207** If a worker crashes after the external side effect succeeds but before local commit, reconciliation must detect the already-created result.

<a id="srs-208"></a>

**208** Concurrency tests are mandatory for scheduler and publish paths.

<a id="srs-209"></a>

**209** 18. Manual Edit Protection and Content Ownership

<a id="srs-210"></a>

**210** Once a human edits an AI draft, record that it is human-modified and protect it from blind regeneration.

<a id="srs-211"></a>

**211** Regenerate should be granular where practical: title, SEO, section, image prompt, or full article with explicit confirmation.

<a id="srs-212"></a>

**212** Never overwrite an already published article through the automation pipeline.

<a id="srs-213"></a>

**213** Updates to published content should be a separate future/update workflow, not the create workflow.

<a id="srs-214"></a>

**214** If regeneration occurs after approval, invalidate approval if the changed fields are material.

<a id="srs-215"></a>

**215** Store version/revision metadata for AI-generated drafts when practical.

<a id="srs-216"></a>

**216** 19. Cost Controls and Budget Guardrails

<a id="srs-217"></a>

**217** Optimise for low operating cost because the site is not yet earning meaningful revenue.

<a id="srs-218"></a>

**218** Use cheaper models for lightweight tasks (classification, title candidates, metadata) and stronger models only where quality materially benefits.

<a id="srs-219"></a>

**219** Do not send unnecessary full-site content to the model.

<a id="srs-220"></a>

**220** Set configurable daily/monthly token, research and image budgets.

<a id="srs-221"></a>

**221** Soft threshold: warn/admin dashboard alert. Hard threshold: stop new paid generation while preserving manual workflow.

<a id="srs-222"></a>

**222** Never repeatedly spend money on the same failed task because of uncontrolled retries.

<a id="srs-223"></a>

**223** Track estimated and actual provider usage by run, article and month.

<a id="srs-224"></a>

**224** 20. Provider Abstraction and Configuration

<a id="srs-225"></a>

**225** Core domain must not depend directly on one AI vendor.

<a id="srs-226"></a>

**226** Use provider interfaces/adapters for text generation, image generation and research/search where practical.

<a id="srs-227"></a>

**227** Provider credentials remain server-side; never expose secrets to browser code.

<a id="srs-228"></a>

**228** Configuration should support model selection and controlled fallback.

<a id="srs-229"></a>

**229** Fallback must not weaken the fact-verification rules.

<a id="srs-230"></a>

**230** Provider outage should degrade gracefully to pending/review state, not produce fabricated content.

<a id="srs-231"></a>

**231** 21. Phase 2 - Social Media Automation

<a id="srs-232"></a>

**232** Phase 2 starts only after Phase 1 is stable in production.

<a id="srs-233"></a>

**233** When a blog is published, create a social-distribution job according to configured platforms.

<a id="srs-234"></a>

**234** Generate platform-specific copy from the canonical published blog, not from an unapproved draft.

<a id="srs-235"></a>

**235** Support per-platform ON/OFF and approval/automatic modes.

<a id="srs-236"></a>

**236** Allow selected existing published blogs to be backfilled into the social queue.

<a id="srs-237"></a>

**237** Use official APIs/connectors where available; avoid mandatory paid third-party schedulers.

<a id="srs-238"></a>

**238** Track platform post IDs/URLs/status so retries cannot double-post.

<a id="srs-239"></a>

**239** 22. Social Platform Publishing Rules

<a id="srs-240"></a>

**240** Rule | Requirement

<a id="srs-241"></a>

**241** Canonical source | Published Adelaide Sphere article

<a id="srs-242"></a>

**242** Platform copy | Adapt length/style per platform; do not merely paste identical text everywhere

<a id="srs-243"></a>

**243** Link | Use canonical article URL with safe tracking parameters if configured

<a id="srs-244"></a>

**244** Media | Reuse/select approved article image; do not auto-generate a new paid image unless configured

<a id="srs-245"></a>

**245** Approval | Global default + per-platform override

<a id="srs-246"></a>

**246** Dedupe | Unique constraint on article + platform + account + campaign/version

<a id="srs-247"></a>

**247** Retry | Retry transient failures; do not resend after confirmed external success

<a id="srs-248"></a>

**248** Backfill | Explicit admin action and date/rate limits to avoid spam

<a id="srs-249"></a>

**249** Initial target platforms may include Facebook/Instagram via Meta APIs and LinkedIn, subject to current account types, app permissions and platform policies at implementation time. Platform requirements must be re-verified before coding.

<a id="srs-250"></a>

**250** 23. Security, Permissions and Secrets

<a id="srs-251"></a>

**251** Only authorised admin roles can change AI providers, budgets, auto-publish, social credentials or automation settings.

<a id="srs-252"></a>

**252** Separate permissions for view, generate, approve, publish, configure and manage credentials where the existing admin framework supports it.

<a id="srs-253"></a>

**253** Encrypt or use secret storage for provider tokens; never log raw API keys/access tokens.

<a id="srs-254"></a>

**254** Validate all admin inputs server-side.

<a id="srs-255"></a>

**255** Treat web research content as untrusted input; prompts must defend against prompt injection in fetched content.

<a id="srs-256"></a>

**256** Do not let source webpage instructions override system/application rules.

<a id="srs-257"></a>

**257** Sanitise generated HTML/content using the existing safe rendering approach.

<a id="srs-258"></a>

**258** 24. Audit Logs, Observability and Notifications

<a id="srs-259"></a>

**259** Audit setting changes, approvals, rejections, manual overrides, budget changes, provider changes and publish actions.

<a id="srs-260"></a>

**260** Log state transitions with correlation/run ID.

<a id="srs-261"></a>

**261** Capture structured errors without leaking secrets.

<a id="srs-262"></a>

**262** Dashboard should surface failed/stuck jobs and items needing review.

<a id="srs-263"></a>

**263** Notify admin for repeated failures, budget hard-stop, missing credentials, source verification failure bursts or social auth expiry.

<a id="srs-264"></a>

**264** Define stale-job detection and recovery procedure.

<a id="srs-265"></a>

**265** 25. Failure Handling, Retry and Recovery

<a id="srs-266"></a>

**266** Failure | Expected behaviour

<a id="srs-267"></a>

**267** Research provider unavailable | Retry with bounded backoff; then mark Failed/Research Incomplete. Never hallucinate.

<a id="srs-268"></a>

**268** AI text generation timeout | Retry same idempotent job within cap; no duplicate article.

<a id="srs-269"></a>

**269** Image generation failure | Follow setting: hold for manual image or continue without image only if allowed.

<a id="srs-270"></a>

**270** Database write failure | Transaction rollback; external side effects reconciled before retry.

<a id="srs-271"></a>

**271** Publish succeeds, worker crashes | Reconcile via durable mapping/idempotency; do not create another post.

<a id="srs-272"></a>

**272** Scheduler runs twice | Only one atomic claim for the slot/work item.

<a id="srs-273"></a>

**273** Social API returns uncertain response | Query/reconcile external state before retry if possible.

<a id="srs-274"></a>

**274** Budget exceeded | Stop paid generation and flag item; do not silently bypass budget.

<a id="srs-275"></a>

**275** Retries must be bounded and exponential/backoff aware where appropriate.

<a id="srs-276"></a>

**276** Permanent validation or fact-verification failures are not retry storms.

<a id="srs-277"></a>

**277** Provide admin 'Retry' for recoverable failures and 'Reset to review' where safe.

<a id="srs-278"></a>

**278** 26. Edge Cases and Hardening Matrix

<a id="srs-279"></a>

**279** Edge case | Guardrail

<a id="srs-280"></a>

**280** Same cron runs on two servers | Atomic DB claim/lock + unique schedule key

<a id="srs-281"></a>

**281** Same manual title added twice | Normalised duplicate + semantic similarity warning/block

<a id="srs-282"></a>

**282** AI creates similar title with different wording | Semantic/cannibalisation check

<a id="srs-283"></a>

**283** Topic becomes stale before publish | Freshness check before scheduled publish for time-sensitive content

<a id="srs-284"></a>

**284** Business closes/changes hours after research | Timestamp source; recheck high-volatility facts if delayed

<a id="srs-285"></a>

**285** Sources conflict | Needs Fact Review

<a id="srs-286"></a>

**286** No reliable source exists | Draft/Needs Fact Review, never invent

<a id="srs-287"></a>

**287** Human edits while worker is running | Optimistic version/updated_at guard; worker must not overwrite newer human version

<a id="srs-288"></a>

**288** Admin changes settings mid-run | Run uses snapshot of settings; next run uses new settings

<a id="srs-289"></a>

**289** Provider returns malformed JSON | Validate schema; repair once if safe; otherwise fail visibly

<a id="srs-290"></a>

**290** Partial image upload | Do not attach until storage + DB record valid

<a id="srs-291"></a>

**291** Slug collision | Use existing slug allocator/unique constraint; do not overwrite

<a id="srs-292"></a>

**292** Post publish transaction partially fails | Reconcile canonical post mapping

<a id="srs-293"></a>

**293** Article approved then regenerated | Invalidate approval

<a id="srs-294"></a>

**294** Auto-publish ON but unresolved fact | Fact gate wins; keep draft

<a id="srs-295"></a>

**295** Monthly budget hits during multi-step run | Stop before next paid step; preserve progress

<a id="srs-296"></a>

**296** Queue retries after success | Idempotency returns existing result

<a id="srs-297"></a>

**297** Social token expired | Mark auth-required; do not repeatedly retry

<a id="srs-298"></a>

**298** Social post published but response lost | Reconcile by request/idempotency/external lookup before resend

<a id="srs-299"></a>

**299** Backfill hundreds of old blogs | Rate-limit and require explicit batch controls

<a id="srs-300"></a>

**300** Malicious prompt text in source webpage | Treat source as data only; ignore embedded instructions

<a id="srs-301"></a>

**301** Deleted related internal post | Validate link existence before publish

<a id="srs-302"></a>

**302** Existing post edited/slug changed | Resolve canonical URL at publish time

<a id="srs-303"></a>

**303** Timezone/DST shift | Use explicit site timezone and timezone-aware scheduling

<a id="srs-304"></a>

**304** Admin disables automation | Do not start new jobs; define whether in-flight jobs finish or pause

<a id="srs-305"></a>

**305** Database migration rollback | Additive migrations; reversible where practical

<a id="srs-306"></a>

**306** Worker dies while holding job | Lease/stale claim timeout + safe requeue

<a id="srs-307"></a>

**307** Duplicate external webhook/event | Idempotent consumer

<a id="srs-308"></a>

**308** Unknown model/provider cost spike | Budget caps + provider/model allowlist

<a id="srs-309"></a>

**309** Unexpected huge generated response | Token/output limits + validation

<a id="srs-310"></a>

**310** 27. Data Model and Suggested Entities

<a id="srs-311"></a>

**311** Exact schema must be adapted to the existing project after audit. Names below describe domain responsibilities, not mandatory table names.

<a id="srs-312"></a>

**312** Entity / concept | Purpose / key fields

<a id="srs-313"></a>

**313** AIContentSetting | Site-level defaults: title mode, approval mode, publish cadence, niche/location, provider/model IDs, image mode, budgets.

<a id="srs-314"></a>

**314** AIContentItem | One topic/article automation unit: source, proposed title, state, priority, scheduled_at, canonical blog_post_id, human_modified flag.

<a id="srs-315"></a>

**315** AIResearchRun | Query/research metadata, provider, status, source list, extracted claims, timestamps.

<a id="srs-316"></a>

**316** AIContentRun | Prompt/version, model/provider, input refs, output, token/cost metadata, status, retry count.

<a id="srs-317"></a>

**317** AIFactClaim | Claim text/type, source refs, verification status, volatility/freshness metadata.

<a id="srs-318"></a>

**318** AIImageJob | Prompt, provider/model, mode, media ID, status, cost/idempotency key.

<a id="srs-319"></a>

**319** AIApproval | Item, reviewer, decision, timestamp, content version/hash.

<a id="srs-320"></a>

**320** AISocialJob (Phase 2) | Article + platform/account, caption version, external post ID, status, scheduled_at, idempotency key.

<a id="srs-321"></a>

**321** AIAuditEvent | Actor/system, event type, before/after metadata, correlation ID.

<a id="srs-322"></a>

**322** Prefer relationships to existing blog, media, admin user, category/tag and SEO models instead of duplicating those records.

<a id="srs-323"></a>

**323** 28. Testing, Deployment and Rollback

<a id="srs-324"></a>

**324** Required tests

<a id="srs-325"></a>

**325** Unit tests for state transitions, duplicate matching rules, budget decisions, approval invalidation and source-verification gates.

<a id="srs-326"></a>

**326** Integration tests for research -> generation -> review -> publish flow using provider fakes/mocks.

<a id="srs-327"></a>

**327** Concurrency tests for scheduler claim and publish idempotency.

<a id="srs-328"></a>

**328** Retry tests proving one external result is created despite worker retries.

<a id="srs-329"></a>

**329** Permission tests for settings, approvals, publish and credentials.

<a id="srs-330"></a>

**330** Regression tests proving existing manual blog CRUD/publishing still works.

<a id="srs-331"></a>

**331** Phase 2 tests for article+platform dedupe and lost-response reconciliation.

<a id="srs-332"></a>

**332** Deployment approach

<a id="srs-333"></a>

**333** Feature-flag the automation initially.

<a id="srs-334"></a>

**334** Run migrations first; deploy code with automation disabled.

<a id="srs-335"></a>

**335** Configure provider credentials and budgets.

<a id="srs-336"></a>

**336** Use manual title + review-required + manual/hybrid images as safest first production mode.

<a id="srs-337"></a>

**337** Run controlled articles and inspect logs/cost/source evidence.

<a id="srs-338"></a>

**338** Enable daily scheduler after successful acceptance.

<a id="srs-339"></a>

**339** Enable full-auto only after quality is proven.

<a id="srs-340"></a>

**340** Phase 2 released behind separate feature flags.

<a id="srs-341"></a>

**341** Rollback

<a id="srs-342"></a>

**342** Disabling feature flags must immediately stop new automated work without breaking ordinary blog functions.

<a id="srs-343"></a>

**343** Do not delete generated/published data during rollback.

<a id="srs-344"></a>

**344** Failed deployment must not require destructive database rollback to restore existing blogging.

<a id="srs-345"></a>

**345** 29. Future Enhancements and Explicitly Deferred Scope

<a id="srs-346"></a>

**346** True multi-tenant SaaS configuration and tenant isolation.

<a id="srs-347"></a>

**347** Client onboarding wizard and white-label branding.

<a id="srs-348"></a>

**348** Subscription plans, quotas, metering and billing.

<a id="srs-349"></a>

**349** Advanced content calendar and editorial teams.

<a id="srs-350"></a>

**350** Performance feedback loop using Search Console/analytics to refine topic selection.

<a id="srs-351"></a>

**351** Automated content refresh/update workflow for existing published posts.

<a id="srs-352"></a>

**352** More social platforms and campaign scheduling.

<a id="srs-353"></a>

**353** Image library reuse/deduplication and brand style profiles.

<a id="srs-354"></a>

**354** Automated email/newsletter distribution.

<a id="srs-355"></a>

**355** Guest-post marketplace workflows and monetisation tooling.

<a id="srs-356"></a>

**356** Advanced revenue attribution and ad/affiliate opportunity scoring.

<a id="srs-357"></a>

**357** AI video/reels generation only after text/social workflow is commercially justified.

<a id="srs-358"></a>

**358** Implementation DO NOT List

<a id="srs-359"></a>

**359** Do not create a separate application or separate admin panel.

<a id="srs-360"></a>

**360** Do not bypass the existing blog service/model conventions without a documented reason.

<a id="srs-361"></a>

**361** Do not auto-publish unverified factual claims.

<a id="srs-362"></a>

**362** Do not allow retry logic to create duplicate blogs, images or social posts.

<a id="srs-363"></a>

**363** Do not overwrite human-edited or already-published content silently.

<a id="srs-364"></a>

**364** Do not hard-code Adelaide-specific configuration inside reusable core services where a setting belongs.

<a id="srs-365"></a>

**365** Do not hard-code OpenAI or any single provider into the domain layer.

<a id="srs-366"></a>

**366** Do not expose API keys/tokens to the client.

<a id="srs-367"></a>

**367** Do not build deferred SaaS billing/multi-tenancy now.

<a id="srs-368"></a>

**368** Do not optimise for article quantity at the expense of accuracy and usefulness.

<a id="srs-369"></a>

**369** Claude Code Execution Rules

<a id="srs-370"></a>

**370** Treat this SRS as the source of truth. Do not invent product requirements.

<a id="srs-371"></a>

**371** Before implementation, audit the actual repository and produce a concise gap analysis: existing components to reuse, migrations needed, risks and files likely to change.

<a id="srs-372"></a>

**372** If the repository contradicts an assumption in this SRS, stop and report the conflict rather than silently restructuring the project.

<a id="srs-373"></a>

**373** Implement Phase 1 in small, testable workstreams. Do not begin Phase 2 until Phase 1 acceptance criteria pass.

<a id="srs-374"></a>

**374** Preserve backward compatibility and current manual blog operations.

<a id="srs-375"></a>

**375** Every workstream must include tests, migration safety, idempotency and failure-path handling.

<a id="srs-376"></a>

**376** At the end of each workstream, provide: changed files, migrations, tests, settings/env changes, deployment notes, rollback notes, unresolved items and proof that existing behaviour remains intact.

<a id="srs-377"></a>

**377** Phase 1 Acceptance Checklist

<a id="srs-378"></a>

**378** Admin can select Manual / Automatic / Hybrid title mode.

<a id="srs-379"></a>

**379** Automatic topics use trends + niche + existing content context.

<a id="srs-380"></a>

**380** Duplicate/cannibalisation checks run before generation.

<a id="srs-381"></a>

**381** Verified research packet is stored and visible for review.

<a id="srs-382"></a>

**382** Unverified material facts force Needs Fact Review.

<a id="srs-383"></a>

**383** Content + SEO + internal links are generated without overwriting existing posts.

<a id="srs-384"></a>

**384** Manual / Hybrid / Automatic image modes work through settings.

<a id="srs-385"></a>

**385** Ready for Review and Needs Fact Review admin queues exist.

<a id="srs-386"></a>

**386** Approval and auto-publish are independently configurable.

<a id="srs-387"></a>

**387** One-per-day scheduler is idempotent under duplicate triggers.

<a id="srs-388"></a>

**388** Human edits are protected from background overwrites.

<a id="srs-389"></a>

**389** Budget caps and usage logs work.

<a id="srs-390"></a>

**390** Existing manual blog workflow passes regression tests.

<a id="srs-391"></a>

**391** Feature can be disabled cleanly.

<a id="srs-392"></a>

**392** Phase 2 Acceptance Checklist

<a id="srs-393"></a>

**393** Published blog can create social jobs for enabled platforms.

<a id="srs-394"></a>

**394** Each platform can be independently automatic or review-required.

<a id="srs-395"></a>

**395** Captions are platform-specific and derived from the canonical published article.

<a id="srs-396"></a>

**396** Same article cannot be posted twice to the same platform/account because of retries.

<a id="srs-397"></a>

**397** Existing published blogs can be manually backfilled with rate controls.

<a id="srs-398"></a>

**398** External post IDs/status are stored and auditable.

<a id="srs-399"></a>

**399** Expired credentials and partial failures are surfaced without duplicate sends.

<a id="srs-400"></a>

**400** Final product principle: Build the smallest production-grade core that is useful for Adelaide Sphere today, but keep configuration, provider boundaries, idempotency, auditability and data ownership strong enough that the engine can later become a sellable product without a rewrite.

