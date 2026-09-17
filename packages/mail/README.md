# @adelaide-sphere/mail

The transactional email boundary shared by `apps/api` (password reset and account set-up messages) and `apps/worker` (enquiry delivery). It exists so the email *provider* is a credential decision (D03), not a code change.

- `config.ts` — `smtpConfigFromEnv`: validates `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` and the optional sender display name `MAIL_FROM_NAME` (one line, at most 78 characters), which `SmtpTransport` sends as a structured From address. Outside production a plaintext loopback catcher (Mailpit) is allowed; production requires authentication, a non-loopback relay and STARTTLS or implicit TLS.
- `transport.ts` — `SmtpTransport`: nodemailer SMTP with bounded DNS/connection/greeting/socket timeouts, no pooling, plain text only, no file or URL access, header-injection refusal, a caller-owned stable `Message-ID`, and failure classification into `TransientMailError` (retry) or `PermanentMailError` (stop). Error messages are redacted of addresses before they are thrown, so callers may log and store them.
- `errors.ts` — the two error classes and `redactAddresses`.

Why SMTP: every provider under consideration (Amazon SES, Postmark, Mailgun, SendGrid, Resend, Brevo, or a relay run by the host) offers an authenticated SMTP endpoint. A provider's HTTP API and its webhook format (bounces and complaints, SRS ENQ 006) are provider-specific and belong in a second adapter behind the same port once the provider is chosen.

The package never logs. Retry counts and backoff belong to the queue policy in `@adelaide-sphere/domain`.
