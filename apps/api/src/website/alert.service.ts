import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, ServiceAlert } from '@adelaide-sphere/database';
import { CACHE_TAGS } from '@adelaide-sphere/domain';
import { AuditService } from '../audit/audit.service.js';
import { CacheService } from '../cache/cache.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { alertRoleFor, ariaLiveFor, selectVisibleAlerts, validateAlertLink, type AlertSeverity } from './alert-rules.js';
import { assertVersion, publicVisibilityChanged, recordContentActivity } from './content-support.js';

export const ALERT_LIMITS = { title: 120, message: 400, linkLabel: 60, linkUrl: 300 } as const;

export interface AlertInput {
  title: string;
  message: string;
  severity: AlertSeverity;
  linkLabel?: string | null;
  linkUrl?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  dismissible?: boolean;
  priority?: number;
  displayOrder?: number;
}

export interface PublicAlert {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  linkLabel: string | null;
  linkUrl: string | null;
  linkExternal: boolean;
  dismissible: boolean;
  /** Dismissal is keyed to this, so an edited alert reappears (ALRT 006). */
  contentVersion: number;
  role: 'alert' | 'status';
  ariaLive: 'assertive' | 'polite';
}

/**
 * Service alerts shown above the public header (SRS 1.2 ALRT 001–007).
 *
 * Every field that decides what a visitor sees is validated on write: the link
 * against an allowlisted scheme, the window as instants, the severity as a
 * closed set. Because an alert renders on every public page, publication,
 * editing, expiry and removal purge the shell, and removing one published in
 * error is treated as urgent (CACHE 002).
 */
@Injectable()
export class AlertService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
  ) {}

  private validate(input: AlertInput) {
    const fields: Record<string, string[]> = {};
    const title = (input.title ?? '').trim();
    const message = (input.message ?? '').trim();
    const linkLabel = (input.linkLabel ?? '')?.trim() || null;
    const rawUrl = (input.linkUrl ?? '')?.trim() || null;
    const priority = input.priority ?? 0;
    const displayOrder = input.displayOrder ?? 0;

    if (title.length < 3) fields.title = ['A title needs at least 3 characters'];
    else if (title.length > ALERT_LIMITS.title) fields.title = [`A title is at most ${ALERT_LIMITS.title} characters`];
    if (message.length < 5) fields.message = ['A message needs at least 5 characters'];
    else if (message.length > ALERT_LIMITS.message) fields.message = [`A message is at most ${ALERT_LIMITS.message} characters`];
    if (!['informational', 'warning', 'emergency'].includes(input.severity)) fields.severity = ['Choose a severity'];

    let linkUrl: string | null = null;
    if (rawUrl) {
      const link = validateAlertLink(rawUrl);
      if (!link) fields.linkUrl = ['Use a page on this site (starting with /) or an http(s) address'];
      else linkUrl = link.url;
      if (!linkLabel) fields.linkLabel = ['A link needs visible text'];
    }
    if (linkLabel && !rawUrl) fields.linkUrl = ['Add the address the link should open'];
    if (linkLabel && linkLabel.length > ALERT_LIMITS.linkLabel) fields.linkLabel = [`Link text is at most ${ALERT_LIMITS.linkLabel} characters`];

    const startsAt = parseInstant(input.startsAt);
    const endsAt = parseInstant(input.endsAt);
    if (input.startsAt && startsAt === undefined) fields.startsAt = ['Enter a valid date and time'];
    if (input.endsAt && endsAt === undefined) fields.endsAt = ['Enter a valid date and time'];
    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) fields.endsAt = ['The end must be after the start'];
    if (!Number.isInteger(priority) || priority < 0 || priority > 100) fields.priority = ['Priority is a whole number between 0 and 100'];
    if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 9999) fields.displayOrder = ['Display order is a whole number between 0 and 9999'];

    if (Object.keys(fields).length > 0) throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Some fields are invalid', fields }, HttpStatus.BAD_REQUEST);

    return {
      title,
      message,
      severity: input.severity,
      linkLabel,
      linkUrl,
      startsAt: startsAt ?? null,
      endsAt: endsAt ?? null,
      dismissible: input.dismissible ?? true,
      priority,
      displayOrder,
    };
  }

  /** The alert bar renders on every public page, so its cache tag is the shell. */
  private async purge(tx: Prisma.TransactionClient, ctx: RequestContext, id: string, urgent = false): Promise<void> {
    await this.cache.recordInvalidation(tx, { resourceType: 'service_alert', resourceId: id, correlationId: ctx.requestId, tags: [CACHE_TAGS.alerts, CACHE_TAGS.settings], urgent });
  }

  // ---- admin ---------------------------------------------------------------

  async list(query: { page: number; pageSize: number; status?: 'draft' | 'published'; severity?: AlertSeverity; q?: string }) {
    const db = await this.database.client();
    const where: Prisma.ServiceAlertWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.q ? { title: { contains: query.q } } : {}),
    };
    const [rows, total] = await Promise.all([
      db.serviceAlert.findMany({ where, orderBy: [{ status: 'asc' }, { priority: 'desc' }, { displayOrder: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      db.serviceAlert.count({ where }),
    ]);
    return { rows, total };
  }

  async get(id: string): Promise<ServiceAlert> {
    const db = await this.database.client();
    const row = await db.serviceAlert.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'No such alert' });
    return row;
  }

  async create(input: AlertInput, actor: AdminPrincipal, ctx: RequestContext): Promise<ServiceAlert> {
    const value = this.validate(input);
    const db = await this.database.client();
    return db.$transaction(async (tx) => {
      const created = await tx.serviceAlert.create({ data: { ...value, createdByAdminId: actor.id, updatedByAdminId: actor.id } });
      await recordContentActivity(tx, this.audit, {
        action: 'website.alert.create',
        targetType: 'service_alert',
        targetId: created.id,
        actor,
        ctx,
        metadata: { severity: created.severity, title: created.title.slice(0, 120) },
      });
      return created;
    });
  }

  async update(id: string, input: AlertInput & { expectedVersion: number }, actor: AdminPrincipal, ctx: RequestContext): Promise<ServiceAlert> {
    const value = this.validate(input);
    const current = await this.get(id);
    assertVersion(current.version, input.expectedVersion);

    // Any change a viewer could read is a new content version, so an alert they
    // dismissed comes back with its new wording (ALRT 006).
    const contentChanged =
      current.title !== value.title || current.message !== value.message || current.severity !== value.severity || current.linkUrl !== value.linkUrl || current.linkLabel !== value.linkLabel;

    const db = await this.database.client();
    const updated = await db.$transaction(async (tx) => {
      const row = await tx.serviceAlert.update({
        where: { id },
        data: { ...value, version: { increment: 1 }, ...(contentChanged ? { contentVersion: { increment: 1 } } : {}), updatedByAdminId: actor.id },
      });
      await recordContentActivity(tx, this.audit, {
        action: 'website.alert.update',
        targetType: 'service_alert',
        targetId: id,
        actor,
        ctx,
        metadata: { severity: row.severity, contentChanged, published: row.status === 'published' },
      });
      if (publicVisibilityChanged(current, row)) await this.purge(tx, ctx, id);
      return row;
    });
    if (publicVisibilityChanged(current, updated)) await this.cache.bumpNamespace();
    return updated;
  }

  async setPublished(id: string, published: boolean, expectedVersion: number, actor: AdminPrincipal, ctx: RequestContext): Promise<ServiceAlert> {
    const current = await this.get(id);
    assertVersion(current.version, expectedVersion);
    if ((current.status === 'published') === published) {
      throw new HttpException({ code: 'INVALID_STATE', message: published ? 'This alert is already published' : 'This alert is not published' }, HttpStatus.CONFLICT);
    }

    const db = await this.database.client();
    const updated = await db.$transaction(async (tx) => {
      const row = await tx.serviceAlert.update({
        where: { id },
        data: {
          status: published ? 'published' : 'draft',
          publishedAt: published ? (current.publishedAt ?? new Date()) : current.publishedAt,
          version: { increment: 1 },
          updatedByAdminId: actor.id,
        },
      });
      await recordContentActivity(tx, this.audit, {
        action: published ? 'website.alert.publish' : 'website.alert.unpublish',
        targetType: 'service_alert',
        targetId: id,
        actor,
        ctx,
        metadata: { severity: row.severity, title: row.title.slice(0, 120) },
      });
      // Taking a live alert down is urgent: it is on every page (CACHE 002).
      await this.purge(tx, ctx, id, !published);
      return row;
    });
    await this.cache.bumpNamespace();
    return updated;
  }

  async remove(id: string, actor: AdminPrincipal, ctx: RequestContext): Promise<void> {
    const current = await this.get(id);
    const db = await this.database.client();
    await db.$transaction(async (tx) => {
      await tx.serviceAlert.delete({ where: { id } });
      await recordContentActivity(tx, this.audit, {
        action: 'website.alert.delete',
        targetType: 'service_alert',
        targetId: id,
        actor,
        ctx,
        metadata: { severity: current.severity, wasPublished: current.status === 'published' },
      });
      if (current.status === 'published') await this.purge(tx, ctx, id, true);
    });
    if (current.status === 'published') await this.cache.bumpNamespace();
  }

  // ---- public --------------------------------------------------------------

  /**
   * The alerts to render right now (ALRT 002). The window is evaluated here, in
   * the backend, so an alert outside it cannot reach a page by any route, and
   * the order is fully determined so the same state always renders the same way.
   */
  async publicList(now: Date = new Date()): Promise<PublicAlert[]> {
    const db = await this.database.client();
    const candidates = await db.serviceAlert.findMany({
      where: {
        status: 'published',
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      take: 20,
    });
    return selectVisibleAlerts(
      candidates.map((row) => ({ ...row, severity: row.severity as AlertSeverity })),
      now,
    ).map((row) => ({
      id: row.id,
      title: row.title,
      message: row.message,
      severity: row.severity,
      linkLabel: row.linkLabel,
      linkUrl: row.linkUrl,
      // The validator that accepted the link decides whether it leaves the site;
      // a second `startsWith('/')` heuristic here is exactly how the two answers
      // drift apart. A stored link always validates, so `false` is unreachable
      // for a saved row and is the safe direction if it ever is not.
      linkExternal: row.linkUrl ? (validateAlertLink(row.linkUrl)?.external ?? false) : false,
      dismissible: row.dismissible,
      contentVersion: row.contentVersion,
      role: alertRoleFor(row.severity),
      ariaLive: ariaLiveFor(row.severity),
    }));
  }
}

/** `undefined` means "given but unparseable"; `null` means "not given". */
function parseInstant(value: string | null | undefined): Date | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
