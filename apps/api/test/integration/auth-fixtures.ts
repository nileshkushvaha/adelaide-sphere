import { Controller, Get, Post } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { AuditService } from '../../src/audit/audit.service.js';
import { MailerPort, type OutboundMail } from '../../src/auth/mailer/mailer.port.js';
import { PasswordService } from '../../src/auth/password.service.js';
import { RequirePermissions, SessionOnly } from '../../src/auth/decorators.js';
import { IdentityService } from '../../src/identity/identity.service.js';
import { SUPER_ADMIN_ROLE } from '../../src/identity/permissions.js';
import { RedisService } from '../../src/redis/redis.service.js';

/** Test-only admin resources exercising the guard chain (registered only by the integration suite). */
@Controller('admin/__fixture')
export class AuthFixtureController {
  @RequirePermissions('listings.read')
  @Get('protected')
  protectedRead() {
    return { data: { ok: true } };
  }

  @RequirePermissions('admins.view')
  @Post('mutate')
  mutate() {
    return { data: { mutated: true } };
  }

  @Get('undeclared')
  undeclared() {
    return { data: { leaked: true } };
  }

  @SessionOnly()
  @Get('session-only')
  sessionOnly() {
    return { data: { session: true } };
  }
}

/** Captures outbound mail so tests can read reset links without any real delivery. */
export class CapturingMailer extends MailerPort {
  readonly transportName = 'capture';
  readonly sent: OutboundMail[] = [];
  async send(mail: OutboundMail): Promise<void> {
    this.sent.push(mail);
  }
}

export const TEST_ADMIN = {
  email: 'Integration.Admin@Example.com',
  normalisedEmail: 'integration.admin@example.com',
  displayName: 'Integration Admin',
  password: 'integration-test-password-123',
};

export async function seedSuperAdmin(app: INestApplication, overrides: Partial<{ email: string; password: string; displayName: string }> = {}) {
  const identity = app.get(IdentityService);
  const passwords = app.get(PasswordService);
  await identity.seedRbac();
  const email = overrides.email ?? TEST_ADMIN.email;
  const password = overrides.password ?? TEST_ADMIN.password;
  const admin = await identity.createAdmin({ email, displayName: overrides.displayName ?? TEST_ADMIN.displayName, passwordHash: await passwords.hash(password), roleKeys: [SUPER_ADMIN_ROLE.key] });
  await app.get(AuditService).recordOrThrow({ action: 'test.seed', targetType: 'admin_user', targetId: admin.id });
  return admin;
}

/**
 * Clears throttle keys written by this test run (prefix ms:throttle:*), which
 * covers login/reset and the privileged-mutation ceiling. Suites that make many
 * access changes in quick succession call this between tests: a real deployment
 * spreads them over time, and the ceiling has its own dedicated test.
 */
export async function clearThrottleKeys(app: INestApplication): Promise<void> {
  const redis = app.get(RedisService);
  await redis.ensureConnected();
  // keyPrefix applies to commands but not to KEYS patterns/results, so scan with the raw prefix.
  const keys = await redis.client.keys('ms:throttle:*');
  if (keys.length) await redis.client.del(...keys.map((k) => k.replace(/^ms:/, '')));
}

export const ORIGIN = 'http://127.0.0.1:4002';
