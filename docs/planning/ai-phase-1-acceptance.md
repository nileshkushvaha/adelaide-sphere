# AI Content — Phase 1 acceptance record

**Status: NOT YET ACCEPTED.** 19 September 2026, end of workstream 1G.

Phase 1 is implemented (1A–1G) and verified locally against the isolated test database with fake providers. Two acceptance conditions from plan §O 1G are still open:

1. **Pilot evidence** from controlled real articles (runbook §3), reviewed by the owner.
2. **Stable production observation**, and the owner's Phase 1 acceptance.

**No real provider call has been made**: no `OPENAI_API_KEY` is configured, and none was authorised. Nothing is deployed.

## Master SRS Phase 1 acceptance checklist (matrix rows AI-378 to AI-391)

| Row | Requirement | Status | Evidence |
|---|---|---|---|
| AI-378 | Manual / Automatic / Hybrid title mode | **Met (settings)** | 1A settings; 1C discovery proposes topics only in automatic or hybrid mode, and each still needs approval |
| AI-379 | Automatic topics use trends, niche and existing content | **Partly met** | 1C feed discovery (niche and exclusion filters, recency) plus local novelty against published and unpublished inventory. No automatic topic generation (owner, 1F). Real feeds are to be registered. |
| AI-380 | Duplicate / cannibalisation checks before generation | **Met** | 1C admission under the inventory lock; the 1F slot re-check; 1G re-check at publication (`ai-content-hardening` spec) |
| AI-381 | Verified research packet stored and visible | **Met** | 1C packets, evidence and claims; the admin research panel |
| AI-382 | Unverified material facts force Needs Fact Review | **Met, strengthened** | 1C claim verification; the 1D coverage screen; a person's fact confirmation for every article (1D review fix) |
| AI-383 | Content, SEO and internal links without overwriting posts | **Met** | 1D generation; one canonical post; proposals and compare-and-set for human edits; 1G checks at publication that links still lead to published articles |
| AI-384 | Manual / Hybrid / Automatic image modes | **Partly met (owner decision)** | Manual and hybrid (1E). Automatic is not approved and is refused when saved. |
| AI-385 | Ready for Review and Needs Fact Review queues | **Met** | 1B/1C admin queues; the Fact Review page |
| AI-386 | Approval and auto-publish independently configurable | **Not met (owner decision)** | Approval is always required; auto-publishing is not approved and is refused when saved (1G) |
| AI-387 | One-per-day scheduler idempotent under duplicate triggers | **Met** | 1F: unique slot per local date; three concurrent ticks produce one slot |
| AI-388 | Human edits protected from background overwrites | **Met** | 1B sticky human edit and proposals; 1E: a late image never replaces chosen media |
| AI-389 | Budget caps and usage logs | **Met (fakes)** | 1D/1E reservations, settlement, cumulative per-article cap, halt on discrepancy; history and budget cards. **Real-cost reconciliation is pending the pilot.** |
| AI-390 | Existing manual blog workflow regression | **Met** | The full `pnpm test:integration` blog and posts suites pass at every phase; a human post is unaffected by the AI gate (1G spec) |
| AI-391 | Feature can be disabled cleanly | **Met** | The kill switch stops every entry point (1G spec); scheduled AI articles are held (1B); runbook §5 |

## Pilot evidence (to be completed)

For each controlled article, the runbook §3 fields:

- topic and research packet;
- draft and human changes;
- fact review;
- image;
- costs compared with the provider's usage;
- timings and alerts.

| # | Date | Topic | Published? | Cost (settled / provider) | Notes |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

## Owner decisions open for final acceptance

- Accept or change the partly met rows AI-379, AI-384 and AI-386, which are deliberate scope decisions.
- Review the pilot, then accept Phase 1.
- Phase 2 (social) remains a separate approval after that.
