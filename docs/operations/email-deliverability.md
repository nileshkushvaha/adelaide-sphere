# Transactional email: provider, deliverability and operations

Covers SRS 1.2 **MAIL 001–010**. The provider decision is **D03b / D09** in `docs/launch/client-decisions.md`; nothing here can be completed without the client's account and domain.

## What the code already does

| Requirement | Where |
| --- | --- |
| One adapter boundary, provider chosen by environment | `packages/mail` (`SmtpTransport`, `ResendTransport`), `MAIL_TRANSPORT` |
| Production start-up fails on missing or unsafe configuration | `apps/api/src/config/env.validation.ts` + `resendConfigFromEnv` |
| Asynchronous dispatch, idempotency, bounded retries | enquiry outbox + BullMQ worker; `Idempotency-Key` on every Resend request |
| Delivery records with masked recipients, no bodies | `email_deliveries`, `apps/api/src/email/*` |
| Signed, idempotent webhook with status precedence | `verifyResendWebhook`, `POST /api/v1/webhooks/email` |
| Admin log with reveal and resend, both separately permissioned | `/admin/email-logs`, admin **System → Email logs** |

## Environment

| Variable | Local | Staging | Production |
| --- | --- | --- | --- |
| `MAIL_TRANSPORT` | `smtp` (Mailpit) | `smtp` | `smtp` |
| `SMTP_HOST` / `SMTP_PORT` | `127.0.0.1` / `1035` | staging mailbox's host / `587` | `mail.adelaidesphere.com` / `587` |
| `SMTP_SECURE` | `false` | `false` (STARTTLS) | `false` (STARTTLS, enforced) |
| `SMTP_USER` / `SMTP_PASSWORD` | empty | staging mailbox | `smtp@adelaidesphere.com` / secret store only |
| `MAIL_FROM_ADDRESS` | anything | staging sender | `noreply@adelaidesphere.com` |
| `MAIL_FROM_NAME` | `Adelaide Sphere` | `Adelaide Sphere` | `Adelaide Sphere` |

Production uses the domain's own SMTP server (user decision, 17 Sep 2026). Resend stays supported as an alternative (`MAIL_TRANSPORT=resend` with `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, optional `MAIL_REPLY_TO_ADDRESS`); with SMTP those variables are unused and there is no delivery webhook, so the log records acceptance by the relay but never *delivered*, *bounced* or *complained*.

Automated tests use an isolated test transport and never reach a provider. Every one of these values is environment-managed: none is a setting, none is returned by any endpoint, and none appears in a log line or an error message (SET 004, MAIL 002).

Production start-up **fails** — it does not warn and continue — when, with SMTP, the host is loopback, the credentials are missing or the From name is multi-line; with Resend, when the API key is missing or malformed, the sender is absent or sits on a development or reserved domain, the webhook secret is missing, the API base URL has been overridden, or a development transport is selected. That is deliberate: a transport that silently discards mail is worse than a service that refuses to start.

## Domain set-up before launch (client action, D09)

1. **Dedicated sending subdomain** — send from `mail.<domain>` rather than the root domain, so a deliverability problem with marketing or a third-party tool never affects password resets.
2. **SPF** — publish the provider's `include:` in the sending subdomain's SPF record. One SPF record per domain; do not exceed ten DNS lookups.
3. **DKIM** — publish the provider's DKIM records and confirm the provider reports the domain as verified before any real message is sent.
4. **DMARC** — publish `p=none` with `rua=` reporting first, review reports for at least two weeks, then move to `p=quarantine` and finally `p=reject` once all legitimate sources pass. Enforcement before review will lose real mail.
5. **From address** — a real, monitored mailbox on the verified domain. Never a no-reply address that bounces.
6. **Reply-To** — enquiry mail sets Reply-To to the visitor so the business can answer directly; authentication mail uses the support address.
7. **Bounce and complaint handling** — the webhook records both. An address that hard-bounces or complains is never resent to automatically; the log refuses it and the operator decides.
8. **Suppression list** — the provider's suppression list is authoritative. Do not attempt to send around it.
9. **Rate limits** — confirm the plan's per-second and per-day limits and check them against the NFR 003 workload before launch.
10. **Test messages** — before go-live, send to at least two independent mailbox providers (for example Gmail and Outlook), confirm inbox placement, headers and DKIM alignment, and record the evidence with the release.

**Do not claim guaranteed inbox placement.** No provider can promise it. Deliverability is monitored — bounce rate, complaint rate, delivery latency — and acted on; it is not a contractual property of the provider.

## Operating the log

- **System → Email logs** lists every message with its status, provider events and safe failure detail. Recipients are masked; revealing one needs `system.email_logs.recipients.view` and is recorded as an audit event naming the administrator.
- **Resend** needs `system.email_logs.resend`, requires confirmation, creates a new attempt linked to the original, and is **refused** for a message that was delivered, complained about or suppressed. There is no bulk "resend all failed": a bulk action must act on an explicit bounded selection.
- **Statuses never go backwards.** A late or replayed provider event records its own timestamp but cannot move a bounced message back to delivered (MAIL 008).
- **Password reset and account set-up mail is not resendable** from the log: the person requests it again themselves, which is the safer path.

## Webhook

Point the provider at `https://<api-host>/api/v1/webhooks/email` and store the signing secret as `RESEND_WEBHOOK_SECRET`.

The endpoint verifies the Svix-style signature over the raw body before parsing anything, refuses an unsigned, wrongly signed, tampered or replayed request with `401` and a body that explains nothing, deduplicates on the provider's event id, tolerates out-of-order delivery, and always answers `202` for a verified request so the provider does not retry into a storm. It is not authenticated by a session cookie and is exempt from the admin guard chain by explicit declaration.

## Still outstanding

- **D09** — production mail uses `mail.adelaidesphere.com` (SMTP, 587 STARTTLS, `smtp@adelaidesphere.com`), sending as `Adelaide Sphere <noreply@adelaidesphere.com>`. Still to confirm on the mail host: SPF, DKIM and DMARC for `adelaidesphere.com` align with that server, `smtp@` may send as `noreply@`, and `noreply@` accepts mail (item 5 above: a sender that bounces replies harms reputation), plus the host's sending limits (item 9).
- **Bounces with SMTP** — without a provider webhook, bounces arrive as mail to the sender. Monitor the `noreply@` mailbox (or the host's bounce reports) until a webhook-capable provider is used.
- **Retention** — delivery records are kept for 180 days and the protected recipient removed at 90 (MAIL 010). The scheduled job that enforces this lands with the scheduled tasks module (TASK 001–006); until then no record is purged automatically.
- **Staging verification** — the webhook, DKIM alignment and inbox placement can only be proven against the real provider once D09 is answered.
