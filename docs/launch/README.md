# Launch-readiness decision pack

Prepared 2026-09-07 for the Melbourne Sphere product owner. Every phase in the delivery roadmap is complete; what stands between the current build and a public launch is a set of decisions and inputs that only the client can provide, plus two engineering checks that need a staging environment. This folder collects them.

| Document | Audience | What it asks for |
| --- | --- | --- |
| [client-decisions.md](client-decisions.md) | Product owner | Every open decision in one register: question, why it matters, recommended default, alternatives, impact, deadline, status, responsible party |
| [melbourne-boundary.md](melbourne-boundary.md) | Product owner, content lead | The recommended geographic boundary (decision D01) with the proposed locality list, validation rules and the procedure for changing the list later |
| [content-requirements.md](content-requirements.md) | Product owner, content and design leads | Every client-supplied item the public site still needs: location, format, length, image sizes, accessibility requirement, current fallback, approval status |
| [seo-approval.md](seo-approval.md) | Product owner, technical lead | Proposed titles, descriptions, URL patterns, canonical and indexing policy, structured data and the review rich-result sign-off (SEO 006) |

Related, already in the repository: the pre-launch audit and gate list (`docs/pre-audit-report.md` §4), the operations runbook (`docs/operations/runbook.md`, which still needs the on-call table filled in), and the requirement-by-requirement status (`docs/requirements-traceability.md`).

## What was done alongside this pack (engineering, no decision needed)

- **Transactional email is provider-independent and production-ready.** A shared SMTP adapter (`packages/mail`) now serves both password-reset mail from the API and enquiry delivery from the worker. Production refuses to start unless an authenticated, TLS-protected relay is configured; locally, mail lands in a Mailpit inbox at http://127.0.0.1:8025. Choosing the provider (D03) becomes a credential change.
- **CAPTCHA, object storage and job dispatch** already had provider-independent boundaries (`CaptchaPort`, `ObjectStoragePort`, `QueuePort`); they were reviewed against the requirements in this pack and need no code change. What they need is the client's accounts.
- **Review rich results (SEO 006) are now explicitly off** until the technical lead signs off; the visible star ratings are unaffected.
- **Development-only content was isolated**: the starter favicon (a third-party mark) was replaced with an original development icon, and the review and comment forms no longer link to a guidelines page that does not exist yet.

## How to respond

Answer in `client-decisions.md` (or by email, quoting the decision ID). A decision is "recorded" once its row's status is changed and the source of the answer is noted; the engineering team then applies it and updates `docs/requirements-traceability.md`.
