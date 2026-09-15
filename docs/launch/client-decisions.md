# Client decisions required before launch

Status date: 2026-09-07. Source of the baselines: SRS §23 (decisions D01–D08), SRS SCP 004–005, CFG 001–002, SEO 006, MON 002, OPS 001. Nothing in this register has been decided by the engineering team; where a default is "applied", it is the SRS's own conservative baseline and it can be changed without rework once you answer.

**How to read the register.** Each decision has a short question in plain language, why it matters, the default we recommend, the alternatives, what changes technically, when it is needed, and who owns the answer. "Recorded" means you have answered in writing (email or a note in this file) and the answer's source is cited. No production detail (an address, a credential, a person's name, legal copy) will be filled in by the engineering team on your behalf.

## Summary

| ID | Decision | Needed by | Status | Owner |
| --- | --- | --- | --- | --- |
| D01 | Melbourne geographic boundary and locality allow-list | Before publishing listings outside the City of Melbourne | **Pending** — council-area baseline applied; recommendation in `melbourne-boundary.md` | Client |
| D02 | Logo, wordmark, browser icon, share image, hero photography, rotating phrases | Before visual acceptance | **Pending** — documented development fallbacks in place | Client / design lead |
| D03a | Cloudflare Turnstile account and keys | Before staging (public forms are closed without it) | **Provided** — confirmed by the client 15 Sep 2026; keys held in the server env files only | Technical lead / client |
| D03b | Transactional email provider and verified sender | Before staging (enquiry delivery cannot be proven without it) | **Provided** — confirmed by the client 15 Sep 2026; prove enquiry and password-reset delivery on staging | Technical lead / client |
| D03c | Object storage (S3-compatible) and CDN | Before staging | **Provided** — confirmed by the client 15 Sep 2026 (VPS media storage) | Technical lead / client |
| D03d | Hosting region, observability (error tracking, uptime) | Before staging | **Partly provided** — VPS confirmed 15 Sep 2026; error tracking and uptime alerting still pending (launch blocker) | Technical lead / client |
| D04 | Public domain, public contact address, per-business enquiry recipients | Before delivery tests | **Domain provided** — confirmed 15 Sep 2026; public contact address and enquiry recipients are set in the admin before launch | Client |
| D05 | Approved public copy: About, Contact, Privacy, Terms, Review guidelines | Before live form collection | **Pending** — pages refuse to publish placeholder text | Client (legal review) |
| D05a | Approved homepage and section copy | Before visual acceptance | **Pending** — original development copy in place, listed in `content-requirements.md` | Client |
| D06 | Two-factor (TOTP) policy for administrators | Before administrator onboarding | **Pending** — optional TOTP applied | Client / security owner |
| D07 | Named alert / on-call owner and escalation channel | Before launch (alerts without a responder do not satisfy MON 002) | **Pending** — table in the runbook is empty | Client / operations |
| D07a | Staging environment ownership | Before UAT on staging | **Pending** | Client / technical lead |
| D08 | "Open now" filter readiness | Before enabling | **Applied automatically** — the filter appears only when hours coverage meets the threshold; no decision needed unless you want it forced off | Content / QA lead |
| S01 | SEO sign-off (titles, descriptions, indexing policy) | Before launch | **Pending** — proposals in `seo-approval.md` | Client / technical lead |
| S02 | Review rich-result markup (SEO 006) | Before enabling; can follow launch | **Off** until the technical lead confirms eligibility | Technical lead |
| Q01 | Manual screen-reader review | Before launch | **Not started** — needs a reviewer with NVDA or VoiceOver | Client-appointed reviewer or the engineering team, on request |

## Decision records

### D01 — Which parts of Melbourne does the directory cover?

- **Question.** When the site says "Melbourne", do you mean the City of Melbourne council area (the CBD and its immediate surrounds), the whole metropolitan area, or a specific list of suburbs you approve?
- **Why it matters.** Every listing must be checked against an approved boundary before it can be published (SRS SCP 004). If the boundary is too narrow, most of the businesses people expect to find (Fitzroy, St Kilda, Richmond, Footscray…) cannot be listed. If it is too wide or undefined, the directory loses its "Melbourne, done properly" positioning and editors cannot say no consistently.
- **Recommended default.** A curated allow-list of gazetted suburbs (localities), bounded by the Australian Bureau of Statistics' "Greater Melbourne" statistical area, activated in tiers starting from the inner city. Details, the proposed list and the rules are in `melbourne-boundary.md`.
- **Alternatives.** (a) Keep only the City of Melbourne council area (current state). (b) Allow all of Greater Melbourne in one step.
- **Technical impact.** None to the application's structure: the site has one fixed city and will keep it. Only the "local areas" list changes (rows in the admin, seeded from a reviewed file). No city selector, no country selector, no new routes.
- **Deadline / dependency.** Before any listing outside the 14 baseline areas is published. Listings can be prepared as drafts meanwhile.
- **Current status.** Pending. The conservative council-area baseline is live: 14 areas, four of which (Carlton North, Flemington, Port Melbourne, South Yarra) are only partly inside the council boundary.
- **Responsible party.** Client (product owner). Engineering applies the answer.

### D02 — Brand assets and homepage imagery

- **Question.** Can you supply the final logo (with a version that works on dark blue), a square browser icon, a default sharing image, Melbourne photographs you own or have licensed for the homepage banner, and the short phrases that rotate in the headline?
- **Why it matters.** The site currently shows an original development wordmark and icon, and two Creative Commons photographs with the required credit line. They are honest fallbacks, not your brand. Sharing links on social platforms currently carry no image.
- **Recommended default.** Supply the items in `content-requirements.md` §2; each is uploaded through the admin's General settings and Site settings screens, with no code change.
- **Alternatives.** Commission the design lead to produce them; or approve the development fallbacks explicitly as launch assets (the two photographs are licensed for commercial use with attribution, so this is permissible).
- **Technical impact.** None. Uploaded assets replace the fallbacks immediately.
- **Deadline / dependency.** Before visual acceptance testing.
- **Current status.** Pending.
- **Responsible party.** Client and design lead.

### D03a — Cloudflare Turnstile (spam protection for public forms)

- **Question.** Will you create a Cloudflare account (free tier is sufficient) and add the production and staging hostnames as Turnstile widgets, then hand the site key and secret key to the technical lead through the secret store?
- **Why it matters.** Reviews, comments, business enquiries and the contact form are verified server-side with Turnstile (SRS SEC 002). Without the keys the forms are deliberately closed: the API answers "temporarily unavailable" and the pages explain that submissions are closed. The site never accepts unverified submissions.
- **Recommended default.** Cloudflare Turnstile, as specified in the SRS. Managed mode (invisible where possible).
- **Alternatives.** None within the SRS. Another CAPTCHA would need a new adapter behind the existing `CaptchaPort` (small, but a change request).
- **Technical impact.** Configuration only: `TURNSTILE_SITE_KEY` on the web tier, `TURNSTILE_SECRET_KEY` on the API. The API verifies the expected hostname, so the widget must be registered for the exact public domain (D04).
- **Deadline / dependency.** Before staging; the SRS acceptance for enquiries and reviews cannot run without it.
- **Current status.** Pending. No account exists; nothing has been signed up for on your behalf.
- **Responsible party.** Technical lead (setup) and client (account ownership and billing, if any).

### D03b — Transactional email provider and sender identity

- **Question.** Which email service will send the site's mail (enquiries to businesses, general contact messages to your editors, administrator password resets), and which address will they come from (for example a no-reply mailbox on your domain)?
- **Why it matters.** An accepted enquiry is stored durably and delivered later by a background worker (SRS ENQ 003–005). The worker needs a real relay; in production it refuses to start without one. The sender domain must be verified with the provider (SPF, DKIM) or messages will be treated as spam.
- **Recommended default.** Any provider with an authenticated SMTP endpoint in an Australian or nearby region; Amazon SES (ap-southeast-2, Sydney) is the lowest-cost option that satisfies the SRS's regional preference, and Postmark is the simplest to operate. The application talks SMTP, so this choice does not require code.
- **Alternatives.** Any other provider with SMTP (Mailgun, SendGrid, Resend, Brevo) or a relay run by your host. Bounce and complaint handling (ENQ 006) is provider-specific and is added once the provider is known.
- **Technical impact.** Configuration: `MAIL_TRANSPORT=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM_ADDRESS`, `SITE_ENQUIRY_RECIPIENT`. One follow-up engineering task for webhooks once the provider is chosen.
- **Deadline / dependency.** Before staging; depends on D04 (domain) for sender verification.
- **Current status.** Pending. The adapter is implemented and verified locally against a mail catcher.
- **Responsible party.** Technical lead (setup, DNS records) and client (account and domain ownership).

### D03c — Object storage and CDN for images

- **Question.** Which S3-compatible storage will hold uploaded images, and which CDN or public bucket URL will serve them?
- **Why it matters.** Every image an editor uploads goes to a private "quarantine" bucket, is checked and re-encoded, then published to a public bucket (SRS MED 002). Locally this runs on MinIO; production needs a real bucket pair, a least-privilege access key, versioning and a daily backup or replication (BACK 001).
- **Recommended default.** The same cloud as the hosting choice (D03d), in an Australian region, with a CDN in front of the public bucket.
- **Alternatives.** Any S3-compatible provider (Cloudflare R2, Backblaze B2, DigitalOcean Spaces, Wasabi). Note the SRS asks for cross-border processing to be recorded if the region is not Australian.
- **Technical impact.** Configuration: `MEDIA_S3_*`, `MEDIA_PUBLIC_BASE_URL`. Bucket policy is normally provisioned by infrastructure; the application tolerates not being allowed to set it.
- **Deadline / dependency.** Before staging.
- **Current status.** Pending.
- **Responsible party.** Technical lead and client.

### D03d — Hosting region and observability

- **Question.** Where will the site run (region), and which error-tracking and uptime services will be used?
- **Why it matters.** The SRS prefers an Australian region for primary data (OPS 001) and requires error tracking, uptime checks and alerting (MON 001–002).
- **Recommended default.** An Australian region; an error tracker such as Sentry; an external uptime probe on the home page, a listing page and the API health endpoint.
- **Alternatives.** Other regions with documented cross-border processing; other observability vendors.
- **Technical impact.** Configuration and a small integration for the error tracker (not yet wired: no vendor was chosen).
- **Deadline / dependency.** Before staging.
- **Current status.** Pending.
- **Responsible party.** Technical lead and client.

### D04 — Public domain, public contact address and enquiry recipients

- **Question.** What is the final public domain? Which mailbox should be shown publicly as the site's contact address (it appears in the footer, on "Add or update a business" and on correction links)? For each listed business, which private mailbox should receive its enquiries?
- **Why it matters.** The site refuses to publish a contact address on a development domain, so the footer contact block, correction links and the listing-request action are currently withheld (they point to an explanation instead). Business enquiries can only be routed to a recipient an editor has recorded on the listing; a listing without one shows phone and website only.
- **Recommended default.** A monitored shared mailbox on your domain for the public address; per-business recipients collected during listing verification.
- **Alternatives.** Publishing a phone number only (the site supports it); using the general contact form only.
- **Technical impact.** None: the public address is set in General settings and per-business recipients on each listing. The domain sets `PUBLIC_SITE_URL` / `SITE_ORIGIN` and the Turnstile hostname.
- **Deadline / dependency.** Before delivery tests on staging.
- **Current status.** Pending. No address has been invented; the site withholds the contact route.
- **Responsible party.** Client.

### D05 — Approved public copy: policies and information pages

- **Question.** Can you supply the final text for About, Contact, Privacy, Terms and Review guidelines, reviewed by whoever handles your legal and privacy obligations?
- **Why it matters.** These pages cannot be published with placeholder wording (the admin refuses, by design, SRS CFG 002). Until Privacy and Review guidelines exist, the review and comment forms' acknowledgement wording has nothing to link to, and the SRS (PRIV 001) requires a published privacy notice before live form collection.
- **Recommended default.** Supply the copy in the format described in `content-requirements.md` §1. Engineering can provide a structural outline of what the privacy notice must cover (data collected, retention periods from SRS PRIV 001, the access/correction/deletion procedure) but not the legal text itself.
- **Alternatives.** Launch without public forms (reviews, comments and enquiries closed) until the policies exist. The site supports that state today.
- **Technical impact.** None: pages are edited and published in the admin.
- **Deadline / dependency.** Before live form collection; About and Contact before launch for navigation completeness (UX 002).
- **Current status.** Pending.
- **Responsible party.** Client, with legal review.

### D05a — Homepage and section copy

- **Question.** Do you approve the original copy written for the homepage, the contact page explanation and the empty states, or do you want to supply your own?
- **Why it matters.** The copy is original and makes no unverifiable claims, but it is the engineering team's wording, not yours.
- **Recommended default.** Review the inventory in `content-requirements.md` §3 and mark each item approved or replaced.
- **Deadline / dependency.** Before visual acceptance.
- **Current status.** Pending.
- **Responsible party.** Client.

### D06 — Two-factor authentication policy for administrators

- **Question.** Should every administrator be required to set up an authenticator app, or should it stay optional?
- **Why it matters.** Administrator accounts can publish content and read enquiries. The SRS baseline is optional TOTP, which is what the build does today: every administrator can enrol an authenticator app from Account security, but nothing forces them to. A mandatory policy is stronger and is a small engineering change (an enrolment gate at login).
- **Recommended default.** Mandatory for every administrator in production.
- **Alternatives.** Optional (current baseline).
- **Technical impact.** None if optional stays. If mandatory: a small engineering task to add the enrolment gate at login and a grace period for existing accounts; the TOTP flow itself exists.
- **Deadline / dependency.** Before administrator onboarding.
- **Current status.** Pending; optional TOTP applied.
- **Responsible party.** Client / security owner.

### D07 — Alert and on-call ownership

- **Question.** Who receives alerts when the site is down, error rates rise, the outbound mail queue stalls, scheduled publishing is late or the backup is stale (SRS MON 002)? Who is the escalation, and through which channel?
- **Why it matters.** The monitoring endpoints and thresholds exist; the SRS says a dashboard without a named responder does not satisfy the requirement.
- **Recommended default.** A primary responder from the hosting or technical partner with a documented escalation to a client contact, recorded in `docs/operations/runbook.md` §5.
- **Technical impact.** None beyond configuring the alert destinations.
- **Deadline / dependency.** Before launch.
- **Current status.** Pending. The runbook table is intentionally empty; no names have been assigned.
- **Responsible party.** Client / operations.

### D07a — Staging environment ownership

- **Question.** Who provisions and pays for the staging environment (separate database, buckets, queue and credentials, access-controlled and noindex, SRS OPS 001), and who has access?
- **Why it matters.** The remaining verification items — UAT journeys against a deployed environment, the capacity run on production-shaped infrastructure, the production-shaped restore drill, and end-to-end email delivery — all need staging.
- **Recommended default.** The hosting partner provisions staging identical in shape to production but smaller; the technical lead holds the credentials in the secret store.
- **Deadline / dependency.** Before UAT sign-off.
- **Current status.** Pending.
- **Responsible party.** Client / technical lead.

### D08 — "Open now" filter

- **Question.** None required. The filter switches itself on only when at least 60% of published listings (and at least five) publish opening hours, so it cannot mislead while hours coverage is thin.
- **Current status.** Applied automatically. Tell the engineering team only if you want it disabled regardless of coverage.
- **Responsible party.** Content / QA lead.

### S01 — SEO sign-off

- **Question.** Do you approve the proposed page titles, descriptions, URL patterns and indexing rules in `seo-approval.md`?
- **Why it matters.** These are what search engines and social platforms show; changing them after launch resets some of the site's search history.
- **Deadline / dependency.** Before launch.
- **Current status.** Pending.
- **Responsible party.** Client and technical lead.

### S02 — Review rich results (SEO 006)

- **Question.** For the technical lead: after checking Google's current policy on review snippets for directory-style sites, should the AggregateRating markup be enabled?
- **Why it matters.** The SRS requires this check before the markup is emitted; Google has restricted review snippets for sites that host reviews about other businesses, and invalid use can cost the site rich results altogether.
- **Recommended default.** Leave off at launch; revisit after the technical lead's check.
- **Technical impact.** A single flag on the web tier (`REVIEW_RICH_RESULTS=true`). Visible ratings on the page are unaffected either way.
- **Current status.** Off.
- **Responsible party.** Technical lead.

### Q01 — Manual screen-reader review

- **Question.** Who will perform a screen-reader pass (NVDA on Windows and VoiceOver on macOS/iOS) over the public pages and the admin, and when?
- **Why it matters.** Keyboard order, skip link, landmarks, headings, contrast and the 320 px layout are verified automatically on every build; an actual screen-reader session is the one WCAG 2.2 AA check that cannot be automated (SRS NFR 006/011, T02/T14).
- **Recommended default.** A half-day review by an accessibility specialist against the checklist in `docs/pre-audit-report.md`, with findings logged as issues.
- **Deadline / dependency.** Before launch.
- **Current status.** Not started.
- **Responsible party.** Client-appointed reviewer; the engineering team can run it on request if no specialist is available, and will say so in the evidence pack.
