import { BadRequestException, Body, Controller, Get, Header, Headers, HttpCode, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { RequestContext } from '../auth/auth.service.js';
import { CurrentAdmin, Public, RequirePermissions, type AuthenticatedRequest } from '../auth/decorators.js';
import { IDEMPOTENCY_HEADER, IdempotencyService } from '../common/idempotency.service.js';
import { getRequestId } from '../common/request-id.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import {
  AdminReportDto,
  AdminReviewDto,
  InvestigateReportDto,
  ListAdminReportsQueryDto,
  ListAdminReviewsQueryDto,
  ListPublicReviewsQueryDto,
  ModerateReviewDto,
  PublicReviewDto,
  RedactReviewDto,
  ReportReceiptDto,
  ResolveReportDto,
  SubmissionReceiptDto,
  SubmitReportDto,
  SubmitReviewDto,
} from './dto/review.dto.js';
import { ReportsService } from './reports.service.js';
import { ReviewsService } from './reviews.service.js';

const ctxOf = (req: Request): RequestContext => ({ ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req as AuthenticatedRequest) });

/** Public reviews and reports (SRS section 15). Every write needs an Idempotency-Key (API 003). */
@ApiTags('public-reviews')
@Public()
@Controller()
export class ReviewsPublicController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly reports: ReportsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get('businesses/:id/reviews')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Approved reviews for a published business, newest first' })
  @ApiOkResponse({ type: [PublicReviewDto] })
  list(@Param('id') id: string, @Query() query: ListPublicReviewsQueryDto) {
    return this.reviews.publicList(id, query);
  }

  @Post('businesses/:id/reviews')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Submit a review for moderation (Idempotency-Key required)' })
  @ApiOkResponse({ type: SubmissionReceiptDto })
  async submit(@Param('id') id: string, @Body() body: SubmitReviewDto, @Headers(IDEMPOTENCY_HEADER) key: string | undefined, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.withIdempotency(`review:${id}`, key, body, res, 201, () => this.reviews.submit(id, body, ctxOf(req)));
  }

  @Post('reports')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Report an approved review (Idempotency-Key required)' })
  @ApiOkResponse({ type: ReportReceiptDto })
  async report(@Body() body: SubmitReportDto, @Headers(IDEMPOTENCY_HEADER) key: string | undefined, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.withIdempotency('report', key, body, res, 201, () => this.reports.submit(body, ctxOf(req)));
  }

  /** Replays return the original receipt without creating anything (SRS API 003). */
  private async withIdempotency<T>(scope: string, key: string | undefined, payload: unknown, res: Response, status: number, run: () => Promise<T>) {
    if (!key || key.trim().length < 8 || key.length > 200) {
      throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'An Idempotency-Key header of 8–200 characters is required', fields: {} });
    }
    const existing = await this.idempotency.lookup(scope, key, payload);
    if (existing) {
      res.status(existing.status);
      res.setHeader('Idempotent-Replay', 'true');
      return existing.body;
    }
    const data = await run();
    const body = { data } as Record<string, unknown>;
    await this.idempotency.remember(scope, key, payload, { status, body });
    return body;
  }
}

/** Review moderation (SRS REV 003). */
@ApiTags('admin-reviews')
@Controller('admin/reviews')
export class ReviewsAdminController {
  constructor(private readonly reviews: ReviewsService) {}

  @RequirePermissions('reviews.view')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List reviews (status, business, repeatFlagged, reported)' })
  @ApiOkResponse({ type: [AdminReviewDto] })
  list(@Query() query: ListAdminReviewsQueryDto) {
    return this.reviews.adminList(query);
  }

  @RequirePermissions('reviews.email.view')
  @Get(':id/email')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Reveal the reviewer’s private address. Every reveal is recorded.' })
  async reviewerEmail(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: { email: await this.reviews.revealEmail(id, admin, ctxOf(req)) } };
  }

  @RequirePermissions('reviews.view')
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminReviewDto })
  async get(@Param('id') id: string) {
    return { data: await this.reviews.adminGet(id) };
  }

  @RequirePermissions('reviews.moderate')
  @Post(':id/approve')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminReviewDto })
  async approve(@Param('id') id: string, @Body() body: ModerateReviewDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.reviews.moderate(id, 'approve', body, actor, ctxOf(req)) };
  }

  @RequirePermissions('reviews.moderate')
  @Post(':id/reject')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminReviewDto })
  async reject(@Param('id') id: string, @Body() body: ModerateReviewDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.reviews.moderate(id, 'reject', body, actor, ctxOf(req)) };
  }

  @RequirePermissions('reviews.moderate')
  @Post(':id/spam')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminReviewDto })
  async spam(@Param('id') id: string, @Body() body: ModerateReviewDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.reviews.moderate(id, 'spam', body, actor, ctxOf(req)) };
  }

  @RequirePermissions('reviews.redact')
  @Patch(':id/redaction')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Replace or restore the published text; the original and rating are never changed' })
  @ApiOkResponse({ type: AdminReviewDto })
  async redact(@Param('id') id: string, @Body() body: RedactReviewDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.reviews.redact(id, body, actor, ctxOf(req)) };
  }
}

/** Abuse report handling (SRS REP 002). */
@ApiTags('admin-reports')
@Controller('admin/reports')
export class ReportsAdminController {
  constructor(private readonly reports: ReportsService) {}

  @RequirePermissions('reports.email.view')
  @Get(':id/reporter-email')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Reveal the reporter’s address. Every reveal is recorded (SRS REP 001).' })
  async reporterEmail(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: { email: await this.reports.revealReporterEmail(id, admin, ctxOf(req)) } };
  }

  @RequirePermissions('reports.view')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [AdminReportDto] })
  list(@Query() query: ListAdminReportsQueryDto) {
    return this.reports.list(query);
  }

  @RequirePermissions('reports.view')
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminReportDto })
  async get(@Param('id') id: string) {
    return { data: await this.reports.get(id) };
  }

  @RequirePermissions('reports.manage')
  @Post(':id/investigate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminReportDto })
  async investigate(@Param('id') id: string, @Body() body: InvestigateReportDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.reports.investigate(id, body, actor, ctxOf(req)) };
  }

  @RequirePermissions('reports.manage')
  @Post(':id/resolve')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Record the outcome; removing content remains a separate review decision' })
  @ApiOkResponse({ type: AdminReportDto })
  async resolve(@Param('id') id: string, @Body() body: ResolveReportDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.reports.resolve(id, body, actor, ctxOf(req)) };
  }
}
