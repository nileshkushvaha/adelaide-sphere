import { Body, Controller, Get, Header, Headers, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { CurrentAdmin, RequirePermissions, type AuthenticatedRequest } from '../auth/decorators.js';
import { getRequestId } from '../common/request-id.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { ApplyProposalDto, ApproveContentDto, ApproveImageDto, ReviewSlotDto, ConfirmFactsDto, GenerateDto, GenerateImageDto, ImageEvidenceQueryDto, QuoteImageComparisonDto, RejectImageDto, RequestImageComparisonDto, ProposePriceDto, ResolveOperationDto, ResumePaidCallsDto, TopicArticleSettingsDto, TopicVersionOnlyDto } from './ai-generation.dto.js';
import { AiGenerationService } from './ai-generation.service.js';

const context = (req: AuthenticatedRequest) => ({ ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req) });

/**
 * Generation, review, budget and pricing (AI SRS §10–14, §19). Default-deny:
 * every route names its permissions. Approving never publishes; applying a
 * proposal also needs the ordinary post update permission.
 */
@ApiTags('admin-ai-content')
@Controller('admin/ai-content')
export class AiGenerationController {
  constructor(private readonly service: AiGenerationService) {}

  @Header('Cache-Control', 'no-store')
  @Put('topics/:id/article')
  @RequirePermissions('ai_content.view', 'ai_content.review')
  async articleSettings(@Param('id') id: string, @Body() body: TopicArticleSettingsDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.service.setArticleSettings(id, body, admin, context(req)) };
  }

  @Header('Cache-Control', 'no-store')
  @Post('topics/:id/generate')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @RequirePermissions('ai_content.view', 'ai_content.generate')
  async generate(@Param('id') id: string, @Body() body: GenerateDto, @Headers('idempotency-key') key: string | undefined, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.service.generate(id, body, key, admin, context(req)) };
  }

  @Header('Cache-Control', 'no-store')
  @Get('topics/:id/generation')
  @RequirePermissions('ai_content.view')
  async history(@Param('id') id: string) {
    return { data: await this.service.history(id) };
  }

  @Header('Cache-Control', 'no-store')
  @Post('topics/:id/approve')
  @HttpCode(200)
  @RequirePermissions('ai_content.view', 'ai_content.approve')
  async approve(@Param('id') id: string, @Body() body: ApproveContentDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.service.approve(id, body, admin, context(req)) };
  }

  @Header('Cache-Control', 'no-store')
  @Post('topics/:id/recheck-facts')
  @HttpCode(200)
  @RequirePermissions('ai_content.view', 'ai_content.review')
  async recheck(@Param('id') id: string, @Body() body: TopicVersionOnlyDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.service.recheck(id, body.expectedVersion, admin, context(req)) };
  }

  @Header('Cache-Control', 'no-store')
  @Post('topics/:id/confirm-facts')
  @HttpCode(200)
  @RequirePermissions('ai_content.view', 'ai_content.review')
  async confirmFacts(@Param('id') id: string, @Body() body: ConfirmFactsDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.service.confirmFacts(id, body, admin, context(req)) };
  }

  @Header('Cache-Control', 'no-store')
  @Post('topics/:id/images')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @RequirePermissions('ai_content.view', 'ai_content.generate')
  async generateImage(@Param('id') id: string, @Body() body: GenerateImageDto, @Headers('idempotency-key') key: string | undefined, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.service.generateImage(id, body, key, admin, context(req)) };
  }

  /** What a controlled provider comparison would reserve (amendment 01): creates nothing. */
  @Header('Cache-Control', 'no-store')
  @Post('topics/:id/image-comparisons/quote')
  @HttpCode(200)
  @RequirePermissions('ai_content.view', 'ai_content.generate', 'ai_content.configure')
  async quoteImageComparison(@Param('id') id: string, @Body() body: QuoteImageComparisonDto) {
    return { data: await this.service.quoteImageComparison(id, body) };
  }

  /** Runs a confirmed comparison: one budgeted request per chosen provider setting, nothing attached. */
  @Header('Cache-Control', 'no-store')
  @Post('topics/:id/image-comparisons')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @RequirePermissions('ai_content.view', 'ai_content.generate', 'ai_content.configure')
  async requestImageComparison(@Param('id') id: string, @Body() body: RequestImageComparisonDto, @Headers('idempotency-key') key: string | undefined, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.service.requestImageComparison(id, body, key, admin, context(req)) };
  }

  /** Pilot evidence: every generated image with its provider, settings, timing, cost and media (no scoring). */
  @Header('Cache-Control', 'no-store')
  @Get('image-evidence')
  @RequirePermissions('ai_content.view', 'ai_content.configure')
  async imageEvidence(@Query() query: ImageEvidenceQueryDto) {
    return this.service.imageEvidence(query);
  }

  @Header('Cache-Control', 'no-store')
  @Get('topics/:id/images')
  @RequirePermissions('ai_content.view')
  async images(@Param('id') id: string) {
    return { data: await this.service.images(id) };
  }

  @Header('Cache-Control', 'no-store')
  @Post('images/:id/approve')
  @HttpCode(200)
  @RequirePermissions('ai_content.view', 'ai_content.approve', 'posts.update')
  async approveImage(@Param('id') id: string, @Body() body: ApproveImageDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.service.approveImage(id, body, admin, context(req)) };
  }

  @Header('Cache-Control', 'no-store')
  @Post('images/:id/reject')
  @HttpCode(200)
  @RequirePermissions('ai_content.view', 'ai_content.review')
  async rejectImage(@Param('id') id: string, @Body() body: RejectImageDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.service.rejectImage(id, body, admin, context(req)) };
  }

  @Header('Cache-Control', 'no-store')
  @Get('schedule')
  @RequirePermissions('ai_content.view')
  async schedule() {
    return { data: await this.service.schedule() };
  }

  @Header('Cache-Control', 'no-store')
  @Post('slots/:id/review')
  @HttpCode(200)
  @RequirePermissions('ai_content.view', 'ai_content.review')
  async reviewSlot(@Param('id') id: string, @Body() body: ReviewSlotDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.service.reviewSlot(id, body, admin, context(req)) };
  }

  @Header('Cache-Control', 'no-store')
  @Post('runs/:id/apply')
  @HttpCode(200)
  @RequirePermissions('ai_content.view', 'ai_content.generate', 'posts.update')
  async applyProposal(@Param('id') id: string, @Body() body: ApplyProposalDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.service.applyProposal(id, body, admin, context(req)) };
  }

  @Header('Cache-Control', 'no-store')
  @Post('operations/:id/resolve')
  @HttpCode(200)
  @RequirePermissions('ai_content.view', 'ai_content.configure')
  async resolve(@Param('id') id: string, @Body() body: ResolveOperationDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.service.resolve(id, body, admin, context(req)) };
  }

  @Header('Cache-Control', 'no-store')
  @Get('budget')
  @RequirePermissions('ai_content.view')
  async budget() {
    return { data: await this.service.budget() };
  }

  @Header('Cache-Control', 'no-store')
  @Post('budget/resume')
  @HttpCode(200)
  @RequirePermissions('ai_content.configure')
  async resume(@Body() body: ResumePaidCallsDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.service.resume(body.note, admin, context(req)) };
  }

  /** The reviewed image models and what each supports, for the price and settings forms (AI-IMAGE-PROVIDER-03). */
  @Header('Cache-Control', 'no-store')
  @Get('image-models')
  @RequirePermissions('ai_content.configure')
  imageModels() {
    return { data: this.service.imageModels() };
  }

  @Header('Cache-Control', 'no-store')
  @Get('prices')
  @RequirePermissions('ai_content.configure')
  async prices() {
    return { data: await this.service.prices() };
  }

  @Header('Cache-Control', 'no-store')
  @Post('prices')
  @RequirePermissions('ai_content.configure')
  async propose(@Body() body: ProposePriceDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.service.propose(body, admin, context(req)) };
  }

  @Header('Cache-Control', 'no-store')
  @Post('prices/:id/approve')
  @HttpCode(200)
  @RequirePermissions('ai_content.configure')
  async approvePrice(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.service.approvePrice(id, admin, context(req)) };
  }
}
