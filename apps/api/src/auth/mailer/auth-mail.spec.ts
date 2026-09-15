import { describe, expect, it } from 'vitest';
import { accountSetupMail, describeLifetime, passwordResetMail } from './auth-mail.js';

describe('authentication emails', () => {
  it('states the link lifetime the link really has, not a fixed 30 minutes', () => {
    const ten = passwordResetMail({ to: 'a@example.com', resetUrl: 'https://admin.example.com/reset-password?token=t', lifetimeMs: 10 * 60_000 });
    expect(ten.text).toContain('expires in 10 minutes');
    expect(ten.html).toContain('expires in 10 minutes');
    expect(ten.text).not.toContain('30 minutes');
    expect(describeLifetime(24 * 60 * 60_000)).toBe('24 hours');
    expect(describeLifetime(60_000)).toBe('1 minute');
  });

  it('sends the reset link in both parts, with a plain-text body always present', () => {
    const mail = passwordResetMail({ to: 'a@example.com', resetUrl: 'https://admin.example.com/reset-password?token=t0k', lifetimeMs: 30 * 60_000 });
    expect(mail.subject).toBe('Reset your Adelaide Sphere admin password');
    expect(mail.text).toContain('https://admin.example.com/reset-password?token=t0k');
    expect(mail.html).toContain('https://admin.example.com/reset-password?token=t0k');
    expect(mail.text).toMatch(/did not ask for this/);
  });

  it('builds the invitation and its resend from one place, naming who invited them', () => {
    const invited = accountSetupMail({ to: 'b@example.com', setupUrl: 'https://admin.example.com/accept-setup?token=s', lifetimeMs: 24 * 60 * 60_000, invitedBy: 'Priya <Admin>' });
    expect(invited.text).toContain('Priya <Admin> created an Adelaide Sphere administrator account for you.');
    // The name an administrator chose is escaped in the HTML part.
    expect(invited.html).toContain('Priya &lt;Admin&gt;');
    expect(invited.text).toContain('expires in 24 hours');
  });
});
