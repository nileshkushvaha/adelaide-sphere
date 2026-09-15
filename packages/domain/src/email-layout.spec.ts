import { describe, expect, it } from 'vitest';
import { buildEnquiryMail } from './enquiry-mail.js';
import { escapeHtml, renderEmail, type EmailContent } from './email-layout.js';

const content: EmailContent = {
  preheader: 'Choose a new password.',
  heading: 'Reset your password',
  paragraphs: ['Someone asked to reset your password.'],
  action: { label: 'Choose a new password', url: 'https://admin.example.com/reset-password?token=abc&x=1', note: 'Expires in 30 minutes.' },
  details: [{ label: 'Reference', value: 'abc123' }],
  closing: ['If this was not you, ignore this email.'],
  footer: 'You received this because a reset was requested.',
};

describe('email layout', () => {
  it('renders the same content in both parts', () => {
    const { html, text } = renderEmail(content);
    for (const part of [content.heading, content.paragraphs[0]!, 'Choose a new password', 'Expires in 30 minutes.', 'abc123', content.footer]) {
      expect(text, part).toContain(part);
      expect(html, part).toContain(escapeHtml(part));
    }
    expect(text).toContain('https://admin.example.com/reset-password?token=abc&x=1');
    // The link appears as a button and as a copy-and-paste fallback, escaped.
    expect(html.match(/href="https:\/\/admin\.example\.com\/reset-password\?token=abc&amp;x=1"/g)).toHaveLength(2);
  });

  it('is an email document: language, a hidden preview line, and a solid colour under every gradient', () => {
    const { html } = renderEmail(content);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<html lang="en"');
    // The preview line sits in a block that is never displayed.
    expect(html).toMatch(/<div style="display:none;[^"]*">Choose a new password\./);
    for (const gradient of html.match(/style="[^"]*linear-gradient[^"]*"/g) ?? []) expect(gradient, gradient).toMatch(/background-color:#/);
    expect(html).toContain('role="presentation"');
    // Dark mode recolours text links, never the button's white label.
    expect(html).toContain('a.ms-button { color: #FFFFFF !important; }');
    expect(html).toContain('class="ms-button"');
  });

  it('escapes every value, so nobody can put markup into a message', () => {
    const { html } = renderEmail({ ...content, heading: '<script>alert(1)</script>', paragraphs: ['"quoted" & <b>bold</b>'] });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot;quoted&quot; &amp; &lt;b&gt;bold&lt;/b&gt;');
  });

  it('refuses a link that is not http(s)', () => {
    expect(() => renderEmail({ ...content, action: { label: 'Go', url: 'javascript:alert(1)' } })).toThrow(/http/);
    expect(() => renderEmail({ ...content, action: { label: 'Go', url: '/relative' } })).toThrow(/absolute/);
  });
});

describe('enquiry email', () => {
  const base = {
    businessName: 'Carlton <Corner> Bakery',
    visitorName: 'Jo <img src=x onerror=alert(1)>',
    visitorEmail: 'jo@example.com',
    visitorPhone: null,
    subject: 'Catering',
    message: 'Line one\n<a href="https://evil.example">click</a>\nLine three',
    receiptId: 'abc123',
    submittedAt: new Date('2026-09-10T00:00:00.000Z'),
  };

  it('escapes the visitor’s words in the HTML part and keeps their line breaks', () => {
    const { html } = buildEnquiryMail(base);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;click&lt;/a&gt;');
    expect(html).toContain('Line one<br>');
    expect(html).toContain('Carlton &lt;Corner&gt; Bakery');
  });

  it('still sets the message apart in the plain-text part', () => {
    const { text } = buildEnquiryMail(base);
    expect(text).toContain('--- message ---');
    expect(text).toContain('--- end of message ---');
  });
});
