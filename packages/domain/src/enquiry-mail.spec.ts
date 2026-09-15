import { buildEnquiryMail, safeReplyTo, sanitiseHeaderValue } from './enquiry-mail.js';

describe('enquiry mail composition (SRS ENQ 005)', () => {
  const base = {
    businessName: 'Carlton Corner Bakery',
    visitorName: 'Jo Visitor',
    visitorEmail: 'jo@example.com',
    visitorPhone: '03 9000 1234',
    subject: 'Catering for 20 people',
    message: 'Do you cater for office breakfasts?\nWe need about 20 serves.',
    receiptId: 'abc123',
    submittedAt: new Date('2026-09-06T02:30:00Z'),
  };

  it('strips CR/LF and control characters from header values', () => {
    expect(sanitiseHeaderValue('Subject\r\nBcc: attacker@example.com')).toBe('Subject Bcc: attacker@example.com');
    expect(sanitiseHeaderValue('bell\u0007char')).toBe('bellchar');
    expect(sanitiseHeaderValue('  padded   name  ')).toBe('padded name');
    expect(sanitiseHeaderValue('x'.repeat(300))).toHaveLength(200);
  });

  it('only uses a syntactically valid single address as Reply-To', () => {
    expect(safeReplyTo('jo@example.com')).toBe('jo@example.com');
    expect(safeReplyTo('jo@example.com, attacker@example.com')).toBeNull();
    expect(safeReplyTo('jo@example.com\nBcc: x@example.com')).toBeNull();
    expect(safeReplyTo('not-an-email')).toBeNull();
  });

  it('builds a plain-text body with a delimited message and a safe subject', () => {
    const mail = buildEnquiryMail(base);
    expect(mail.subject).toBe('Enquiry: Catering for 20 people');
    expect(mail.replyTo).toBe('jo@example.com');
    expect(mail.text).toContain('Carlton Corner Bakery');
    expect(mail.text).toContain('--- message ---');
    expect(mail.text).toContain('Do you cater for office breakfasts?');
    expect(mail.text).toContain('Reference: abc123');
    const injected = buildEnquiryMail({ ...base, subject: 'Hi\r\nBcc: attacker@example.com', visitorEmail: 'jo@example.com, evil@example.com' });
    expect(injected.subject).toBe('Enquiry: Hi Bcc: attacker@example.com');
    expect(injected.subject).not.toContain('\n');
    expect(injected.replyTo).toBe('');
  });

  it('describes a general site enquiry when there is no business', () => {
    expect(buildEnquiryMail({ ...base, businessName: null, visitorPhone: null }).text).toContain('general enquiry');
  });
});
