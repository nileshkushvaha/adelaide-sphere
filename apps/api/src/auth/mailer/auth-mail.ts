import { renderEmail } from '@adelaide-sphere/domain';
import type { OutboundMail } from './mailer.port.js';

/**
 * The two authentication messages, built in one place so the invitation and
 * its resend, and every reset, say the same thing. Both come from the shared
 * email layout (`@adelaide-sphere/domain`), which writes the HTML and the
 * plain-text parts from one content object and escapes every value.
 *
 * The link lifetime is passed in, never written as a constant: the reset
 * lifetime is a security setting that can be shortened, and a message that
 * promises 30 minutes for a 10-minute link is a support call.
 */

/** "30 minutes", "1 hour", "24 hours" — the unit a person would use. */
export function describeLifetime(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

export function passwordResetMail(input: { to: string; resetUrl: string; lifetimeMs: number }): OutboundMail {
  const lifetime = describeLifetime(input.lifetimeMs);
  return {
    to: input.to,
    subject: 'Reset your Adelaide Sphere admin password',
    ...renderEmail({
      preheader: `Choose a new password. The link works once and expires in ${lifetime}.`,
      heading: 'Reset your password',
      paragraphs: ['Someone asked to reset the password for your Adelaide Sphere administrator account. If it was you, choose a new password below.'],
      action: { label: 'Choose a new password', url: input.resetUrl, note: `This link works once and expires in ${lifetime}. Choosing a new password signs you out everywhere.` },
      closing: ['If you did not ask for this, you can ignore this email. Your password has not changed.'],
      footer: 'You received this because a password reset was requested for your administrator account.',
    }),
  };
}

export function accountSetupMail(input: { to: string; setupUrl: string; lifetimeMs: number; invitedBy?: string }): OutboundMail {
  const lifetime = describeLifetime(input.lifetimeMs);
  return {
    to: input.to,
    subject: 'Your Adelaide Sphere administrator account',
    ...renderEmail({
      preheader: `Set your password to activate your account. The link expires in ${lifetime}.`,
      heading: 'Activate your administrator account',
      paragraphs: [
        input.invitedBy
          ? `${input.invitedBy} created an Adelaide Sphere administrator account for you.`
          : 'An Adelaide Sphere administrator account has been created for you.',
        'Choose your password to activate it. Nobody else sees or sets it.',
      ],
      action: { label: 'Set your password', url: input.setupUrl, note: `This link works once and expires in ${lifetime}.` },
      closing: ['If you were not expecting this, you can ignore this email and the account will stay inactive.'],
      footer: 'You received this because an administrator invited you to Adelaide Sphere.',
    }),
  };
}
