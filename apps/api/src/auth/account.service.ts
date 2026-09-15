import { randomBytes } from 'node:crypto';
import { ConflictException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { FieldEncryptionService } from '../common/field-encryption.service.js';
import { DatabaseService } from '../database/database.service.js';
import { IdentityService, normaliseEmail, type AdminPrincipal } from '../identity/identity.service.js';
import { hashResetToken, type RequestContext } from './auth.service.js';
import { LoginThrottleService, ThrottleUnavailableError } from './login-throttle.service.js';
import { PasswordHistoryService } from './password-history.service.js';
import { SecurityPolicyService } from './security-policy.service.js';
import { PasswordService } from './password.service.js';
import { SessionService, type SessionSummary } from './session.service.js';
import { TotpService } from './totp/totp.service.js';

/** Sensitive account actions need authentication within this window, or the current password. */
export const RECENT_AUTH_WINDOW_MS = 5 * 60_000;
const CHALLENGE_TTL_MS = 5 * 60_000;
const CHALLENGE_MAX_ATTEMPTS = 5;

export class RecentAuthRequiredException extends HttpException {
  constructor() {
    super({ code: 'REAUTHENTICATION_REQUIRED', message: 'Confirm your current password to continue' }, HttpStatus.FORBIDDEN);
  }
}

/**
 * Own-account security (SRS AUTH 001–003): password change, session listing,
 * setup acceptance, TOTP enrolment/verification/disable and the second login
 * step. Throttling for challenges uses the login scope keyed by the account.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly database: DatabaseService,
    private readonly identity: IdentityService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly totp: TotpService,
    private readonly encryption: FieldEncryptionService,
    private readonly throttle: LoginThrottleService,
    private readonly audit: AuditService,
    private readonly policy: SecurityPolicyService,
    private readonly history: PasswordHistoryService,
  ) {}

  // ---- recent authentication -------------------------------------------

  async assertRecentAuth(admin: AdminPrincipal, session: SessionSummary, currentPassword: string | undefined): Promise<void> {
    if (Date.now() - session.createdAt.getTime() <= RECENT_AUTH_WINDOW_MS) return;
    if (!currentPassword) throw new RecentAuthRequiredException();
    const db = await this.database.client();
    const record = await db.adminUser.findUniqueOrThrow({ where: { id: admin.id }, select: { passwordHash: true } });
    if (!(await this.passwords.verify(record.passwordHash, currentPassword))) throw new RecentAuthRequiredException();
  }

  // ---- password --------------------------------------------------------

  async changePassword(admin: AdminPrincipal, session: SessionSummary, currentPassword: string, newPassword: string, ctx: RequestContext): Promise<void> {
    const { passwordMinLength } = await this.policy.policy();
    const policyError = PasswordService.validate(newPassword, passwordMinLength);
    if (policyError) throw new HttpException({ code: 'VALIDATION_ERROR', message: policyError, fields: { newPassword: [policyError] } }, HttpStatus.BAD_REQUEST);
    if (normaliseEmail(admin.email) === newPassword.trim().toLowerCase()) {
      throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Password must not be your email address', fields: { newPassword: ['Password must not be your email address'] } }, HttpStatus.BAD_REQUEST);
    }
    const db = await this.database.client();
    const record = await db.adminUser.findUniqueOrThrow({ where: { id: admin.id }, select: { passwordHash: true } });
    if (!(await this.passwords.verify(record.passwordHash, currentPassword))) {
      throw new HttpException({ code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect', fields: { currentPassword: ['Current password is incorrect'] } }, HttpStatus.BAD_REQUEST);
    }
    await this.history.assertNotReused(admin.id, newPassword, record.passwordHash);
    const passwordHash = await this.passwords.hash(newPassword);
    await db.adminUser.update({ where: { id: admin.id }, data: { passwordHash, passwordChangedAt: new Date(), version: { increment: 1 } } });
    await this.history.record(admin.id, record.passwordHash);
    const revoked = await this.sessions.revokeAllForAdmin(admin.id, 'password_change', session.id);
    await this.audit.record({ action: 'auth.password.changed', actorAdminId: admin.id, targetType: 'admin_user', targetId: admin.id, metadata: { otherSessionsRevoked: revoked }, requestId: ctx.requestId, ipAddress: ctx.ip });
  }

  // ---- setup acceptance (invited accounts) -----------------------------

  async acceptSetup(token: string, password: string, ctx: RequestContext): Promise<void> {
    const { passwordMinLength } = await this.policy.policy();
    const policyError = PasswordService.validate(password, passwordMinLength);
    if (policyError) throw new HttpException({ code: 'VALIDATION_ERROR', message: policyError, fields: { password: [policyError] } }, HttpStatus.BAD_REQUEST);
    const db = await this.database.client();
    const invalid = new HttpException({ code: 'INVALID_SETUP_TOKEN', message: 'This setup link is invalid or has expired' }, HttpStatus.BAD_REQUEST);
    const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashResetToken(token) }, include: { admin: true } });
    if (!record || record.purpose !== 'setup' || record.usedAt || record.expiresAt.getTime() <= Date.now() || record.admin.status !== 'invited') throw invalid;
    if (normaliseEmail(record.admin.email) === password.trim().toLowerCase()) {
      throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Password must not be your email address', fields: { password: ['Password must not be your email address'] } }, HttpStatus.BAD_REQUEST);
    }
    const passwordHash = await this.passwords.hash(password);
    await db.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
      if (consumed.count !== 1) throw invalid;
      await tx.adminUser.update({ where: { id: record.adminId }, data: { passwordHash, status: 'active', passwordChangedAt: new Date(), version: { increment: 1 } } });
    });
    await this.audit.record({ action: 'admin.setup.completed', actorAdminId: record.adminId, targetType: 'admin_user', targetId: record.adminId, requestId: ctx.requestId, ipAddress: ctx.ip });
  }

  // ---- sessions --------------------------------------------------------

  async listOwnSessions(admin: AdminPrincipal, session: SessionSummary) {
    const db = await this.database.client();
    const rows = await db.adminSession.findMany({ where: { adminId: admin.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: [{ lastSeenAt: 'desc' }, { id: 'asc' }] });
    return rows.map((s) => ({ id: s.id, createdAt: s.createdAt.toISOString(), lastSeenAt: s.lastSeenAt.toISOString(), idleExpiresAt: s.idleExpiresAt.toISOString(), expiresAt: s.expiresAt.toISOString(), ipAddress: s.ipAddress, userAgent: s.userAgent, current: s.id === session.id }));
  }

  async revokeOwnSession(admin: AdminPrincipal, sessionId: string, ctx: RequestContext): Promise<void> {
    const db = await this.database.client();
    const target = await db.adminSession.findFirst({ where: { id: sessionId, adminId: admin.id } });
    if (!target) throw new HttpException({ code: 'NOT_FOUND', message: 'Session not found' }, HttpStatus.NOT_FOUND);
    await this.sessions.revoke(sessionId, 'revoked_by_owner');
    await this.audit.record({ action: 'admin.session.revoke', actorAdminId: admin.id, targetType: 'admin_session', targetId: sessionId, requestId: ctx.requestId, ipAddress: ctx.ip });
  }

  // ---- TOTP enrolment ----------------------------------------------------

  async enrollTotp(admin: AdminPrincipal, session: SessionSummary, currentPassword: string | undefined, ctx: RequestContext): Promise<{ otpauthUri: string; secret: string }> {
    await this.assertRecentAuth(admin, session, currentPassword);
    const db = await this.database.client();
    const current = await db.adminUser.findUniqueOrThrow({ where: { id: admin.id }, select: { totpEnabledAt: true } });
    if (current.totpEnabledAt) throw new ConflictException({ code: 'TOTP_ALREADY_ENABLED', message: 'Two-factor authentication is already enabled' });
    const secret = this.totp.generateSecret();
    await db.adminUser.update({ where: { id: admin.id }, data: { totpPendingSecretEncrypted: this.encryption.encrypt(secret, admin.id) } });
    await this.audit.record({ action: 'auth.totp.enroll_started', actorAdminId: admin.id, targetType: 'admin_user', targetId: admin.id, requestId: ctx.requestId, ipAddress: ctx.ip });
    return { otpauthUri: this.totp.otpauthUri(secret, admin.email), secret };
  }

  async verifyTotpEnrollment(admin: AdminPrincipal, code: string, ctx: RequestContext): Promise<{ recoveryCodes: string[] }> {
    const db = await this.database.client();
    const current = await db.adminUser.findUniqueOrThrow({ where: { id: admin.id }, select: { totpPendingSecretEncrypted: true, totpEnabledAt: true } });
    if (!current.totpPendingSecretEncrypted || current.totpEnabledAt) throw new ConflictException({ code: 'TOTP_NOT_PENDING', message: 'Start enrolment first' });
    const secret = this.encryption.decrypt(current.totpPendingSecretEncrypted, admin.id);
    if (this.totp.verify(secret, code) === null) {
      throw new HttpException({ code: 'INVALID_TOTP_CODE', message: 'That code is not valid', fields: { code: ['That code is not valid'] } }, HttpStatus.BAD_REQUEST);
    }
    const recoveryCodes = this.totp.generateRecoveryCodes();
    await db.$transaction(async (tx) => {
      await tx.adminUser.update({ where: { id: admin.id }, data: { totpSecretEncrypted: current.totpPendingSecretEncrypted, totpPendingSecretEncrypted: null, totpEnabledAt: new Date(), version: { increment: 1 } } });
      await tx.adminRecoveryCode.deleteMany({ where: { adminId: admin.id } });
      await tx.adminRecoveryCode.createMany({ data: recoveryCodes.map((c) => ({ adminId: admin.id, codeHash: TotpService.hashRecoveryCode(c) })) });
    });
    await this.audit.record({ action: 'auth.totp.enabled', actorAdminId: admin.id, targetType: 'admin_user', targetId: admin.id, requestId: ctx.requestId, ipAddress: ctx.ip });
    return { recoveryCodes };
  }

  async disableTotp(admin: AdminPrincipal, session: SessionSummary, currentPassword: string | undefined, code: string | undefined, ctx: RequestContext): Promise<void> {
    await this.assertRecentAuth(admin, session, currentPassword);
    const db = await this.database.client();
    const current = await db.adminUser.findUniqueOrThrow({ where: { id: admin.id }, select: { totpSecretEncrypted: true, totpEnabledAt: true } });
    if (!current.totpEnabledAt || !current.totpSecretEncrypted) throw new ConflictException({ code: 'TOTP_NOT_ENABLED', message: 'Two-factor authentication is not enabled' });
    if (!code || !(await this.consumeSecondFactor(admin.id, current.totpSecretEncrypted, code))) {
      throw new HttpException({ code: 'INVALID_TOTP_CODE', message: 'Enter a valid authenticator or recovery code', fields: { code: ['Enter a valid authenticator or recovery code'] } }, HttpStatus.BAD_REQUEST);
    }
    await db.$transaction(async (tx) => {
      await tx.adminUser.update({ where: { id: admin.id }, data: { totpSecretEncrypted: null, totpPendingSecretEncrypted: null, totpEnabledAt: null, version: { increment: 1 } } });
      await tx.adminRecoveryCode.deleteMany({ where: { adminId: admin.id } });
    });
    await this.audit.record({ action: 'auth.totp.disabled', actorAdminId: admin.id, targetType: 'admin_user', targetId: admin.id, requestId: ctx.requestId, ipAddress: ctx.ip });
  }

  // ---- login second step ---------------------------------------------------

  /** Creates a short-lived challenge after a correct password for a TOTP-enabled admin. */
  async createLoginChallenge(adminId: string, ctx: RequestContext): Promise<{ challenge: string; expiresAt: Date }> {
    const db = await this.database.client();
    const challenge = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    await db.adminLoginChallenge.create({ data: { tokenHash: hashResetToken(challenge), adminId, expiresAt, ipAddress: ctx.ip.slice(0, 45), userAgent: ctx.userAgent?.slice(0, 255) ?? null } });
    return { challenge, expiresAt };
  }

  /** Completes a challenge with a TOTP or recovery code; returns the admin id to issue a session for. */
  async completeLoginChallenge(challenge: string, code: string, ctx: RequestContext): Promise<string> {
    const db = await this.database.client();
    const invalid = new UnauthorizedException({ code: 'INVALID_CHALLENGE', message: 'Sign in again to continue' });
    const record = await db.adminLoginChallenge.findUnique({ where: { tokenHash: hashResetToken(challenge) }, include: { admin: { select: { id: true, email: true, status: true, totpSecretEncrypted: true, totpEnabledAt: true } } } });
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now() || record.admin.status !== 'active' || !record.admin.totpSecretEncrypted) throw invalid;
    if (record.attempts >= CHALLENGE_MAX_ATTEMPTS) throw invalid;
    let ok = false;
    try {
      ok = await this.consumeSecondFactor(record.adminId, record.admin.totpSecretEncrypted, code);
    } catch (error) {
      if (error instanceof ThrottleUnavailableError) throw error;
      throw error;
    }
    if (!ok) {
      await db.adminLoginChallenge.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
      await this.audit.record({ action: 'auth.totp.challenge_failed', targetType: 'admin_user', targetId: record.adminId, requestId: ctx.requestId, ipAddress: ctx.ip });
      throw new UnauthorizedException({ code: 'INVALID_TOTP_CODE', message: 'That code is not valid' });
    }
    const consumed = await db.adminLoginChallenge.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
    if (consumed.count !== 1) throw invalid;
    return record.adminId;
  }

  /** Verifies a TOTP code, or consumes an unused recovery code. */
  private async consumeSecondFactor(adminId: string, secretEncrypted: string, code: string): Promise<boolean> {
    const trimmed = code.trim();
    if (/^\d{6}$/.test(trimmed)) {
      const secret = this.encryption.decrypt(secretEncrypted, adminId);
      return this.totp.verify(secret, trimmed) !== null;
    }
    const db = await this.database.client();
    const result = await db.adminRecoveryCode.updateMany({ where: { adminId, codeHash: TotpService.hashRecoveryCode(trimmed), usedAt: null }, data: { usedAt: new Date() } });
    if (result.count === 1) {
      await this.audit.record({ action: 'auth.totp.recovery_code_used', actorAdminId: adminId, targetType: 'admin_user', targetId: adminId });
      return true;
    }
    return false;
  }
}
