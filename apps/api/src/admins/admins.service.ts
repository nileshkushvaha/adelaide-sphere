import { randomBytes } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AdminUser, Prisma } from '@adelaide-sphere/database';
import { deviceSummary } from '../auth/device-summary.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { hashResetToken, type RequestContext } from '../auth/auth.service.js';
import { MailerPort } from '../auth/mailer/mailer.port.js';
import { SessionService } from '../auth/session.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { normaliseEmail, type AdminPrincipal } from '../identity/identity.service.js';
import { SUPER_ADMIN_ROLE } from '../identity/permissions.js';
import { collectionMeta, skipFor } from '../common/pagination.js';
import type { AdminListItemDto, CreateAdminDto, ListAdminsQueryDto, UpdateAdminDto } from './dto/admins.dto.js';
import { accountSetupMail } from '../auth/mailer/auth-mail.js';

const SETUP_TOKEN_TTL_MS = 24 * 60 * 60_000;

type AdminRow = AdminUser & { roles: { role: { key: string } }[] };

export function toAdminItem(admin: AdminRow): AdminListItemDto {
  return {
    id: admin.id,
    email: admin.email,
    displayName: admin.displayName,
    status: admin.status,
    roles: admin.roles.map((r) => r.role.key).sort(),
    totpEnabled: admin.totpEnabledAt !== null,
    lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
    createdAt: admin.createdAt.toISOString(),
    updatedAt: admin.updatedAt.toISOString(),
    version: admin.version,
  };
}

const include = { roles: { select: { role: { select: { key: true } } } } } as const;

/**
 * Administrator account lifecycle (SRS ADM 001, IdentityModule family
 * /admins). Every mutation is audited; the last active Super Admin is protected.
 */
@Injectable()
export class AdminsService {
  private readonly adminBaseUrl: string;

  constructor(
    private readonly database: DatabaseService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly authorization: AuthorizationService,
    private readonly mailer: MailerPort,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.adminBaseUrl = config.get('PUBLIC_ADMIN_URL', { infer: true });
  }

  async list(query: ListAdminsQueryDto): Promise<{ data: AdminListItemDto[]; meta: ReturnType<typeof collectionMeta> }> {
    const db = await this.database.client();
    const where: Prisma.AdminUserWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { OR: [{ email: { contains: query.q } }, { displayName: { contains: query.q } }] } : {}),
      // "Who can do X" is the question this screen is opened with, and a role
      // is how the answer is granted.
      ...(query.role ? { roles: { some: { role: { key: query.role } } } } : {}),
    };
    const [total, rows] = await Promise.all([
      db.adminUser.count({ where }),
      db.adminUser.findMany({
        where,
        include,
        // Deterministic order: allowlisted sort field, then stable id (SRS DIR 004 principle).
        orderBy: [{ [query.sort]: query.order }, { id: 'asc' }],
        skip: skipFor(query.page, query.pageSize),
        take: query.pageSize,
      }),
    ]);
    return { data: rows.map(toAdminItem), meta: collectionMeta(query.page, query.pageSize, total) };
  }

  async get(id: string): Promise<AdminListItemDto> {
    const db = await this.database.client();
    const admin = await db.adminUser.findUnique({ where: { id }, include });
    if (!admin) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Administrator not found' });
    return toAdminItem(admin);
  }

  /** Creates an invited account and sends a 24 h setup link (SRS ADM 001). */
  async create(input: CreateAdminDto, actor: AdminPrincipal, ctx: RequestContext): Promise<AdminListItemDto> {
    const db = await this.database.client();
    const email = normaliseEmail(input.email);
    if (await db.adminUser.findUnique({ where: { email } })) {
      throw new ConflictException({ code: 'EMAIL_IN_USE', message: 'An administrator with that email already exists' });
    }
    const roles = await this.authorization.rolesByKey(input.roleKeys);
    // Creating an account is not a way around the assignment rules: an
    // administrator cannot mint a colleague who holds more than they do
    // (SRS RBAC 011). There is no self-check here — the account is new.
    await this.authorization.assertMayAssignRoles(actor, null, roles);
    const token = randomBytes(32).toString('base64url');
    const admin = await db.$transaction(async (tx) => {
      const created = await tx.adminUser.create({
        data: {
          email,
          displayName: input.displayName,
          // Unusable placeholder until setup: a random Argon2-looking sentinel is not needed;
          // status=invited blocks login and the setup flow replaces this value.
          passwordHash: `invited:${randomBytes(16).toString('hex')}`,
          status: 'invited',
          roles: { create: roles.map((r) => ({ roleId: r.id })) },
        },
        include,
      });
      await tx.passwordResetToken.create({
        data: { tokenHash: hashResetToken(token), adminId: created.id, purpose: 'setup', expiresAt: new Date(Date.now() + SETUP_TOKEN_TTL_MS), requestedIp: ctx.ip.slice(0, 45) },
      });
      return created;
    });
    let delivered = true;
    try {
      await this.mailer.send(accountSetupMail({ to: admin.email, setupUrl: `${this.adminBaseUrl}/accept-setup?token=${token}`, lifetimeMs: SETUP_TOKEN_TTL_MS, invitedBy: actor.displayName }));
    } catch {
      delivered = false;
    }
    await this.audit.record({ action: 'admin.create', actorAdminId: actor.id, targetType: 'admin_user', targetId: admin.id, metadata: { roles: roles.map((r) => r.key).join(','), delivered, transport: this.mailer.transportName }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return toAdminItem(admin);
  }

  /** Re-issues a setup link for an invited account. */
  async resendSetup(id: string, actor: AdminPrincipal, ctx: RequestContext): Promise<void> {
    const db = await this.database.client();
    const admin = await db.adminUser.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Administrator not found' });
    if (admin.status !== 'invited') throw new ConflictException({ code: 'INVALID_STATE', message: 'Only invited accounts can receive a setup link' });
    const token = randomBytes(32).toString('base64url');
    await db.passwordResetToken.updateMany({ where: { adminId: id, purpose: 'setup', usedAt: null }, data: { usedAt: new Date() } });
    await db.passwordResetToken.create({ data: { tokenHash: hashResetToken(token), adminId: id, purpose: 'setup', expiresAt: new Date(Date.now() + SETUP_TOKEN_TTL_MS), requestedIp: ctx.ip.slice(0, 45) } });
    let delivered = true;
    try {
      await this.mailer.send(accountSetupMail({ to: admin.email, setupUrl: `${this.adminBaseUrl}/accept-setup?token=${token}`, lifetimeMs: SETUP_TOKEN_TTL_MS, invitedBy: actor.displayName }));
    } catch {
      delivered = false;
    }
    await this.audit.record({ action: 'admin.setup_link.resent', actorAdminId: actor.id, targetType: 'admin_user', targetId: id, metadata: { delivered }, requestId: ctx.requestId, ipAddress: ctx.ip });
  }

  async update(id: string, input: UpdateAdminDto, actor: AdminPrincipal, ctx: RequestContext): Promise<AdminListItemDto> {
    const db = await this.database.client();
    const current = await db.adminUser.findUnique({ where: { id }, include });
    if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Administrator not found' });
    if (current.version !== input.expectedVersion) throw new ConflictException({ code: 'STALE_VERSION', message: 'This administrator was changed by someone else. Reload and try again.' });
    const nextRoles = input.roleKeys ? await this.authorization.rolesByKey(input.roleKeys) : null;
    const changes: Record<string, string> = {};
    if (nextRoles) {
      // Changing what an administrator may do is an access-control operation,
      // whichever endpoint it arrives at: it needs the access permission and it
      // obeys the same invariants (no self-edit, no inactive role, nothing
      // beyond what the actor holds). Before this, `admins.manage` alone could
      // grant any role, including to oneself (SRS RBAC 008/011).
      if (!actor.permissions.includes('admins.access.manage')) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You do not have permission to change an administrator’s roles' });
      }
      await this.authorization.assertMayAssignRoles(actor, id, nextRoles);
      changes.roles = nextRoles.map((r) => r.key).join(',');
    }
    const losesProtectedRole = Boolean(nextRoles && !nextRoles.some((r) => r.key === SUPER_ADMIN_ROLE.key) && current.roles.some((r) => r.role.key === SUPER_ADMIN_ROLE.key));
    const updated = await db.$transaction(async (tx) => {
      if (losesProtectedRole) await this.authorization.assertNotLastSuperAdminTx(tx, current.id);
      if (nextRoles) {
        await tx.adminRole.deleteMany({ where: { adminId: id } });
        await tx.adminRole.createMany({ data: nextRoles.map((r) => ({ adminId: id, roleId: r.id })) });
        changes.roles = nextRoles.map((r) => r.key).join(',');
      }
      if (input.displayName !== undefined && input.displayName !== current.displayName) changes.displayName = input.displayName;
      const result = await tx.adminUser.updateMany({
        where: { id, version: input.expectedVersion },
        data: {
          ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
          version: { increment: 1 },
          // A role change retires this administrator's cached permissions in the
          // same transaction, so the next request re-resolves them (RBAC 009).
          ...(nextRoles ? { authzVersion: { increment: 1 } } : {}),
        },
      });
      if (result.count !== 1) throw new ConflictException({ code: 'STALE_VERSION', message: 'This administrator was changed by someone else. Reload and try again.' });
      return tx.adminUser.findUniqueOrThrow({ where: { id }, include });
    });
    if (changes.roles) {
      // Privilege change: rotate out existing sessions (SRS AUTH 002).
      await this.sessions.revokeAllForAdmin(id, 'privilege_change');
    }
    await this.audit.record({ action: 'admin.update', actorAdminId: actor.id, targetType: 'admin_user', targetId: id, metadata: changes, requestId: ctx.requestId, ipAddress: ctx.ip });
    return toAdminItem(updated);
  }

  async disable(id: string, expectedVersion: number, reason: string | undefined, actor: AdminPrincipal, ctx: RequestContext): Promise<AdminListItemDto> {
    if (id === actor.id) throw new ConflictException({ code: 'SELF_DISABLE', message: 'You cannot disable your own account' });
    const db = await this.database.client();
    const current = await db.adminUser.findUnique({ where: { id }, include });
    if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Administrator not found' });
    if (current.status === 'disabled') throw new ConflictException({ code: 'INVALID_STATE', message: 'Administrator is already disabled' });
    const isSuperAdmin = current.roles.some((r) => r.role.key === SUPER_ADMIN_ROLE.key);
    await db.$transaction(async (tx) => {
      // The check and the write share one transaction behind the protected role
      // row's lock, so two concurrent disables cannot both pass (RBAC 011).
      if (isSuperAdmin) await this.authorization.assertNotLastSuperAdminTx(tx, id);
      const result = await tx.adminUser.updateMany({
        where: { id, version: expectedVersion },
        data: { status: 'disabled', disabledAt: new Date(), version: { increment: 1 }, authzVersion: { increment: 1 } },
      });
      if (result.count !== 1) throw new ConflictException({ code: 'STALE_VERSION', message: 'This administrator was changed by someone else. Reload and try again.' });
    });
    const revoked = await this.sessions.revokeAllForAdmin(id, 'account_disabled');
    await this.audit.record({ action: 'admin.disable', actorAdminId: actor.id, targetType: 'admin_user', targetId: id, reason: reason ?? null, metadata: { sessionsRevoked: revoked }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.get(id);
  }

  async enable(id: string, expectedVersion: number, reason: string | undefined, actor: AdminPrincipal, ctx: RequestContext): Promise<AdminListItemDto> {
    const db = await this.database.client();
    const current = await db.adminUser.findUnique({ where: { id } });
    if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Administrator not found' });
    if (current.status !== 'disabled') throw new ConflictException({ code: 'INVALID_STATE', message: 'Only disabled administrators can be enabled' });
    const result = await db.adminUser.updateMany({
      where: { id, version: expectedVersion },
      data: { status: 'active', disabledAt: null, version: { increment: 1 }, authzVersion: { increment: 1 } },
    });
    if (result.count !== 1) throw new ConflictException({ code: 'STALE_VERSION', message: 'This administrator was changed by someone else. Reload and try again.' });
    await this.audit.record({ action: 'admin.enable', actorAdminId: actor.id, targetType: 'admin_user', targetId: id, reason: reason ?? null, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.get(id);
  }

  async listSessions(adminId: string, currentSessionId?: string) {
    const db = await this.database.client();
    if (!(await db.adminUser.findUnique({ where: { id: adminId }, select: { id: true } }))) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Administrator not found' });
    const rows = await db.adminSession.findMany({ where: { adminId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: [{ lastSeenAt: 'desc' }, { id: 'asc' }] });
    return rows.map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      idleExpiresAt: s.idleExpiresAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      // Browser family and platform only; not device identification (SECS 005).
      device: deviceSummary(s.userAgent),
      current: s.id === currentSessionId,
    }));
  }

  async revokeSession(adminId: string, sessionId: string, actor: AdminPrincipal, ctx: RequestContext): Promise<void> {
    const db = await this.database.client();
    const session = await db.adminSession.findFirst({ where: { id: sessionId, adminId } });
    if (!session) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Session not found' });
    await this.sessions.revoke(sessionId, actor.id === adminId ? 'revoked_by_owner' : 'revoked_by_admin');
    await this.audit.record({ action: 'admin.session.revoke', actorAdminId: actor.id, targetType: 'admin_session', targetId: sessionId, metadata: { adminId }, requestId: ctx.requestId, ipAddress: ctx.ip });
  }

  async revokeAllSessions(adminId: string, actor: AdminPrincipal, ctx: RequestContext, exceptSessionId?: string): Promise<number> {
    const count = await this.sessions.revokeAllForAdmin(adminId, actor.id === adminId ? 'revoked_by_owner' : 'revoked_by_admin', exceptSessionId);
    await this.audit.record({ action: 'admin.session.revoke_all', actorAdminId: actor.id, targetType: 'admin_user', targetId: adminId, metadata: { count }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return count;
  }
}
