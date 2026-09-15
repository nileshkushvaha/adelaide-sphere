'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { CircleAlertIcon, CircleCheckIcon } from 'lucide-react';
import { Button, Input, Label, Select } from '@adelaide-sphere/ui';
import {
  CONTACT_FIELD_MESSAGES,
  CONTACT_LIMITS,
  CONTACT_TIMEOUT_STATUS,
  CONTACT_TOPICS,
  CONTACT_TOPIC_LABELS,
  contactFailureMessage,
  contactFieldErrors,
  newIdempotencyKey,
  validateContactForm,
  type ContactFormValues,
  type FieldErrors,
  type ContactTopic,
} from '@/lib/submissions';
import { TurnstileWidget, type TurnstileWidgetHandle } from './turnstile-widget';

const EMPTY: ContactFormValues = { name: '', email: '', topic: '', message: '', acknowledged: false };

/** Long enough for a slow mobile connection; short enough that a hung request is reported rather than spun forever. */
const REQUEST_TIMEOUT_MS = 20_000;

/** The API's field names in the order the fields appear, and the element each belongs to. */
const FIELD_ORDER = ['name', 'email', 'subject', 'message', 'acknowledged', 'captchaToken'] as const;
const DOM_NAME: Record<(typeof FIELD_ORDER)[number], string> = { name: 'name', email: 'email', subject: 'topic', message: 'message', acknowledged: 'consent', captchaToken: 'captcha' };

const controlClass = 'aria-[invalid=true]:border-danger';

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-sm text-danger">
      <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

interface Props {
  turnstileSiteKey: string | null;
  /** The published privacy policy, linked beside the acknowledgement when it exists. */
  privacyHref?: string | null;
  /** Renders for a narrow column (the policy-page sidebar): one field per row at every width. */
  compact?: boolean;
  /** The topic chosen before the form opened, e.g. from a price card (SRS 1.12). */
  initialTopic?: ContactTopic;
}

/**
 * Site contact form. It posts to `POST /api/v1/contact`, the same durable
 * pipeline as a business enquiry (SRS ENQ 002/003): the API stores the message
 * transactionally and answers 202, so the confirmation says "received", never
 * "delivered". The topic becomes the enquiry subject.
 *
 * Like every public write it is Turnstile-protected (SEC 002/003). Without a
 * site key the form is not offered at all — the API would refuse the submission
 * anyway, and a form that always fails is worse than an honest notice. The form
 * never has a card of its own: the page or panel around it provides one.
 */
export function ContactForm({ turnstileSiteKey, privacyHref = null, compact = false, initialTopic }: Props) {
  const [values, setValues] = useState<ContactFormValues>(() => ({ ...EMPTY, topic: initialTopic ?? '' }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // State updates are asynchronous, so a double click can land before
  // `submitting` re-renders the button as disabled; the ref refuses it at once.
  const inFlight = useRef(false);
  const turnstile = useRef<TurnstileWidgetHandle | null>(null);
  const alertRef = useRef<HTMLParagraphElement | null>(null);
  const successRef = useRef<HTMLHeadingElement | null>(null);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;

  const onToken = useCallback((token: string | null) => {
    setCaptchaToken(token);
    if (token) {
      setErrors((current) => {
        if (!current.captchaToken) return current;
        const next = { ...current };
        delete next.captchaToken;
        return next;
      });
    }
  }, []);

  if (!turnstileSiteKey) {
    return (
      <p className="rounded-card-lg border border-border bg-surface-muted p-5 text-sm leading-relaxed text-text-muted">
        Our contact form is temporarily unavailable. Listing corrections and reports can still be sent from the report and correction actions on the listing, review or article itself.
      </p>
    );
  }

  const set = <K extends keyof ContactFormValues>(key: K, value: ContactFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const fieldError = (key: string) => errors[key]?.[0];
  const errorId = (domName: string) => `${id(domName)}-error`;
  /** Ties a control to its hint and its message, and marks it invalid, so the error is announced with the field (WCAG 3.3.1). */
  const control = (domName: string, key: string, hintId?: string) => {
    const invalid = Boolean(fieldError(key));
    const describedBy = [hintId, invalid ? errorId(domName) : null].filter(Boolean).join(' ');
    return { id: id(domName), 'aria-invalid': invalid || undefined, 'aria-describedby': describedBy || undefined };
  };

  /** Moves the reader to the first field that needs attention, or to the explanation when no field does. */
  const focusProblem = (fields: FieldErrors) => {
    const first = FIELD_ORDER.find((key) => fields[key]?.length);
    requestAnimationFrame(() => {
      const target = first && first !== 'captchaToken' ? document.getElementById(id(DOM_NAME[first])) : alertRef.current;
      target?.focus();
    });
  };

  const fail = (message: string, fields: FieldErrors, resetChallenge: boolean) => {
    setErrors(fields);
    setFormError(message);
    // A Turnstile token is single use: once the API has seen it, a retry needs a new one.
    if (resetChallenge) turnstile.current?.reset();
    focusProblem(fields);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    const honeypot = new FormData(event.currentTarget).get('website');
    const found = validateContactForm(values);
    if (!captchaToken) found.captchaToken = [CONTACT_FIELD_MESSAGES.captchaToken];
    if (Object.keys(found).length > 0) {
      fail(contactFailureMessage(400), found, false);
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setFormError(null);
    setErrors({});
    try {
      const response = await fetch('/api/v1/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'idempotency-key': idempotencyKey },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          name: values.name.trim(),
          email: values.email.trim(),
          subject: values.topic,
          message: values.message.trim(),
          acknowledged: values.acknowledged,
          captchaToken,
          website: typeof honeypot === 'string' && honeypot.length > 0 ? honeypot : undefined,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { data?: { receiptId?: string }; error?: { code?: string; fields?: FieldErrors } } | null;
      if (!response.ok) {
        // What was typed stays in the form; only the challenge is renewed.
        fail(contactFailureMessage(response.status, payload?.error?.code), contactFieldErrors(payload?.error?.fields), true);
        return;
      }
      // Nothing is kept once the API has confirmed the message.
      setValues(EMPTY);
      setCaptchaToken(null);
      setReceipt(payload?.data?.receiptId ?? null);
      setSent(true);
      setIdempotencyKey(newIdempotencyKey());
      requestAnimationFrame(() => successRef.current?.focus());
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
      fail(contactFailureMessage(timedOut ? CONTACT_TIMEOUT_STATUS : 0), {}, true);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div role="status" className="flex flex-col items-start gap-3">
        <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-success/10 text-success">
          <CircleCheckIcon className="size-6" />
        </span>
        <h3 ref={successRef} tabIndex={-1} className="font-display text-xl tracking-tight">
          Message received
        </h3>
        <p className="text-sm leading-relaxed text-text-muted">Thanks for getting in touch. An editor will read your message and reply to the email address you gave.</p>
        {receipt && (
          <p className="text-sm text-text-muted">
            Your reference is <span className="font-medium text-text">{receipt}</span>.
          </p>
        )}
        <Button
          variant="outline"
          className="mt-2"
          onClick={() => {
            setSent(false);
            setReceipt(null);
            setErrors({});
            setFormError(null);
          }}
        >
          Send another message
        </Button>
      </div>
    );
  }

  const messageLength = values.message.trim().length;

  return (
    <form onSubmit={submit} noValidate aria-busy={submitting} className={compact ? 'flex flex-col gap-4' : '@container flex flex-col gap-4'}>
      {formError && (
        <p ref={alertRef} tabIndex={-1} role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{formError}</span>
        </p>
      )}

      <div className={compact ? 'grid gap-4' : 'grid gap-4 @md:grid-cols-2'}>
        <div className="min-w-0">
          <Label htmlFor={id('name')}>Name</Label>
          <Input
            {...control('name', 'name')}
            name="name"
            required
            autoComplete="name"
            placeholder="e.g. Sarah Wilson"
            maxLength={CONTACT_LIMITS.name.max}
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            className={controlClass}
          />
          <FieldError id={errorId('name')} message={fieldError('name')} />
        </div>
        <div className="min-w-0">
          <Label htmlFor={id('email')}>Email address</Label>
          <Input
            {...control('email', 'email')}
            name="email"
            type="email"
            inputMode="email"
            required
            autoComplete="email"
            placeholder="sarah@example.com"
            maxLength={CONTACT_LIMITS.email.max}
            value={values.email}
            onChange={(e) => set('email', e.target.value)}
            className={controlClass}
          />
          <FieldError id={errorId('email')} message={fieldError('email')} />
        </div>
      </div>

      <div>
        <Label htmlFor={id('topic')}>What can we help with?</Label>
        <Select {...control('topic', 'subject')} name="topic" required value={values.topic} onChange={(e) => set('topic', e.target.value)} className={controlClass}>
          <option value="">Choose a topic</option>
          {CONTACT_TOPICS.map((topic) => (
            <option key={topic} value={topic}>
              {CONTACT_TOPIC_LABELS[topic]}
            </option>
          ))}
        </Select>
        <FieldError id={errorId('topic')} message={fieldError('subject')} />
      </div>

      <div>
        <Label htmlFor={id('message')}>Message</Label>
        <textarea
          {...control('message', 'message', `${id('message')}-hint`)}
          name="message"
          required
          rows={4}
          placeholder="Tell us how we can help…"
          maxLength={CONTACT_LIMITS.message.max}
          value={values.message}
          onChange={(e) => set('message', e.target.value)}
          className={`min-h-28 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base leading-relaxed text-text placeholder:text-text-muted ${controlClass}`}
        />
        <FieldError id={errorId('message')} message={fieldError('message')} />
        <div className="mt-1.5 flex items-start justify-between gap-3 text-sm text-text-muted">
          <p id={`${id('message')}-hint`}>If it’s about a business, article or review, include its name or page address.</p>
          {/* A visual aid only; the limits are announced through the error when they matter. */}
          <span aria-hidden="true" className="shrink-0 tabular-nums">
            {messageLength}/{CONTACT_LIMITS.message.max}
          </span>
        </div>
      </div>

      {/* Honeypot: hidden from people, tempting to bots (SRS SEC 002). */}
      <div aria-hidden="true" className="hidden">
        <label htmlFor={id('website')}>Leave this field empty</label>
        <input id={id('website')} name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <div className="flex items-start gap-3">
          <input
            {...control('consent', 'acknowledged')}
            type="checkbox"
            name="acknowledged"
            required
            checked={values.acknowledged}
            onChange={(e) => set('acknowledged', e.target.checked)}
            className="mt-1 size-4 shrink-0 accent-sky-700"
          />
          <div className="text-sm leading-relaxed">
            <label htmlFor={id('consent')}>I understand the editors will use my name, email address and message to respond to this enquiry.</label>
            {privacyHref && (
              <>
                {' '}
                <a href={privacyHref} className="text-link underline underline-offset-2 hover:no-underline">
                  Privacy policy
                </a>
              </>
            )}
          </div>
        </div>
        <FieldError id={errorId('consent')} message={fieldError('acknowledged')} />
      </div>

      <div>
        <TurnstileWidget ref={turnstile} siteKey={turnstileSiteKey} action="contact" onToken={onToken} errorId={fieldError('captchaToken') ? errorId('captcha') : undefined} />
        <FieldError id={errorId('captcha')} message={fieldError('captchaToken')} />
      </div>

      <div className={compact ? '' : 'flex flex-col gap-3 border-t border-border pt-4 @md:flex-row @md:items-center @md:justify-between'}>
        <Button type="submit" size={compact ? 'default' : 'lg'} className={compact ? 'w-full' : 'w-full @md:w-auto'} disabled={submitting}>
          {submitting ? 'Sending…' : 'Send message'}
        </Button>
        {!compact && <p className="text-xs leading-relaxed text-text-muted">Read by an editor. Your details are never published.</p>}
      </div>
    </form>
  );
}
