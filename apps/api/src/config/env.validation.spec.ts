import { MAIL_TRANSPORTS, PRODUCTION_MAIL_TRANSPORTS } from '@adelaide-sphere/mail';
import { validateEnv } from './env.validation.js';

const DB = 'mysql://app:secret@127.0.0.1:3307/adelaide_sphere_dev';
/** Production requires verified TLS, so production cases use a URL that has it. */
const DB_TLS = `${DB}?sslmode=verify-identity`;
const REDIS = 'redis://:pw@127.0.0.1:6380/0';
const SECRET = 'a-test-secret-that-is-at-least-32-characters-long';
/** Required settings beyond the one under test. */
const KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const BASE = { DATABASE_URL: DB, REDIS_URL: REDIS, APP_SECRET_KEY: SECRET, FIELD_ENCRYPTION_KEY: KEY };
/** A production-shaped SMTP relay (placeholders, not credentials). */
const SMTP_PROD = { MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.relay.example', SMTP_PORT: '587', SMTP_USER: 'relay-user', SMTP_PASSWORD: 'relay-placeholder' };
const DEFAULTS = {
  NODE_ENV: 'development',
  PORT: 4001,
  DATABASE_URL: DB,
  DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL: false,
  DATABASE_CONNECTION_LIMIT: 20,
  TRUST_PROXY: 0,
  REDIS_URL: REDIS,
  APP_SECRET_KEY: SECRET,
  TRUSTED_ORIGINS: ['http://127.0.0.1:4002', 'http://localhost:4002', 'http://127.0.0.1:4000', 'http://localhost:4000'],
  SESSION_COOKIE_SECURE: true,
  SESSION_IDLE_MINUTES: 30,
  SESSION_ABSOLUTE_HOURS: 12,
  ARGON2_MEMORY_KIB: 19456,
  ARGON2_TIME_COST: 2,
  ARGON2_PARALLELISM: 1,
  PUBLIC_ADMIN_URL: 'http://127.0.0.1:4002/admin',
  PUBLIC_SITE_URL: undefined,
  TURNSTILE_SECRET_KEY: undefined,
  SUBMISSION_TERMS_VERSION: '2026-09-01',
  SITE_ENQUIRY_RECIPIENT: undefined,
  MEDIA_S3_ENDPOINT: undefined,
  MEDIA_S3_REGION: 'us-east-1',
  MEDIA_S3_ACCESS_KEY_ID: undefined,
  MEDIA_S3_SECRET_ACCESS_KEY: undefined,
  MEDIA_QUARANTINE_BUCKET: 'adelaide-sphere-quarantine',
  MEDIA_PUBLIC_BUCKET: 'adelaide-sphere-media',
  MEDIA_PUBLIC_BASE_URL: undefined,
  MAIL_FROM_ADDRESS: undefined,
  SMTP_HOST: undefined,
  SMTP_PORT: undefined,
  SMTP_SECURE: undefined,
  SMTP_USER: undefined,
  SMTP_PASSWORD: undefined,
  MAIL_TRANSPORT: 'none',
  OPENAPI_ENABLED: false,
  FIELD_ENCRYPTION_KEY: KEY,
};

/** Pure-function tests: nothing here touches process.env or any .env file. */
describe('validateEnv', () => {
  it('applies defaults when nothing is set', () => {
    expect(validateEnv({ ...BASE })).toEqual(DEFAULTS);
  });

  it('treats blank values as unset', () => {
    expect(validateEnv({ ...BASE, PORT: '', NODE_ENV: '' })).toEqual(DEFAULTS);
  });

  it('parses a valid PORT string and NODE_ENV', () => {
    expect(
      validateEnv({ ...BASE, DATABASE_URL: DB_TLS, NODE_ENV: 'production', PORT: '8080', TRUSTED_ORIGINS: 'https://example.com', PUBLIC_ADMIN_URL: 'https://example.com/admin', PUBLIC_SITE_URL: 'https://example.com', TURNSTILE_SECRET_KEY: 'a'.repeat(20), MAIL_FROM_ADDRESS: 'no-reply@example.com', MEDIA_S3_ACCESS_KEY_ID: 'key', MEDIA_S3_SECRET_ACCESS_KEY: 'secret', MEDIA_PUBLIC_BASE_URL: 'https://cdn.example.com', METRICS_TOKEN: 'm'.repeat(32), TRUST_PROXY: '1', ...SMTP_PROD }),
    ).toEqual({ ...DEFAULTS, DATABASE_URL: DB_TLS, NODE_ENV: 'production', PORT: 8080, TRUSTED_ORIGINS: ['https://example.com'], PUBLIC_ADMIN_URL: 'https://example.com/admin', PUBLIC_SITE_URL: 'https://example.com', TURNSTILE_SECRET_KEY: 'a'.repeat(20), MAIL_FROM_ADDRESS: 'no-reply@example.com', MEDIA_S3_ACCESS_KEY_ID: 'key', MEDIA_S3_SECRET_ACCESS_KEY: 'secret', MEDIA_PUBLIC_BASE_URL: 'https://cdn.example.com', METRICS_TOKEN: 'm'.repeat(32), TRUST_PROXY: 1, ...SMTP_PROD });
  });

  it('ignores unrelated variables', () => {
    expect(validateEnv({ ...BASE, PATH: '/usr/bin', SECRET_TOKEN: 'hunter2' })).toEqual(DEFAULTS);
  });

  it.each([
    ['0', 'must not be less than 1'],
    ['65536', 'must not be greater than 65535'],
    ['-1', 'integer'],
    ['3001.5', 'integer'],
    ['abc', 'integer'],
    [' 3001', 'integer'],
  ])('rejects PORT=%s', (port, expected) => {
    expect(() => validateEnv({ ...BASE, PORT: port })).toThrow(/PORT/);
    expect(() => validateEnv({ ...BASE, PORT: port })).toThrow(new RegExp(expected));
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ ...BASE, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('never echoes values into the error message', () => {
    const secretLike = 'sk_live_ABCDEF';
    let message = '';
    try {
      validateEnv({ ...BASE, NODE_ENV: secretLike, PORT: 'p@ss' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('NODE_ENV');
    expect(message).toContain('PORT');
    expect(message).not.toContain(secretLike);
    expect(message).not.toContain('p@ss');
  });

  describe('DATABASE_URL', () => {
    it('is required', () => {
      expect(() => validateEnv({ REDIS_URL: REDIS, APP_SECRET_KEY: SECRET, FIELD_ENCRYPTION_KEY: KEY })).toThrow(/DATABASE_URL is required/);
    });

    it.each([
      ['postgresql://a:b@h:5432/db', 'mysql:// scheme'],
      ['mysql://a:b@h', 'database name'],
      ['mysql://a:b@h:0/db', 'port'],
      ['not a url', 'valid URL'],
    ])('rejects %s with a structural message', (url, fragment) => {
      expect(() => validateEnv({ ...BASE, DATABASE_URL: url })).toThrow(/DATABASE_URL/);
      expect(() => validateEnv({ ...BASE, DATABASE_URL: url })).toThrow(new RegExp(fragment));
    });

    it('never echoes the URL, host or password into the error', () => {
      let message = '';
      try {
        validateEnv({ ...BASE, DATABASE_URL: 'mysql://dbuser:TopSecretPw@db.internal.example:3306/prod/extra' });
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toContain('DATABASE_URL');
      expect(message).not.toContain('TopSecretPw');
      expect(message).not.toContain('db.internal.example');
      expect(message).not.toContain('dbuser');
    });
  });

  describe('DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL', () => {
    it.each([['true', true], ['1', true], ['FALSE', false], ['0', false]])('parses %s', (raw, expected) => {
      expect(validateEnv({ ...BASE, DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL: raw }).DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL).toBe(expected);
    });

    it('rejects other values', () => {
      expect(() => validateEnv({ ...BASE, DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL: 'yes' })).toThrow(
        /DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL must be true or false/,
      );
    });
  });

  describe('TRUST_PROXY', () => {
    it('defaults to 0 and accepts small integers', () => {
      expect(validateEnv({ ...BASE }).TRUST_PROXY).toBe(0);
      expect(validateEnv({ ...BASE, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    });

    it.each(['true', '-1', '11', '1.5'])('rejects %s', (v) => {
      expect(() => validateEnv({ ...BASE, TRUST_PROXY: v })).toThrow(/TRUST_PROXY/);
    });
  });

  describe('Phase 9 settings', () => {
    it('requires REDIS_URL and APP_SECRET_KEY with safe messages', () => {
      expect(() => validateEnv({ DATABASE_URL: DB, APP_SECRET_KEY: SECRET, FIELD_ENCRYPTION_KEY: KEY })).toThrow(/REDIS_URL is required/);
      expect(() => validateEnv({ DATABASE_URL: DB, REDIS_URL: REDIS, FIELD_ENCRYPTION_KEY: KEY })).toThrow(/APP_SECRET_KEY is required/);
      let message = '';
      try {
        validateEnv({ DATABASE_URL: DB, REDIS_URL: 'redis://:LeakedPw@host:1/0', APP_SECRET_KEY: 'short-secret-value', FIELD_ENCRYPTION_KEY: KEY });
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toMatch(/APP_SECRET_KEY must be at least 32/);
      expect(message).not.toContain('short-secret-value');
      expect(message).not.toContain('LeakedPw');
    });

    it('rejects non-redis URLs', () => {
      expect(() => validateEnv({ ...BASE, REDIS_URL: 'http://x' })).toThrow(/REDIS_URL must be a redis/);
    });

    it('parses TRUSTED_ORIGINS and strips trailing slashes', () => {
      expect(validateEnv({ ...BASE, TRUSTED_ORIGINS: ' https://a.example/ , http://b.example:3002 ' }).TRUSTED_ORIGINS).toEqual(['https://a.example', 'http://b.example:3002']);
      expect(() => validateEnv({ ...BASE, TRUSTED_ORIGINS: 'not-an-origin' })).toThrow(/TRUSTED_ORIGINS/);
    });

    it('enforces OWASP minimum Argon2 parameters', () => {
      expect(() => validateEnv({ ...BASE, ARGON2_MEMORY_KIB: '4096' })).toThrow(/ARGON2_MEMORY_KIB/);
      expect(() => validateEnv({ ...BASE, ARGON2_TIME_COST: '1' })).toThrow(/ARGON2_TIME_COST/);
    });

    it('refuses insecure production settings', () => {
      const prod = { ...BASE, DATABASE_URL: DB_TLS, NODE_ENV: 'production', TRUSTED_ORIGINS: 'https://example.com', PUBLIC_ADMIN_URL: 'https://example.com/admin', METRICS_TOKEN: 'm'.repeat(32), TRUST_PROXY: '1' };
      expect(() => validateEnv({ ...prod, SESSION_COOKIE_SECURE: 'false' })).toThrow(/SESSION_COOKIE_SECURE: must be true/);
      expect(() => validateEnv({ ...prod, MAIL_TRANSPORT: 'console' })).toThrow(/MAIL_TRANSPORT: console/);
      expect(() => validateEnv({ ...prod, DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL: 'true' })).toThrow(/DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL/);
      expect(() => validateEnv({ ...prod, TRUSTED_ORIGINS: 'http://example.com' })).toThrow(/https origins/);
    });

    /**
     * Without verified TLS the MySQL handshake can be downgraded on the path and
     * the account password read in clear — the precondition for the mariadb and
     * mysql2 advisories. Production must refuse to start, not warn.
     */
    it('refuses a production database connection without verified TLS', () => {
      const prod = { ...BASE, NODE_ENV: 'production', TRUSTED_ORIGINS: 'https://example.com', PUBLIC_ADMIN_URL: 'https://example.com/admin', METRICS_TOKEN: 'm'.repeat(32), TRUST_PROXY: '1' };
      for (const url of [
        'mysql://app:secret@db.internal:3306/melbourne_sphere',
        'mysql://app:secret@db.internal:3306/adelaide_sphere?sslmode=disabled',
        'mysql://app:secret@db.internal:3306/adelaide_sphere?sslmode=required',
      ]) {
        let message = '';
        try {
          validateEnv({ ...prod, DATABASE_URL: url });
        } catch (error) {
          message = (error as Error).message;
        }
        expect(message, url).toMatch(/DATABASE_URL: must use verified TLS in production/);
        // The failure never echoes the connection string or its password.
        expect(message).not.toContain('secret');
      }

      for (const url of [
        'mysql://app:secret@db.internal:3306/adelaide_sphere?sslmode=verify-ca&sslca=%2Fetc%2Fssl%2Fca.pem',
        'mysql://app:secret@db.internal:3306/adelaide_sphere?sslmode=verify-identity',
      ]) {
        expect(() =>
          validateEnv({
            ...prod,
            DATABASE_URL: url,
            PUBLIC_SITE_URL: 'https://example.com',
            TURNSTILE_SECRET_KEY: 'a'.repeat(20),
            MAIL_FROM_ADDRESS: 'no-reply@example.com',
            ...SMTP_PROD,
            MEDIA_S3_ACCESS_KEY_ID: 'key',
            MEDIA_S3_SECRET_ACCESS_KEY: 'secret-value',
            MEDIA_PUBLIC_BASE_URL: 'https://cdn.example.com',
          }),
        ).not.toThrow();
      }
    });

    it('keeps public-key retrieval a development-only setting', () => {
      // It exists because the MySQL 8 handshake needs an RSA exchange without
      // TLS; allowing it in production would be exactly the unprotected path.
      expect(validateEnv({ ...BASE, DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL: 'true' }).DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL).toBe(true);
      const prod = { ...BASE, DATABASE_URL: DB_TLS, NODE_ENV: 'production', TRUSTED_ORIGINS: 'https://example.com', PUBLIC_ADMIN_URL: 'https://example.com/admin', METRICS_TOKEN: 'm'.repeat(32), TRUST_PROXY: '1' };
      expect(() => validateEnv({ ...prod, DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL: 'true' })).toThrow(/must be false in production/);
    });
  });

  describe('FIELD_ENCRYPTION_KEY', () => {
    it('requires base64 of exactly 32 bytes and never echoes the value', () => {
      let message = '';
      try {
        validateEnv({ ...BASE, FIELD_ENCRYPTION_KEY: 'c2hvcnQ=' });
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toMatch(/FIELD_ENCRYPTION_KEY must be base64 of exactly 32 bytes/);
      expect(message).not.toContain('c2hvcnQ=');
      expect(() => validateEnv({ ...BASE, FIELD_ENCRYPTION_KEY: '' })).toThrow(/FIELD_ENCRYPTION_KEY is required/);
    });
  });
});

describe('public submission configuration (SRS SEC 002/003)', () => {
  const PROD = {
    // Production also requires a metrics token and at least one trusted proxy hop.
    METRICS_TOKEN: 'm'.repeat(32),
    TRUST_PROXY: '1',
    ...BASE,
    // Production also requires verified TLS to the database; that rule has its
    // own test, so this block supplies a compliant URL and checks the rest.
    DATABASE_URL: DB_TLS,
    NODE_ENV: 'production',
    SESSION_COOKIE_SECURE: 'true',
    TRUSTED_ORIGINS: 'https://admin.example',
    PUBLIC_ADMIN_URL: 'https://admin.example/admin',
  };

  it('requires Turnstile and the public site URL in production', () => {
    expect(() => validateEnv({ ...PROD })).toThrow(/TURNSTILE_SECRET_KEY/);
    expect(() => validateEnv({ ...PROD, TURNSTILE_SECRET_KEY: 'a'.repeat(20) })).toThrow(/PUBLIC_SITE_URL/);
    expect(() => validateEnv({ ...PROD, TURNSTILE_SECRET_KEY: 'a'.repeat(20), PUBLIC_SITE_URL: 'https://adelaidesphere.example/' })).toThrow(/MAIL_FROM_ADDRESS/);
    expect(() => validateEnv({ ...PROD, TURNSTILE_SECRET_KEY: 'a'.repeat(20), PUBLIC_SITE_URL: 'https://adelaidesphere.example/', MAIL_FROM_ADDRESS: 'no-reply@example.com' })).toThrow(/MEDIA_S3_ACCESS_KEY_ID/);
    expect(validateEnv({ ...PROD, TURNSTILE_SECRET_KEY: 'a'.repeat(20), PUBLIC_SITE_URL: 'https://adelaidesphere.example/', MAIL_FROM_ADDRESS: 'no-reply@adelaidesphere.example', MEDIA_S3_ACCESS_KEY_ID: 'key', MEDIA_S3_SECRET_ACCESS_KEY: 'secret', MEDIA_PUBLIC_BASE_URL: 'https://cdn.adelaidesphere.example', ...SMTP_PROD }).PUBLIC_SITE_URL).toBe('https://adelaidesphere.example');
  });

  describe('transactional mail (SRS ENQ 005, decision D03)', () => {
    const COMPLETE = { ...PROD, TURNSTILE_SECRET_KEY: 'a'.repeat(20), PUBLIC_SITE_URL: 'https://adelaidesphere.example', MAIL_FROM_ADDRESS: 'no-reply@adelaidesphere.example', MEDIA_S3_ACCESS_KEY_ID: 'key', MEDIA_S3_SECRET_ACCESS_KEY: 'secret', MEDIA_PUBLIC_BASE_URL: 'https://cdn.adelaidesphere.example' };

    it('requires a real transport in production', () => {
      expect(() => validateEnv({ ...COMPLETE })).toThrow(/MAIL_TRANSPORT: must be smtp or resend in production/);
      expect(() => validateEnv({ ...COMPLETE, MAIL_TRANSPORT: 'console' })).toThrow(/MAIL_TRANSPORT: console/);
    });

    it('refuses resend without the API key, a verified sender or the webhook secret (MAIL 002)', () => {
      const RESEND = { ...COMPLETE, MAIL_TRANSPORT: 'resend', MAIL_FROM_ADDRESS: 'no-reply@mail.adelaidesphere.com', RESEND_API_KEY: 're_live_key', RESEND_WEBHOOK_SECRET: 'whsec_c2VjcmV0' };
      expect(() => validateEnv({ ...RESEND })).not.toThrow();
      expect(() => validateEnv({ ...RESEND, RESEND_API_KEY: undefined })).toThrow(/RESEND_API_KEY/);
      expect(() => validateEnv({ ...RESEND, RESEND_WEBHOOK_SECRET: undefined })).toThrow(/RESEND_WEBHOOK_SECRET/);
      expect(() => validateEnv({ ...RESEND, MAIL_FROM_ADDRESS: 'no-reply@adelaidesphere.local' })).toThrow(/verified production sender/);
    });

    it('never echoes the Resend key in a failure message (SET 004)', () => {
      const message = (() => {
        try {
          validateEnv({ ...COMPLETE, MAIL_TRANSPORT: 'resend', RESEND_API_KEY: 'totally-not-a-resend-key', RESEND_WEBHOOK_SECRET: 'whsec_c2VjcmV0' });
          return '';
        } catch (error) {
          return (error as Error).message;
        }
      })();
      expect(message).toMatch(/RESEND_API_KEY/);
      expect(message).not.toContain('totally-not-a-resend-key');
    });

    it('refuses smtp without a relay, without credentials in production, and never echoes values', () => {
      expect(() => validateEnv({ ...COMPLETE, MAIL_TRANSPORT: 'smtp' })).toThrow(/SMTP_HOST: required/);
      const message = (() => {
        try {
          validateEnv({ ...COMPLETE, MAIL_TRANSPORT: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025', SMTP_PASSWORD: 'leaky-secret' });
          return '';
        } catch (error) {
          return (error as Error).message;
        }
      })();
      expect(message).toMatch(/SMTP_USER \/ SMTP_PASSWORD/);
      expect(message).toMatch(/loopback host/);
      expect(message).not.toContain('leaky-secret');
    });

    it('accepts a plaintext loopback catcher outside production but still needs a sender', () => {
      expect(() => validateEnv({ ...BASE, MAIL_TRANSPORT: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025' })).toThrow(/MAIL_FROM_ADDRESS: required when MAIL_TRANSPORT=smtp/);
      expect(validateEnv({ ...BASE, MAIL_TRANSPORT: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025', MAIL_FROM_ADDRESS: 'no-reply@adelaidesphere.example' })).toMatchObject({ MAIL_TRANSPORT: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025' });
      expect(() => validateEnv({ ...BASE, MAIL_TRANSPORT: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: 'abc', MAIL_FROM_ADDRESS: 'no-reply@adelaidesphere.example' })).toThrow(/SMTP_PORT/);
    });
  });

  it('accepts a missing Turnstile secret outside production and rejects short ones', () => {
    expect(validateEnv({ ...BASE }).TURNSTILE_SECRET_KEY).toBeUndefined();
    expect(() => validateEnv({ ...BASE, TURNSTILE_SECRET_KEY: 'short' })).toThrow(/TURNSTILE_SECRET_KEY/);
    expect(validateEnv({ ...BASE, SUBMISSION_TERMS_VERSION: '2027-01-01' }).SUBMISSION_TERMS_VERSION).toBe('2027-01-01');
  });
});

describe('DATABASE_CONNECTION_LIMIT (SRS OPS 003 pool budgets)', () => {
  it('parses a numeric value and rejects values outside the allowed range', () => {
    expect(validateEnv({ ...BASE, DATABASE_CONNECTION_LIMIT: '40' }).DATABASE_CONNECTION_LIMIT).toBe(40);
    expect(() => validateEnv({ ...BASE, DATABASE_CONNECTION_LIMIT: '0' })).toThrow(/DATABASE_CONNECTION_LIMIT/);
    expect(() => validateEnv({ ...BASE, DATABASE_CONNECTION_LIMIT: '500' })).toThrow(/DATABASE_CONNECTION_LIMIT/);
    expect(() => validateEnv({ ...BASE, DATABASE_CONNECTION_LIMIT: 'many' })).toThrow(/DATABASE_CONNECTION_LIMIT/);
  });
});

/**
 * The API and the worker must accept exactly the same transports, and both must
 * take the list from `@adelaide-sphere/mail` rather than repeating it. They
 * drifted once and the worker could not start under the provider the client
 * chose (audit F-02); the worker asserts the same thing in `config.spec.ts`.
 */
describe('mail transport agreement with the worker', () => {
  it('accepts every declared transport and nothing else', () => {
    for (const transport of MAIL_TRANSPORTS) {
      const extra =
        transport === 'smtp'
          ? { SMTP_HOST: 'smtp.relay.example', SMTP_PORT: '587', MAIL_FROM_ADDRESS: 'no-reply@example.com' }
          : transport === 'resend'
            ? { RESEND_API_KEY: 're_placeholder_key_value', MAIL_FROM_ADDRESS: 'no-reply@example.com' }
            : {};
      expect(validateEnv({ ...BASE, MAIL_TRANSPORT: transport, ...extra }).MAIL_TRANSPORT, transport).toBe(transport);
    }
    expect(() => validateEnv({ ...BASE, MAIL_TRANSPORT: 'sendgrid' })).toThrow(/MAIL_TRANSPORT/);
  });

  it('refuses production on a transport that cannot deliver', () => {
    for (const transport of MAIL_TRANSPORTS.filter((value) => !PRODUCTION_MAIL_TRANSPORTS.includes(value))) {
      expect(() => validateEnv({ ...BASE, DATABASE_URL: DB_TLS, NODE_ENV: 'production', MAIL_TRANSPORT: transport }), transport).toThrow(/MAIL_TRANSPORT/);
    }
  });
});

