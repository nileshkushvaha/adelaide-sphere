import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { RequestContext } from '../auth/auth.service.js';
import { CurrentAdmin, Public, RequirePermissions, type AuthenticatedRequest } from '../auth/decorators.js';
import { getRequestId } from '../common/request-id.js';
import { PaginationQueryDto, collectionMeta } from '../common/pagination.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { ALERT_LIMITS, AlertService } from './alert.service.js';
import { ALERT_SEVERITIES } from '@adelaide-sphere/domain/alerts';
import type { AlertSeverity } from './alert-rules.js';

// One list, shared with the banner and the admin preview, so a new severity
// cannot be accepted by the API before either can render it.
const SEVERITIES = ALERT_SEVERITIES;
const ctxOf = (req: AuthenticatedRequest): RequestContext => ({ ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req) });

export class PublicAlertDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ enum: SEVERITIES }) severity!: string;
  @ApiPropertyOptional({ nullable: true }) linkLabel!: string | null;
  @ApiPropertyOptional({ nullable: true }) linkUrl!: string | null;
  @ApiProperty() linkExternal!: boolean;
  @ApiProperty() dismissible!: boolean;
  @ApiProperty({ description: 'Dismissal is keyed to this, so an edited alert reappears.' }) contentVersion!: number;
  @ApiProperty({ enum: ['alert', 'status'] }) role!: string;
  @ApiProperty({ enum: ['assertive', 'polite'] }) ariaLive!: string;
}

export class ServiceAlertDto extends PublicAlertDto {
  @ApiPropertyOptional({ nullable: true }) startsAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) endsAt!: string | null;
  @ApiProperty() priority!: number;
  @ApiProperty() displayOrder!: number;
  @ApiProperty({ enum: ['draft', 'published'] }) status!: string;
  @ApiPropertyOptional({ nullable: true }) publishedAt!: string | null;
  @ApiProperty() version!: number;
  @ApiProperty() updatedAt!: string;
}

export class UpsertAlertDto {
  @ApiProperty({ maxLength: ALERT_LIMITS.title }) @IsString() @MaxLength(ALERT_LIMITS.title) title!: string;
  @ApiProperty({ maxLength: ALERT_LIMITS.message }) @IsString() @MaxLength(ALERT_LIMITS.message) message!: string;
  @ApiProperty({ enum: SEVERITIES }) @IsIn(SEVERITIES) severity!: AlertSeverity;
  @ApiPropertyOptional({ nullable: true, maxLength: ALERT_LIMITS.linkLabel }) @IsOptional() @IsString() @MaxLength(ALERT_LIMITS.linkLabel) linkLabel?: string | null;
  @ApiPropertyOptional({ nullable: true, maxLength: ALERT_LIMITS.linkUrl, description: 'A path on this site (starting with /) or an http(s) address. Validated on save.' })
  @IsOptional()
  @IsString()
  @MaxLength(ALERT_LIMITS.linkUrl)
  linkUrl?: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'date-time' }) @IsOptional() @IsISO8601() startsAt?: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'date-time' }) @IsOptional() @IsISO8601() endsAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() dismissible?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) displayOrder?: number;
}

export class UpdateAlertDto extends UpsertAlertDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
}

export class PublishAlertDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
}

export class ListAlertsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['draft', 'published'] }) @IsOptional() @IsIn(['draft', 'published']) status?: 'draft' | 'published';
  @ApiPropertyOptional({ enum: SEVERITIES }) @IsOptional() @IsIn(SEVERITIES) severity?: AlertSeverity;
  @ApiPropertyOptional({ maxLength: 120, description: 'Matches the title' }) @IsOptional() @IsString() @MaxLength(120) q?: string;
}

const toDto = (row: {
  id: string;
  title: string;
  message: string;
  severity: string;
  linkLabel: string | null;
  linkUrl: string | null;
  dismissible: boolean;
  contentVersion: number;
  startsAt: Date | null;
  endsAt: Date | null;
  priority: number;
  displayOrder: number;
  status: string;
  publishedAt: Date | null;
  version: number;
  updatedAt: Date;
}) => ({
  id: row.id,
  title: row.title,
  message: row.message,
  severity: row.severity,
  linkLabel: row.linkLabel,
  linkUrl: row.linkUrl,
  linkExternal: Boolean(row.linkUrl && !row.linkUrl.startsWith('/')),
  dismissible: row.dismissible,
  contentVersion: row.contentVersion,
  startsAt: row.startsAt?.toISOString() ?? null,
  endsAt: row.endsAt?.toISOString() ?? null,
  priority: row.priority,
  displayOrder: row.displayOrder,
  status: row.status,
  publishedAt: row.publishedAt?.toISOString() ?? null,
  version: row.version,
  updatedAt: row.updatedAt.toISOString(),
});

/** Alerts to render above the public header right now (SRS 1.2 ALRT 002). */
@ApiTags('public-site')
@Public()
@Controller('service-alerts')
export class AlertPublicController {
  constructor(private readonly alerts: AlertService) {}

  @Get()
  // Short: an alert's window is time-sensitive, and this bounds how stale the
  // bar can be after one expires (ALRT 007).
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Published alerts inside their display window, in the defined order' })
  @ApiOkResponse({ type: [PublicAlertDto] })
  async list() {
    return { data: await this.alerts.publicList() };
  }
}

/** Administration of service alerts (SRS 1.2 ALRT 007). */
@ApiTags('admin-website')
@Controller('admin/service-alerts')
export class AlertAdminController {
  constructor(private readonly alerts: AlertService) {}

  @RequirePermissions('website.alerts.view')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [ServiceAlertDto] })
  async list(@Query() query: ListAlertsQueryDto) {
    const { rows, total } = await this.alerts.list({ page: query.page, pageSize: query.pageSize, status: query.status, severity: query.severity, q: query.q });
    return { data: rows.map(toDto), meta: collectionMeta(query.page, query.pageSize, total) };
  }

  @RequirePermissions('website.alerts.view')
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ServiceAlertDto })
  async get(@Param('id') id: string) {
    return { data: toDto(await this.alerts.get(id)) };
  }

  @RequirePermissions('website.alerts.create')
  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ServiceAlertDto })
  async create(@Body() body: UpsertAlertDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: toDto(await this.alerts.create(body, admin, ctxOf(req))) };
  }

  @RequirePermissions('website.alerts.update')
  @Put(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ServiceAlertDto })
  async update(@Param('id') id: string, @Body() body: UpdateAlertDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: toDto(await this.alerts.update(id, body, admin, ctxOf(req))) };
  }

  @RequirePermissions('website.alerts.publish')
  @Post(':id/publish')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ServiceAlertDto })
  async publish(@Param('id') id: string, @Body() body: PublishAlertDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: toDto(await this.alerts.setPublished(id, true, body.expectedVersion, admin, ctxOf(req))) };
  }

  @RequirePermissions('website.alerts.publish')
  @Post(':id/unpublish')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ServiceAlertDto })
  async unpublish(@Param('id') id: string, @Body() body: PublishAlertDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: toDto(await this.alerts.setPublished(id, false, body.expectedVersion, admin, ctxOf(req))) };
  }

  @RequirePermissions('website.alerts.delete')
  @Delete(':id')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async remove(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.alerts.remove(id, admin, ctxOf(req));
  }
}
