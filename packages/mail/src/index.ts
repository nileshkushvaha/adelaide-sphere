export { MAIL_TRANSPORTS, PRODUCTION_MAIL_TRANSPORTS, isMailTransport, mailTransportProblem, productionMailTransportProblem, type MailTransport } from './transports.js';
export { smtpConfigFromEnv, type SmtpConfig, type SmtpEnv, type SmtpConfigResult } from './config.js';
export { SmtpTransport, SMTP_TIMEOUTS_MS, MAX_TEXT_BYTES, classify, toSendOptions, type MailMessage, type MailSendResult, type TransporterFactory } from './transport.js';
export { PermanentMailError, TransientMailError, redactAddresses, redactCredentials, redactSensitive, maskEmail } from './errors.js';
export { resendConfigFromEnv, sanitiseDisplayName, type ResendConfig, type ResendEnv, type ResendConfigResult } from './resend-config.js';
export { ResendTransport, RESEND_TIMEOUT_MS, classifyResponse } from './resend-transport.js';
export { verifyResendWebhook, signResendWebhook, WEBHOOK_TOLERANCE_SECONDS, type WebhookHeaders, type WebhookVerification, type WebhookFailure } from './resend-webhook.js';
