import { createHash, randomBytes } from 'node:crypto';
import { HttpException, HttpStatus, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { IdentityService, normaliseEmail, type AdminPrincipal } from '../identity/identity.service.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { LoginThrottleService, ThrottleUnavailableError } from './login-throttle.service.js';
import { MailerPort } from './mailer/mailer.port.js';
import { PasswordHistoryService } from './password-history.service.js';
import { passwordResetMail } from './mailer/auth-mail.js';
import { SecurityPolicyService } from './security-policy.service.js';
import { PasswordService } from './password.service.js';
import { SessionService, type SessionSummary } from './session.service.js';
import { authEvents } from '../observability/metrics.registry.js';

export interface RequestContext {
  ip: string;
  userAgent?: string;
  requestId: string;
}

export type LoginResult =
  | { kind: 'session'; token: string; admin: AdminPrincipal; session: SessionSummary }
  | { kind: 'challenge'; adminId: string };

/** The AUTH 001 maximum; the security settings may narrow it, never widen it. */
const RESET_TOKEN_TTL_MS = 30 * 60_000;

export class RateLimitedException extends HttpException {
  constructor(public readonly retryAfterSeconds: number) {
    super({ code: 'RATE_LIMITED', message: 'Too many attempts. Please wait before trying again.' }, HttpStatus.TOO_MANY_REQUESTS);
  }
}

export class AuthUnavailableException extends HttpException {
  constructor() {
    super({ code: 'SERVICE_UNAVAILABLE', message: 'Sign-in is temporarily unavailable. Please try again shortly.' }, HttpStatus.SERVICE_UNAVAILABLE);
  }
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly adminBaseUrl: string;

  constructor(
    private readonly database: DatabaseService,
    private readonly identity: IdentityService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly throttle: LoginThrottleService,
    private readonly audit: AuditService,
    private readonly mailer: MailerPort,
    private readonly policy: SecurityPolicyService,
    private readonly history: PasswordHistoryService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.adminBaseUrl = config.get('PUBLIC_ADMIN_URL', { infer: true });
  }

  async login(email: string, password: string, ctx: RequestContext): Promise<LoginResult> {
    const normalised = normaliseEmail(email);
    await this.guardThrottle('login', ctx.ip, normalised);

    const admin = await this.identity.findByEmail(normalised);
    const valid = admin ? await this.passwords.verify(admin.passwordHash, password) : (await this.passwords.verifyAgainstDummy(password), false);
    if (!admin || !valid || admin.status !== 'active') {
      await this.throttle.recordFailure('login', ctx.ip, normalised).catch((e) => this.rethrowUnavailable(e));
      await this.audit.record({
        action: 'auth.login.failure',
        targetType: admin ? 'admin_user' : null,
        targetId: admin?.id ?? null,
        metadata: { reason: !admin ? 'unknown_account' : !valid ? 'invalid_password' : 'account_disabled' },
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
      });
      // Outcome only: no address, no administrator id, nothing a request supplied.
      authEvents.inc({ event: 'login_failure' });
      // One generic response for unknown, wrong password and disabled (SRS AUTH 001).
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    }

    const db = await this.database.client();
    if (this.passwords.needsRehash(admin.passwordHash)) {
      await db.adminUser.update({ where: { id: admin.id }, data: { passwordHash: await this.passwords.hash(password) } });
    }
    await this.throttle.reset('login', normalised);
    if (admin.totpEnabledAt) {
      // Second factor required (SRS AUTH 003): no session until the code is verified.
      await this.audit.record({ action: 'auth.login.password_ok', targetType: 'admin_user', targetId: admin.id, requestId: ctx.requestId, ipAddress: ctx.ip });
      return { kind: 'challenge', adminId: admin.id };
    }
    return this.issueSession(admin.id, ctx);
  }

  /** Creates a session + audit row for an authenticated admin (after password, or after the TOTP step). */
  async issueSession(adminId: string, ctx: RequestContext): Promise<Extract<LoginResult, { kind: 'session' }>> {
    const db = await this.database.client();
    const admin = await db.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    const { token, session } = await this.sessions.create(admin.id, { ipAddress: ctx.ip, userAgent: ctx.userAgent });
    await db.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    const principal = await this.identity.getPrincipal(admin.id);
    await this.audit.record({
      action: 'auth.login.success',
      actorAdminId: admin.id,
      targetType: 'admin_session',
      targetId: session.id,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    authEvents.inc({ event: 'login_success' });
    return { kind: 'session', token, admin: principal!, session };
  }

  async logout(admin: AdminPrincipal, session: SessionSummary, ctx: RequestContext): Promise<void> {
    await this.sessions.revoke(session.id, 'logout');
    await this.audit.record({ action: 'auth.logout', actorAdminId: admin.id, targetType: 'admin_session', targetId: session.id, requestId: ctx.requestId, ipAddress: ctx.ip });
  }

  /** Always resolves (generic 202); creates and mails a token only for active accounts. */
  async forgotPassword(email: string, ctx: RequestContext): Promise<void> {
    const normalised = normaliseEmail(email);
    await this.guardThrottle('reset', ctx.ip, normalised);
    await this.throttle.recordFailure('reset', ctx.ip, normalised).catch((e) => this.rethrowUnavailable(e));
    const admin = await this.identity.findByEmail(normalised);
    if (!admin || admin.status !== 'active') return;

    const db = await this.database.client();
    const token = randomBytes(32).toString('base64url');
    // The lifetime the link really has, so the email can say it (SECS 003).
    const lifetimeMs = Math.min((await this.policy.policy()).passwordResetMs, RESET_TOKEN_TTL_MS);
    await db.passwordResetToken.create({
      data: { tokenHash: hashResetToken(token), adminId: admin.id, expiresAt: new Date(Date.now() + lifetimeMs), requestedIp: ctx.ip.slice(0, 45) },
    });
    let delivered = true;
    try {
      await this.mailer.send(passwordResetMail({ to: admin.email, resetUrl: `${this.adminBaseUrl}/reset-password?token=${token}`, lifetimeMs }));
    } catch {
      delivered = false;
    }
    authEvents.inc({ event: 'password_reset_requested' });
    await this.audit.record({
      action: 'auth.password_reset.requested',
      targetType: 'admin_user',
      targetId: admin.id,
      metadata: { delivered, transport: this.mailer.transportName },
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
  }

  async resetPassword(token: string, newPassword: string, ctx: RequestContext): Promise<void> {
    const { passwordMinLength } = await this.policy.policy();
    const policyError = PasswordService.validate(newPassword, passwordMinLength);
    if (policyError) throw new HttpException({ code: 'VALIDATION_ERROR', message: policyError }, HttpStatus.BAD_REQUEST);
    const db = await this.database.client();
    const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashResetToken(token) }, include: { admin: true } });
    const invalid = new HttpException({ code: 'INVALID_RESET_TOKEN', message: 'This reset link is invalid or has expired' }, HttpStatus.BAD_REQUEST);
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now() || record.admin.status !== 'active') throw invalid;
    if (normaliseEmail(record.admin.email) === newPassword.trim().toLowerCase()) {
      throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Password must not be your email address' }, HttpStatus.BAD_REQUEST);
    }
    // Checked before the token is consumed, so a refused password does not cost
    // the person their reset link (SRS 1.2 SECS 003).
    await this.history.assertNotReused(record.adminId, newPassword, record.admin.passwordHash);
    const previousHash = record.admin.passwordHash;
    const passwordHash = await this.passwords.hash(newPassword);
    await db.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
      if (consumed.count !== 1) throw invalid; // raced with a concurrent use
      await tx.adminUser.update({ where: { id: record.adminId }, data: { passwordHash, passwordChangedAt: new Date(), version: { increment: 1 } } });
      await tx.adminSession.updateMany({ where: { adminId: record.adminId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'password_reset' } });
    });
    await this.history.record(record.adminId, previousHash);
    await this.throttle.reset('login', normaliseEmail(record.admin.email));
    await this.audit.record({ action: 'auth.password_reset.completed', actorAdminId: record.adminId, targetType: 'admin_user', targetId: record.adminId, requestId: ctx.requestId, ipAddress: ctx.ip });
  }

  private async guardThrottle(scope: 'login' | 'reset', ip: string, normalisedEmail: string): Promise<void> {
    let decision;
    try {
      decision = await this.throttle.check(scope, ip, normalisedEmail);
    } catch (error) {
      this.rethrowUnavailable(error);
    }
    if (decision && !decision.allowed) {
      // A lockout is a security signal in its own right: repeated ones are what
      // a credential-stuffing attempt looks like from the outside.
      authEvents.inc({ event: scope === 'login' ? 'lockout' : 'reset_throttled' });
      throw new RateLimitedException(decision.retryAfterSeconds);
    }
  }

  private rethrowUnavailable(error: unknown): never {
    if (error instanceof ThrottleUnavailableError) throw new AuthUnavailableException();
    this.logger.error(`unexpected throttle error: ${error instanceof Error ? error.message : String(error)}`);
    throw new AuthUnavailableException();
  }
}

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
