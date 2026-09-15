import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import type { EmailDeliveryStatus } from '@adelaide-sphere/database';
import { CurrentAdmin, RequirePermissions, type AuthenticatedRequest } from '../auth/decorators.js';
import type { RequestContext } from '../auth/auth.service.js';
import { getRequestId } from '../common/request-id.js';
import { PaginationQueryDto, collectionMeta } from '../common/pagination.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { EmailDeliveryService } from './email-delivery.service.js';
import { EMAIL_CATEGORIES, EMAIL_TEMPLATES } from './email-templates.js';
import { EmailDeliveryDetailDto, EmailDeliveryDto, EmailRecipientDto, ResendResultDto } from './dto/email-log.dto.js';

const STATUSES = ['queued', 'sent', 'delivered', 'delayed', 'failed', 'bounced', 'complained', 'suppressed'] as const;

const ctxOf = (req: AuthenticatedRequest): RequestContext => ({ ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req) });

export class ListEmailLogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: STATUSES }) @IsOptional() @IsIn(STATUSES) status?: EmailDeliveryStatus;
  @ApiPropertyOptional({ enum: EMAIL_CATEGORIES }) @IsOptional() @IsIn(EMAIL_CATEGORIES) category?: string;
  @ApiPropertyOptional({ enum: Object.keys(EMAIL_TEMPLATES) }) @IsOptional() @IsIn(Object.keys(EMAIL_TEMPLATES)) templateKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) provider?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsISO8601() to?: string;

  @ApiPropertyOptional({ description: 'Exact internal id, provider message id or related record id. Recipients are never searchable.', maxLength: 191 })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  search?: string;
}

/**
 * Transactional email delivery log (SRS 1.2 MAIL 010).
 *
 * Read-only by construction: there is no create, edit or delete route. The list
 * and detail views carry masked recipients; revealing one needs a separate
 * permission and is recorded (MAIL 005). Resend is a distinct permission again,
 * refuses a delivered, complained about or suppressed message, and is metered
 * by the privileged-mutation ceiling that already guards admin writes.
 */
@ApiTags('admin-email-logs')
@Controller('admin/email-logs')
export class EmailLogsController {
  constructor(private readonly deliveries: EmailDeliveryService) {}

  @RequirePermissions('system.email_logs.view')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Delivery log with masked recipients, filtered and paginated' })
  @ApiOkResponse({ type: [EmailDeliveryDto] })
  async list(@Query() query: ListEmailLogsQueryDto) {
    const { rows, total } = await this.deliveries.list({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      category: query.category,
      templateKey: query.templateKey,
      provider: query.provider,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      search: query.search,
    });
    return { data: rows.map(toDto), meta: collectionMeta(query.page, query.pageSize, total) };
  }

  @RequirePermissions('system.email_logs.view')
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: EmailDeliveryDetailDto })
  async detail(@Param('id') id: string) {
    const delivery = await this.deliveries.detail(id);
    return {
      data: {
        ...toDto(delivery),
        resentFromId: delivery.resentFromId,
        events: delivery.events.map((event) => ({
          type: event.type,
          occurredAt: event.occurredAt.toISOString(),
          receivedAt: event.receivedAt.toISOString(),
          detail: (event.detail ?? null) as Record<string, unknown> | null,
        })),
      },
    };
  }

  @RequirePermissions('system.email_logs.recipients.view')
  @Get(':id/recipient')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Reveal the recipient address. Every reveal is recorded (MAIL 005).' })
  @ApiOkResponse({ type: EmailRecipientDto })
  async recipient(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: { recipient: await this.deliveries.revealRecipient(id, admin, ctxOf(req)) } };
  }

  @RequirePermissions('system.email_logs.resend')
  @Post(':id/resend')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Create a new attempt linked to the original. Refused for delivered, complained or suppressed messages.' })
  @ApiOkResponse({ type: ResendResultDto })
  async resend(@Param('id') id: string, @Body() _body: Record<string, never>, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    const { replacement } = await this.deliveries.prepareResend(id, admin, ctxOf(req));
    return { data: { id: replacement.id, status: replacement.status, resentFromId: replacement.resentFromId } };
  }
}

function toDto(delivery: {
  id: string;
  provider: string;
  providerMessageId: string | null;
  templateKey: string;
  category: string;
  recipientMasked: string;
  subject: string | null;
  relatedType: string | null;
  relatedId: string | null;
  status: string;
  attempts: number;
  failureCode: string | null;
  failureSummary: string | null;
  requestId: string | null;
  createdAt: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
}) {
  return {
    id: delivery.id,
    provider: delivery.provider,
    providerMessageId: delivery.providerMessageId,
    templateKey: delivery.templateKey,
    category: delivery.category,
    recipient: delivery.recipientMasked,
    subject: delivery.subject,
    relatedType: delivery.relatedType,
    relatedId: delivery.relatedId,
    status: delivery.status,
    attempts: delivery.attempts,
    failureCode: delivery.failureCode,
    failureSummary: delivery.failureSummary,
    requestId: delivery.requestId,
    createdAt: delivery.createdAt.toISOString(),
    sentAt: delivery.sentAt?.toISOString() ?? null,
    deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
    failedAt: delivery.failedAt?.toISOString() ?? null,
  };
}
