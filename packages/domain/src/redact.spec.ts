import { describe, expect, it } from 'vitest';
import { redactFailureSummary } from './redact.js';

describe('redactFailureSummary', () => {
  it('removes the recipient address from a bounce', () => {
    const result = redactFailureSummary('550 5.1.1 <sam.reader@example.com> recipient rejected');
    expect(result).not.toContain('sam.reader@example.com');
    expect(result).toContain('550');
  });

  it('removes an SMTP host and port', () => {
    expect(redactFailureSummary('connect ECONNREFUSED 127.0.0.1:1025')).toBe('connect ECONNREFUSED [host]');
  });

  it('removes credentials embedded in a connection string', () => {
    const result = redactFailureSummary('Authentication failed for smtp://mailer:s3cr3t-password@smtp.example.com:587');
    expect(result).not.toContain('s3cr3t-password');
    expect(result).not.toContain('mailer:');
  });

  it('removes a signed URL', () => {
    const result = redactFailureSummary('PUT https://bucket.example.com/media/x.webp?X-Amz-Signature=abc failed');
    expect(result).not.toContain('X-Amz-Signature');
    expect(result).toContain('[url]');
  });

  it('removes a path on the server', () => {
    const result = redactFailureSummary('ENOENT: no such file or directory, open /Users/someone/app/secrets/key.pem');
    expect(result).not.toContain('secrets');
    expect(result).toContain('[path]');
  });

  it('keeps only the first line, so a stack trace cannot follow', () => {
    expect(redactFailureSummary('Boom\n    at Object.<anonymous> (/app/src/x.ts:1:1)')).toBe('Boom');
  });

  it('says something useful when there is no message at all', () => {
    expect(redactFailureSummary(null)).toMatch(/without a reported reason/);
    expect(redactFailureSummary('')).toMatch(/without a reported reason/);
  });

  it('caps the length', () => {
    expect(redactFailureSummary('x'.repeat(500)).length).toBeLessThanOrEqual(300);
  });
});
