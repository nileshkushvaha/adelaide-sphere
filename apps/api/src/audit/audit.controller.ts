import { BadRequestException, Controller, ForbiddenException, Get, Header, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Prisma, type AuditLog } from '@adelaide-sphere/database';
import { CurrentAdmin, RequireAnyPermission } from '../auth/decorators.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { ACTIVITY_CATEGORIES, describeActivity, type ActivityCategory } from './activity-catalogue.js';
import { activitySqlWhere, activityWhere, decodeGroupKey, encodeGroupKey, groupWhere, visibleCategories, type ActivityFilters } from './activity-scope.js';
import { targetLabelFor, targetLabels } from './activity-targets.js';
import { PaginationQueryDto, collectionMeta, skipFor } from '../common/pagination.js';
import { DatabaseService } from '../database/database.service.js';

export class ListAuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Exact action key or prefix ending with "*" (e.g. auth.*)', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9_.]+\*?$/i, { message: 'Invalid action filter' })
  action?: string;

  @ApiPropertyOptional({ description: 'An administrator id, or "system" for events the system recorded itself' }) @IsOptional() @IsString() @MaxLength(64) actorAdminId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) targetType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) targetId?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsISO8601() to?: string;

  @ApiPropertyOptional({ enum: ACTIVITY_CATEGORIES, description: 'Groups events by what they are about (SRS 1.2 ACT 002/005).' })
  @IsOptional()
  @IsIn(ACTIVITY_CATEGORIES)
  category?: ActivityCategory;

  @ApiPropertyOptional({ enum: ['success', 'failure'], description: 'Derived from the event code; a refused privileged operation is a failure.' })
  @IsOptional()
  @IsIn(['success', 'failure'])
  outcome?: 'success' | 'failure';

  @ApiPropertyOptional({ description: 'Exact request id, so one request can be followed across events.', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  requestId?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'], default: 'false', description: 'Collapse repeated events (same action and actor, same request or minute) into one row with a count (change log 1.14).' })
  @IsOptional()
  @IsIn(['true', 'false'])
  grouped?: 'true' | 'false';

  @ApiPropertyOptional({ description: 'The members of one group, as returned in `groupKey` by a grouped list.', maxLength: 400 })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Invalid group key' })
  groupKey?: string;

  @ApiPropertyOptional({ enum: ['createdAt'], default: 'createdAt' })
  @IsOptional()
  @IsIn(['createdAt'])
  sort = 'createdAt' as const;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  override order: 'asc' | 'desc' = 'desc';
}

export class ActivitySummaryQueryDto {
  @ApiPropertyOptional({ format: 'date-time', description: 'Count events from this instant; the interface sends the start of the Adelaide day.' })
  @IsISO8601()
  from!: string;
}

const ACTIVITY_PERMISSIONS = [
  'activity.authentication.view',
  'activity.access_control.view',
  'activity.content.view',
  'activity.moderation.view',
  'activity.communication.view',
  'activity.configuration.view',
  'activity.system.view',
] as const;

interface GroupRow {
  action: string;
  actorAdminId: string | null;
  requestId: string | null;
  bucket: string;
  n: bigint | number;
  firstAt: Date;
  lastAt: Date;
  sampleId: string;
}

/**
 * The consolidated activity log (SRS 1.2 ACT 001–005; change log 1.14).
 *
 * One surface, read by area: each administrator sees only the areas their
 * permissions name — sign-ins, access, content, moderation, communication,
 * configuration, system — and asking for an area they cannot see is refused.
 * Repeated events can be read as one row with a count, and each row carries the
 * readable name of what it was done to where that name is not private.
 *
 * It is append-only in practice as well as in principle: this controller offers
 * no create, update or delete route, and none exists elsewhere. Redaction
 * happens at write time in `AuditService`.
 */
@ApiTags('admin-activity')
@Controller('admin/activity')
@RequireAnyPermission(...ACTIVITY_PERMISSIONS)
export class AuditController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List activity events, newest first; grouped, or the members of one group' })
  @ApiOkResponse({ description: '{data: AuditEntry[], meta}' })
  async list(@Query() query: ListAuditQueryDto, @CurrentAdmin() actor: AdminPrincipal) {
    const visible = visibleCategories(actor.permissions);
    if (query.category && !visible.includes(query.category)) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You do not have permission to do that' });
    const filters: ActivityFilters = {
      action: query.action,
      actorAdminId: query.actorAdminId === undefined ? undefined : query.actorAdminId === 'system' ? null : query.actorAdminId,
      targetType: query.targetType,
      targetId: query.targetId,
      requestId: query.requestId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      category: query.category,
      outcome: query.outcome,
    };
    const db = await this.database.client();

    if (query.groupKey) {
      const key = decodeGroupKey(query.groupKey);
      if (!key) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Invalid group key', fields: { groupKey: 'Invalid group key' } });
      // The caller's own scope still applies: a key cannot reach an area they cannot see.
      return this.plainList(db, { AND: [activityWhere(filters, visible), groupWhere(key)] }, query);
    }
    if (query.grouped === 'true' && !query.requestId) return this.groupedList(db, filters, visible, query);
    return this.plainList(db, activityWhere(filters, visible), query);
  }

  @Get('summary')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'How many events each visible area has had since an instant (the area chips)' })
  async summary(@Query() query: ActivitySummaryQueryDto, @CurrentAdmin() actor: AdminPrincipal) {
    const visible = visibleCategories(actor.permissions);
    const db = await this.database.client();
    const from = new Date(query.from);
    const counts = await Promise.all(visible.map((category) => db.auditLog.count({ where: activityWhere({ category, from }, visible) })));
    return { data: { from: from.toISOString(), areas: visible.map((category, index) => ({ category, count: counts[index] ?? 0 })) } };
  }

  private async plainList(db: Awaited<ReturnType<DatabaseService['client']>>, where: Prisma.AuditLogWhereInput, query: ListAuditQueryDto) {
    const [total, rows] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where,
        orderBy: [{ createdAt: query.order }, { id: 'asc' }],
        skip: skipFor(query.page, query.pageSize),
        take: query.pageSize,
        include: { actor: { select: { email: true, displayName: true } } },
      }),
    ]);
    const labels = await targetLabels(db, rows);
    return { data: rows.map((row) => present(row, targetLabelFor(labels, row))), meta: collectionMeta(query.page, query.pageSize, total) };
  }

  /**
   * Repeated events as one row each: the same action by the same actor, in the
   * same request or — for events without one — the same minute. Grouped in the
   * database, so pages and totals count groups rather than hiding rows.
   */
  private async groupedList(db: Awaited<ReturnType<DatabaseService['client']>>, filters: ActivityFilters, visible: readonly ActivityCategory[], query: ListAuditQueryDto) {
    const where = activitySqlWhere(filters, visible);
    const bucket = Prisma.sql`COALESCE(requestId, DATE_FORMAT(createdAt, '%Y-%m-%d %H:%i'))`;
    const order = query.order === 'asc' ? Prisma.sql`firstAt ASC, sampleId ASC` : Prisma.sql`lastAt DESC, sampleId DESC`;
    const [countRows, groups] = await Promise.all([
      db.$queryRaw<{ total: bigint | number }[]>(Prisma.sql`SELECT COUNT(*) AS total FROM (SELECT 1 FROM audit_logs WHERE ${where} GROUP BY action, actorAdminId, ${bucket}) AS g`),
      db.$queryRaw<GroupRow[]>(
        Prisma.sql`SELECT action, actorAdminId, ANY_VALUE(requestId) AS requestId, ${bucket} AS bucket, COUNT(*) AS n, MIN(createdAt) AS firstAt, MAX(createdAt) AS lastAt, MAX(id) AS sampleId
          FROM audit_logs WHERE ${where}
          GROUP BY action, actorAdminId, bucket
          ORDER BY ${order}
          LIMIT ${query.pageSize} OFFSET ${skipFor(query.page, query.pageSize)}`,
      ),
    ]);
    const total = Number(countRows[0]?.total ?? 0);
    const samples = await db.auditLog.findMany({ where: { id: { in: groups.map((group) => group.sampleId) } }, include: { actor: { select: { email: true, displayName: true } } } });
    const byId = new Map(samples.map((row) => [row.id, row]));
    const labels = await targetLabels(db, samples);
    const data = groups.flatMap((group) => {
      const sample = byId.get(group.sampleId);
      if (!sample) return [];
      const count = Number(group.n);
      const groupKey = encodeGroupKey({
        action: group.action,
        actorAdminId: group.actorAdminId,
        bucket: group.requestId ? { kind: 'request', value: group.requestId } : { kind: 'minute', value: group.bucket },
      });
      return [{ ...present(sample, count === 1 ? targetLabelFor(labels, sample) : null), count, firstAt: new Date(group.firstAt).toISOString(), lastAt: new Date(group.lastAt).toISOString(), groupKey }];
    });
    return { data, meta: collectionMeta(query.page, query.pageSize, total) };
  }
}

/** One event as the interface reads it; category, label and outcome are derived (ACT 002), never stored twice. */
function present(row: AuditLog & { actor: { email: string; displayName: string } | null }, targetLabel: string | null) {
  const described = describeActivity(row.action);
  return {
    id: row.id,
    action: row.action,
    category: described.category,
    domainLabel: described.domainLabel,
    outcome: described.outcome,
    actor: row.actor ? { id: row.actorAdminId, email: row.actor.email, displayName: row.actor.displayName } : null,
    targetType: row.targetType,
    targetId: row.targetId,
    targetLabel,
    reason: row.reason,
    metadata: row.metadata,
    requestId: row.requestId,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt.toISOString(),
    count: 1,
    firstAt: row.createdAt.toISOString(),
    lastAt: row.createdAt.toISOString(),
    groupKey: null as string | null,
  };
}
