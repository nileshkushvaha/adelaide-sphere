import { MAIL_TRANSPORTS, PRODUCTION_MAIL_TRANSPORTS } from '@adelaide-sphere/mail';
import { loadWorkerConfig } from './config.js';

const BASE = {
  DATABASE_URL: 'mysql://app:secret@127.0.0.1:3307/adelaide_sphere_dev',
  REDIS_URL: 'redis://:pw@127.0.0.1:6380/0',
  FIELD_ENCRYPTION_KEY: 'a'.repeat(44),
  MAIL_TRANSPORT: 'console',
  MEDIA_S3_ACCESS_KEY_ID: 'key',
  MEDIA_S3_SECRET_ACCESS_KEY: 'secret',
};

describe('worker configuration', () => {
  it('accepts a development configuration and applies defaults', () => {
    const config = loadWorkerConfig({ ...BASE } as NodeJS.ProcessEnv);
    expect(config).toMatchObject({ nodeEnv: 'development', mailTransport: 'console', concurrency: 2 });
  });

  it('requires media credentials because the worker publishes variants', () => {
    expect(() => loadWorkerConfig({ ...BASE, MEDIA_S3_ACCESS_KEY_ID: '' } as NodeJS.ProcessEnv)).toThrow(/MEDIA_S3_ACCESS_KEY_ID/);
    expect(loadWorkerConfig({ ...BASE, MEDIA_S3_ENDPOINT: 'http://127.0.0.1:9000' } as NodeJS.ProcessEnv).media).toMatchObject({ endpoint: 'http://127.0.0.1:9000', quarantineBucket: 'adelaide-sphere-quarantine' });
  });

  it('lists every missing requirement at once', () => {
    expect(() => loadWorkerConfig({} as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL[\s\S]*REDIS_URL[\s\S]*FIELD_ENCRYPTION_KEY/);
    expect(() => loadWorkerConfig({ ...BASE, WORKER_CONCURRENCY: '0' } as NodeJS.ProcessEnv)).toThrow(/WORKER_CONCURRENCY/);
  });

  it('refuses to run in production without the smtp transport and a sender', () => {
    expect(() => loadWorkerConfig({ ...BASE, NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/console transport cannot be used in production/);
    expect(() => loadWorkerConfig({ ...BASE, NODE_ENV: 'production', MAIL_TRANSPORT: 'none' } as NodeJS.ProcessEnv)).toThrow(/MAIL_FROM_ADDRESS/);
    expect(() => loadWorkerConfig({ ...BASE, NODE_ENV: 'production', MAIL_TRANSPORT: 'none', MAIL_FROM_ADDRESS: 'no-reply@example.com' } as NodeJS.ProcessEnv)).toThrow(/must be smtp or resend in production/);
  });

  /**
   * The API and the worker must accept the same transports: the API accepted
   * `resend` while the worker refused it, so under the provider the client
   * chose the worker could not start and no accepted enquiry would have been
   * delivered (audit F-02, SRS ENQ 003/005, MAIL 002).
   */
  it('accepts the Resend transport the API accepts, and validates its credentials', () => {
    const resendEnv = { ...BASE, MAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_test_key_1234567890', MAIL_FROM_ADDRESS: 'no-reply@mail.example.com' };
    const config = loadWorkerConfig(resendEnv as NodeJS.ProcessEnv);
    expect(config.mailTransport).toBe('resend');
    expect(config.resend).toMatchObject({ fromAddress: 'no-reply@mail.example.com' });
    expect(config.smtp).toBeNull();

    // A production deployment on Resend is a valid configuration.
    const production = loadWorkerConfig({
      ...resendEnv,
      NODE_ENV: 'production',
      RESEND_WEBHOOK_SECRET: 'whsec_test_secret_value_1234567890',
      WEB_REVALIDATE_URL: 'https://web.example/api/revalidate',
      WEB_REVALIDATE_TOKEN: 't',
    } as NodeJS.ProcessEnv);
    expect(production.mailTransport).toBe('resend');

    // And a missing key is refused rather than falling back to console.
    let message = '';
    try {
      loadWorkerConfig({ ...resendEnv, RESEND_API_KEY: '' } as NodeJS.ProcessEnv);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/RESEND_API_KEY/);
    expect(message).not.toContain('re_test_key_1234567890');
  });

  it('validates the smtp relay and never echoes its credentials (SRS ENQ 005, SEC 004)', () => {
    const local = loadWorkerConfig({ ...BASE, MAIL_TRANSPORT: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025', MAIL_FROM_ADDRESS: 'no-reply@example.com' } as NodeJS.ProcessEnv);
    expect(local.smtp).toEqual({ host: '127.0.0.1', port: 1025, secure: false, requireTls: false, auth: null });
    expect(() => loadWorkerConfig({ ...BASE, MAIL_TRANSPORT: 'smtp', SMTP_HOST: '127.0.0.1' } as NodeJS.ProcessEnv)).toThrow(/MAIL_FROM_ADDRESS: required when MAIL_TRANSPORT=smtp/);

    let message = '';
    try {
      loadWorkerConfig({ ...BASE, NODE_ENV: 'production', MAIL_TRANSPORT: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PASSWORD: 'leaky-secret', MAIL_FROM_ADDRESS: 'no-reply@example.com', WEB_REVALIDATE_URL: 'https://web.example/api/revalidate', WEB_REVALIDATE_TOKEN: 't' } as NodeJS.ProcessEnv);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/SMTP_USER \/ SMTP_PASSWORD/);
    expect(message).toMatch(/loopback host/);
    expect(message).not.toContain('leaky-secret');

    const production = loadWorkerConfig({ ...BASE, NODE_ENV: 'production', MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.relay.example', SMTP_PORT: '587', SMTP_USER: 'relay-user', SMTP_PASSWORD: 'placeholder', MAIL_FROM_ADDRESS: 'no-reply@example.com', WEB_REVALIDATE_URL: 'https://web.example/api/revalidate', WEB_REVALIDATE_TOKEN: 't' } as NodeJS.ProcessEnv);
    expect(production.smtp).toMatchObject({ host: 'smtp.relay.example', port: 587, requireTls: true, auth: { user: 'relay-user' } });
  });
});

/**
 * The other half of the agreement asserted in the API's
 * `env.validation.spec.ts`: both sides take the transport list from
 * `@adelaide-sphere/mail`, so neither can accept a value the other refuses
 * (audit F-02).
 */
describe('mail transport agreement with the API', () => {
  it('accepts every declared transport and nothing else', () => {
    for (const transport of MAIL_TRANSPORTS) {
      const extra =
        transport === 'smtp'
          ? { SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025', MAIL_FROM_ADDRESS: 'no-reply@example.com' }
          : transport === 'resend'
            ? { RESEND_API_KEY: 're_placeholder_key_value', MAIL_FROM_ADDRESS: 'no-reply@example.com' }
            : {};
      expect(loadWorkerConfig({ ...BASE, MAIL_TRANSPORT: transport, ...extra } as NodeJS.ProcessEnv).mailTransport, transport).toBe(transport);
    }
    expect(() => loadWorkerConfig({ ...BASE, MAIL_TRANSPORT: 'sendgrid' } as NodeJS.ProcessEnv)).toThrow(/MAIL_TRANSPORT/);
  });

  it('refuses production on a transport that cannot deliver', () => {
    for (const transport of MAIL_TRANSPORTS.filter((value) => !PRODUCTION_MAIL_TRANSPORTS.includes(value))) {
      expect(
        () =>
          loadWorkerConfig({
            ...BASE,
            NODE_ENV: 'production',
            MAIL_TRANSPORT: transport,
            MAIL_FROM_ADDRESS: 'no-reply@example.com',
            WEB_REVALIDATE_URL: 'https://web.example/api/revalidate',
            WEB_REVALIDATE_TOKEN: 't',
          } as NodeJS.ProcessEnv),
        transport,
      ).toThrow(/MAIL_TRANSPORT/);
    }
  });
});


describe('metrics endpoint exposure', () => {
  it('keeps the metrics server on loopback unless it is deliberately widened', () => {
    expect(loadWorkerConfig({ ...BASE, WORKER_METRICS_PORT: '9464' } as NodeJS.ProcessEnv).metricsBind).toBe('127.0.0.1');
  });

  it('refuses a wider bind without a token, because that would publish the endpoint', () => {
    expect(() => loadWorkerConfig({ ...BASE, WORKER_METRICS_PORT: '9464', WORKER_METRICS_BIND: '0.0.0.0' } as NodeJS.ProcessEnv)).toThrow(/binding beyond loopback requires METRICS_TOKEN/);
  });

  it('accepts a wider bind with a token, for a scraper on an internal network', () => {
    const config = loadWorkerConfig({ ...BASE, WORKER_METRICS_PORT: '9464', WORKER_METRICS_BIND: '0.0.0.0', METRICS_TOKEN: 'x'.repeat(40) } as NodeJS.ProcessEnv);
    expect(config.metricsBind).toBe('0.0.0.0');
    expect(config.metricsPort).toBe(9464);
  });

  it('refuses a token that is too short to be worth having', () => {
    expect(() => loadWorkerConfig({ ...BASE, METRICS_TOKEN: 'short' } as NodeJS.ProcessEnv)).toThrow(/METRICS_TOKEN/);
  });
});
