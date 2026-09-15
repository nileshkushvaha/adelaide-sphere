import { smtpConfigFromEnv } from './config.js';

describe('smtpConfigFromEnv (SRS ENQ 005, SEC 004)', () => {
  it('accepts a plaintext loopback catcher outside production', () => {
    const result = smtpConfigFromEnv({ SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025' }, { production: false });
    expect(result.problems).toEqual([]);
    expect(result.config).toEqual({ host: '127.0.0.1', port: 1025, secure: false, requireTls: false, auth: null });
  });

  it('defaults the port to 587 and parses SMTP_SECURE', () => {
    expect(smtpConfigFromEnv({ SMTP_HOST: 'smtp.example.net' }, { production: false }).config).toMatchObject({ port: 587, secure: false });
    expect(smtpConfigFromEnv({ SMTP_HOST: 'smtp.example.net', SMTP_PORT: '465', SMTP_SECURE: 'true' }, { production: false }).config).toMatchObject({ port: 465, secure: true, requireTls: false });
  });

  it('requires authentication, a non-loopback relay and STARTTLS in production', () => {
    const missing = smtpConfigFromEnv({ SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025' }, { production: true });
    expect(missing.config).toBeNull();
    expect(missing.problems.join('\n')).toMatch(/SMTP_USER \/ SMTP_PASSWORD: required in production/);
    expect(missing.problems.join('\n')).toMatch(/loopback host is not a production mail relay/);

    const ok = smtpConfigFromEnv({ SMTP_HOST: 'email-smtp.ap-southeast-2.example.net', SMTP_PORT: '587', SMTP_USER: 'AKIA-placeholder', SMTP_PASSWORD: 'placeholder' }, { production: true });
    expect(ok.problems).toEqual([]);
    expect(ok.config).toMatchObject({ requireTls: true, secure: false, auth: { user: 'AKIA-placeholder', pass: 'placeholder' } });
  });

  it('lists every problem at once and names variables, never values', () => {
    const result = smtpConfigFromEnv({ SMTP_HOST: 'smtp://bad host', SMTP_PORT: 'abc', SMTP_SECURE: 'maybe', SMTP_USER: 'only-user', SMTP_PASSWORD: '' }, { production: false });
    expect(result.config).toBeNull();
    expect(result.problems).toHaveLength(4);
    expect(result.problems.join('\n')).not.toContain('only-user');
  });
});
