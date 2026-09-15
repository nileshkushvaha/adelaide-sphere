import { BadRequestException, Body, Controller, Get, Header, Headers, HttpCode, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { RequestContext } from '../auth/auth.service.js';
import { CurrentAdmin, Public, RequirePermissions, type AuthenticatedRequest } from '../auth/decorators.js';
import { IDEMPOTENCY_HEADER, IdempotencyService } from '../common/idempotency.service.js';
import { getRequestId } from '../common/request-id.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { AdminEnquiryDto, EnquiryReceiptDto, ListEnquiriesQueryDto, RetryEnquiryDto, SubmitEnquiryDto, UpdateEnquiryDto } from './dto/enquiry.dto.js';
import { EnquiriesService } from './enquiries.service.js';

const ctxOf = (req: Request): RequestContext => ({ ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req as AuthenticatedRequest) });

/** Public enquiry submission (SRS section 15). 202 means durably accepted, never delivered. */
@ApiTags('public-enquiries')
@Public()
@Controller()
export class EnquiriesPublicController {
  constructor(
    private readonly enquiries: EnquiriesService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('businesses/:id/enquiries')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Send an enquiry to a business (Idempotency-Key required)' })
  @ApiOkResponse({ type: EnquiryReceiptDto })
  async submit(@Param('id') id: string, @Body() body: SubmitEnquiryDto, @Headers(IDEMPOTENCY_HEADER) key: string | undefined, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.withIdempotency(`enquiry:${id}`, key, body, res, () => this.enquiries.submit(id, body, ctxOf(req)));
  }

  @Post('contact')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'General site enquiry using the same durable pipeline (SRS ENQ 002)' })
  @ApiOkResponse({ type: EnquiryReceiptDto })
  async contact(@Body() body: SubmitEnquiryDto, @Headers(IDEMPOTENCY_HEADER) key: string | undefined, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.withIdempotency('contact', key, body, res, () => this.enquiries.submit(null, body, ctxOf(req)));
  }

  private async withIdempotency<T>(scope: string, key: string | undefined, payload: unknown, res: Response, run: () => Promise<T>) {
    if (!key || key.trim().length < 8 || key.length > 200) {
      throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'An Idempotency-Key header of 8\u2013200 characters is required', fields: {} });
    }
    const existing = await this.idempotency.lookup(scope, key, payload);
    if (existing) {
      res.status(existing.status);
      res.setHeader('Idempotent-Replay', 'true');
      return existing.body;
    }
    const data = await run();
    const body = { data } as Record<string, unknown>;
    await this.idempotency.remember(scope, key, payload, { status: 202, body });
    return body;
  }
}

/** Enquiry handling (SRS ENQ 007): restricted, never public, never exported in bulk. */
@ApiTags('admin-enquiries')
@Controller('admin/enquiries')
export class EnquiriesAdminController {
  constructor(private readonly enquiries: EnquiriesService) {}

  @RequirePermissions('enquiries.read')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List enquiries (handling status, delivery status, business)' })
  @ApiOkResponse({ type: [AdminEnquiryDto] })
  list(@Query() query: ListEnquiriesQueryDto) {
    return this.enquiries.list(query);
  }

  @RequirePermissions('enquiries.read')
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminEnquiryDto })
  async get(@Param('id') id: string) {
    return { data: await this.enquiries.get(id) };
  }

  @RequirePermissions('enquiries.contact.view')
  @Get(':id/contact')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Reveal the visitor’s contact details. Every reveal is recorded (SRS ENQ 007).' })
  async contact(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.enquiries.revealContact(id, admin, ctxOf(req)) };
  }

  @RequirePermissions('enquiries.manage')
  @Patch(':id')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Change the handling status (independent of delivery)' })
  @ApiOkResponse({ type: AdminEnquiryDto })
  async update(@Param('id') id: string, @Body() body: UpdateEnquiryDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.enquiries.updateHandling(id, body, actor, ctxOf(req)) };
  }

  @RequirePermissions('enquiries.retry')
  @Post(':id/retry')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Re-queue a failed or suppressed delivery (audited)' })
  @ApiOkResponse({ type: AdminEnquiryDto })
  async retry(@Param('id') id: string, @Body() body: RetryEnquiryDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.enquiries.retryDelivery(id, body, actor, ctxOf(req)) };
  }
}
