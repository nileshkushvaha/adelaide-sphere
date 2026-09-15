'use client';

import { useCallback, useRef, useState } from 'react';
import { Button, Input, Label } from '@adelaide-sphere/ui';
import { ENQUIRY_FIELD_COPY, enquiryFailureMessage, newIdempotencyKey, readerFieldErrors, withoutCaptchaError, type FieldErrors } from '@/lib/submissions';
import { TurnstileWidget, type TurnstileWidgetHandle } from './turnstile-widget';

interface Props {
  businessId: string;
  businessName: string;
  turnstileSiteKey: string | null;
  /**
   * Renders for a narrow column (the listing sidebar): fields stack in one
   * column at every width, because the two-column layout below is keyed to the
   * viewport, not to the space this form actually has.
   */
  compact?: boolean;
}

interface Values {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  acknowledged: boolean;
}

const EMPTY: Values = { name: '', email: '', phone: '', subject: '', message: '', acknowledged: false };

function validate(values: Values): FieldErrors {
  const errors: FieldErrors = {};
  if (values.name.trim().length < 2 || values.name.trim().length > 80) errors.name = ['Name must be 2–80 characters'];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = ['Enter a valid email address'];
  if (values.subject.trim().length < 3 || values.subject.trim().length > 150) errors.subject = ['Subject must be 3–150 characters'];
  if (values.message.trim().length < 20 || values.message.trim().length > 5000) errors.message = ['Message must be 20–5000 characters'];
  if (!values.acknowledged) errors.acknowledged = ['Please confirm your details may be shared with the business'];
  return errors;
}

/**
 * Enquiry form (SRS ENQ 001–003). There is no destination field: the API routes
 * the message from the listing. A 202 means the message was accepted durably,
 * so the confirmation never claims it was delivered.
 */
export function EnquiryForm({ businessId, businessName, turnstileSiteKey, compact = false }: Props) {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstile = useRef<TurnstileWidgetHandle | null>(null);
  // The button is disabled only after a render; this stops a second press before that.
  const inFlight = useRef(false);
  const onToken = useCallback((token: string | null) => {
    setCaptchaToken(token);
    if (token) setErrors((current) => withoutCaptchaError(current));
  }, []);

  if (!turnstileSiteKey) {
    return <p className="rounded-card border border-border bg-surface-muted p-4 text-sm text-text-muted">The contact form is temporarily unavailable. Please use the phone number or website above.</p>;
  }

  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }));
  const fieldError = (key: string) => errors[key]?.[0];

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    setFormError(null);
    const found = validate(values);
    if (!captchaToken) found.captchaToken = ['Please complete the security check'];
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const data = new FormData(event.currentTarget);
    inFlight.current = true;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/v1/businesses/${encodeURIComponent(businessId)}/enquiries`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'idempotency-key': idempotencyKey },
        body: JSON.stringify({
          name: values.name.trim(),
          email: values.email.trim(),
          phone: values.phone.trim() || undefined,
          subject: values.subject.trim(),
          message: values.message.trim(),
          acknowledged: values.acknowledged,
          captchaToken,
          website: (data.get('website') as string | null) || undefined,
        }),
      });
      const body = (await response.json().catch(() => null)) as { data?: { receiptId: string }; error?: { code?: string; fields?: FieldErrors } } | null;
      if (!response.ok) {
        setErrors(readerFieldErrors(body?.error?.fields, ENQUIRY_FIELD_COPY));
        setFormError(enquiryFailureMessage(response.status, body?.error?.code));
        // A token is single use: once the API has seen it, a retry needs a new one.
        turnstile.current?.reset();
        return;
      }
      setReceipt(body?.data?.receiptId ?? null);
      setValues(EMPTY);
      setIdempotencyKey(newIdempotencyKey());
    } catch {
      setFormError('We could not reach the server. Please try again.');
      turnstile.current?.reset();
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  if (receipt) {
    return (
      <div role="status" className="rounded-card border border-border bg-surface-raised p-5">
        <p className="font-semibold">Message accepted</p>
        <p className="mt-1 text-sm text-text-muted">We have your message and are passing it to {businessName}. Your reference is {receipt}. They will reply to you directly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-card border border-border bg-surface-raised p-5">
      {formError && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      )}
      <div className={compact ? 'grid gap-4' : 'grid gap-4 sm:grid-cols-2'}>
        <div>
          <Label htmlFor="enquiry-name">Your name</Label>
          <Input id="enquiry-name" value={values.name} onChange={(e) => set('name', e.target.value)} maxLength={80} aria-invalid={Boolean(fieldError('name'))} />
          {fieldError('name') && <p className="mt-1 text-sm text-danger">{fieldError('name')}</p>}
        </div>
        <div>
          <Label htmlFor="enquiry-email">Your email</Label>
          <Input id="enquiry-email" type="email" inputMode="email" value={values.email} onChange={(e) => set('email', e.target.value)} maxLength={254} aria-invalid={Boolean(fieldError('email'))} />
          {fieldError('email') && <p className="mt-1 text-sm text-danger">{fieldError('email')}</p>}
        </div>
        <div>
          <Label htmlFor="enquiry-phone">Phone (optional)</Label>
          <Input id="enquiry-phone" inputMode="tel" value={values.phone} onChange={(e) => set('phone', e.target.value)} maxLength={30} />
        </div>
        <div>
          <Label htmlFor="enquiry-subject">Subject</Label>
          <Input id="enquiry-subject" value={values.subject} onChange={(e) => set('subject', e.target.value)} maxLength={150} aria-invalid={Boolean(fieldError('subject'))} />
          {fieldError('subject') && <p className="mt-1 text-sm text-danger">{fieldError('subject')}</p>}
        </div>
      </div>
      <div>
        <Label htmlFor="enquiry-message">Message</Label>
        <textarea id="enquiry-message" rows={compact ? 4 : 5} value={values.message} onChange={(e) => set('message', e.target.value)} maxLength={5000} aria-invalid={Boolean(fieldError('message'))} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-text" />
        {fieldError('message') && <p className="mt-1 text-sm text-danger">{fieldError('message')}</p>}
      </div>
      <div aria-hidden="true" className="hidden">
        <label htmlFor="enquiry-website">Leave this field empty</label>
        <input id="enquiry-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={values.acknowledged} onChange={(e) => set('acknowledged', e.target.checked)} className="mt-1 size-4" />
          <span>I understand my name, email{values.phone.trim() ? ' and phone number' : ''} and message will be sent to {businessName} so they can reply.</span>
        </label>
        {fieldError('acknowledged') && <p className="mt-1 text-sm text-danger">{fieldError('acknowledged')}</p>}
      </div>
      <TurnstileWidget ref={turnstile} siteKey={turnstileSiteKey} action="enquiry" onToken={onToken} />
      {fieldError('captchaToken') && <p className="text-sm text-danger">{fieldError('captchaToken')}</p>}
      <div>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Sending…' : `Send message to ${businessName}`}
        </Button>
      </div>
    </form>
  );
}
