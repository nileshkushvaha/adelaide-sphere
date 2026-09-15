# Launch readiness report

- **Date:** 8 September 2026
- **Basis:** the complete production-readiness audit of the same date (`complete-project-audit.md`), the requirement classification in `srs-compliance-matrix.md`, and the runtime authorization evidence in `api-authorization-matrix.md`.

## Verdict

## **Ready for staging, with staging entry conditions met.**

> **Closure addendum — 9 September 2026.** Since the audit, the two delivery-team
> blockers that were code or configuration have been closed and verified:
> monitoring exists and was proven by nine executed failure drills (blocker 8),
> the browser suite is inside the release gate (blocker 13), and the empty 404
> body is fixed at the reverse proxy and measured through it (blocker 12). The
> classification does not move past "ready for staging", because the remaining
> blockers are client decisions, external credentials and manual verifications
> that can only be done in a staging environment with real providers. What has
> changed is that nothing in the application now stands between the team and
> standing that environment up.

Not "ready for production after listed configuration", because that phrasing implies the remaining work is a checklist someone completes in an afternoon. It is not: there is no staging environment yet, no monitoring of any kind, no restore drill against production-like data, no external provider credentials, and no manual screen-reader pass. Each of those is ordinary pre-launch work, and none of it is code — but until it is done, no one can honestly say the system has been seen working outside a developer's machine.

What the audit does support saying: the application itself is in good order. 193 admin routes deny by default and were proven to; the database migrates cleanly from empty; the media pipeline works against a real object store; the public site renders correctly at every width tested with no accessibility violations after one real contrast defect was fixed; and the two serious defects found — a worker that could not start, and a worker that could not use the chosen email provider — are fixed, tested and verified.

## Blockers

| # | Blocker | Type | Owner | Notes |
| --- | --- | --- | --- | --- |
| 1 | Greater Melbourne boundary (**D01**) | Client decision | Client | Eligibility currently enforces the City of Melbourne council area. Listings admitted under the wrong boundary are expensive to unpick later. |
| 2 | Approved privacy, terms and review-guidelines copy (**D05**) | Client decision | Client | The pages exist and refuse to publish while empty or containing placeholder wording. The site cannot collect a review or an enquiry lawfully without them. |
| 3 | Resend account, sending domain, DNS and webhook secret (**D09**) | External credential | Client | Until this exists nothing can be delivered: no password reset, no account set-up, no enquiry. The code path is now complete on both sides (audit F-02). |
| 4 | Turnstile site and secret keys (**D03**) | External credential | Client | Without them every public write answers 503 by design. Verified fail-closed in this audit. |
| 5 | Object-storage provider and credentials (**D03**) | External credential | Client | Verified end to end against MinIO; the production provider is unchosen. |
| 6 | Website content and rights: testimonials, partner logos, photography (**D10**) | Client decision | Client | Publication gates refuse unapproved or incomplete records; nothing was invented to fill them. |
| 7 | Mandatory two-factor for administrators (**D06**) | Client decision | Client | TOTP is implemented and optional; making it mandatory is a policy choice. |
| 8 | ~~No monitoring, error tracking or alerting~~ | Missing feature | Delivery team | **Closed 2026-09-09.** Prometheus-compatible metrics on both processes behind a token, worker heartbeats, worker-liveness in the Queue Monitor, 16 alert rules, and nine executed failure drills — including the dead-worker case, detected in ≤ 45 s. Wiring the alert rules to a paging destination remains a staging task, and needs the client's decision on who is paged. |
| 9 | Staging environment, TLS, reverse proxy, resource limits | Deployment configuration | Delivery team + host | Reviewed as documents; never observed running. |
| 10 | Restore drill against production-like data | Manual verification | Delivery team | Scripts and a procedure exist; the drill has not been executed. |
| 11 | Manual screen-reader pass (VoiceOver) | Manual verification | Delivery team | Automated axe is clean; that is not the same claim. |
| 12 | ~~404 responses have an empty server-rendered body~~ | Deployment configuration | Delivery team | **Closed 2026-09-09** in the reference configuration (`infrastructure/edge/nginx.conf`), verified through real nginx in front of a production build: 404 with a 55,873-byte branded page, 1,042 characters of visible text, `noindex`, no JavaScript, API and admin untouched. Adapting it to the chosen production edge is a staging task. |
| 13 | ~~The browser suite is outside the release gate~~ | Code defect (process) | Delivery team | **Closed 2026-09-08.** `pnpm verify:release` runs root checks, integration tests and the browser suite; the runner provisions its own database and administrators, fails on any unexplained skip, and cleans up on success and on failure. |
| 14 | 30-minute capacity profile (NFR 003) not run; no review data in the load set | Manual verification | Delivery team | 10,000 listings measured; 100,000 reviews unmeasured. Deep pagination reached 837 ms at worst. |
| 15 | Commissioned Melbourne photography | Client decision | Client | Interim licensed images are in place and credited; replacement is documented. |

Accepted risks (no action proposed): the transitive dependency advisories dispositioned in `docs/security/dependency-advisories.md`, each pinned by Prisma or Refine and none reachable in a path this product takes.

## What would move this to "ready for production"

In order, because the later items depend on the earlier ones:

1. The client supplies D03, D09 and D10; D01, D05 and D06 are decided and recorded.
2. A staging environment is stood up with TLS and the real providers, and the system is observed working there — including one delivered email, one uploaded image and one scheduled task run.
3. The alert rules — which exist and are validated against recorded drill metrics — are wired to something that pages a human. **The rules are written; who they page is a client decision and has deliberately not been assigned.**
4. A restore drill is performed against a production-sized copy and the recovery point and time objectives are recorded from that run rather than estimated.
5. A manual screen-reader pass over the home page, a listing, the review form and the admin editors.
6. The capacity profile is run for its full 30 minutes with reviews present.
7. The browser suite joins the release gate.

Items 1–3 are the ones that would keep me from signing off production today. The rest are the difference between "it works" and "we know it works".

---

## Addendum — 8 September 2026, after remediation

The verdict above is unchanged: **ready for staging**, not production. Three of
the fifteen blockers have moved.

| # | Blocker | Change |
| --- | --- | --- |
| 8 | No monitoring, error tracking or alerting | **Now implemented in the product.** Metrics, worker heartbeats and liveness, structured logs, sixteen provider-neutral alert rules and nine failure drills — `docs/operations/monitoring.md`, `alert-response.md`, `failure-drills.md`. What remains is deployment work, not code: connect a scraper, load the rules, and route Critical alerts to a human. **No on-call person has been assigned; that needs client approval.** |
| 13 | Browser suite outside the release gate | **Closed.** `pnpm verify:release` runs `check`, `test:integration` and `test:browser`; the browser leg fails on skipped tests, provisions its own throwaway administrator and database, and cleans up on failure. A CI job is prepared but not connected. |
| 12 | Empty server-rendered 404 body | **Still open, and re-confirmed as deployment configuration rather than an application defect.** See the addendum to `complete-project-audit.md`. |

Everything else stands: the client decisions (D01, D05, D06, D10), the external
credentials (D03, D09), the staging environment, the restore drill, the manual
screen-reader pass and the full capacity run.

Item 3 of "what would move this to ready for production" is now partly done: the
dead-worker case is explicitly covered, by alert C4 and by the Workers card on
the Queue Monitor. It still has to page someone.
