import { Body, Controller, Get, Header, Headers, HttpCode, Param, Patch, Post, Put, Req } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { CurrentAdmin, RequirePermissions, type AuthenticatedRequest } from '../auth/decorators.js';
import { getRequestId } from '../common/request-id.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { AddClaimDto, ResearchActionDto, ResearchSourceInputDto, ResolveClaimDto, TopicSourcesDto, UpdateResearchSourceDto } from './ai-research.dto.js';
import { AiResearchService } from './ai-research.service.js';

const context = (req: AuthenticatedRequest) => ({ ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req) });

/**
 * Research, fact review and discovery (AI SRS §7, §9, §14). Every route sits
 * behind the default-deny admin guard chain; writes need review (or configure
 * for the source registry) on top of view.
 */
@ApiTags('admin-ai-content')
@Controller('admin/ai-content')
export class AiResearchController {
  constructor(private readonly service: AiResearchService) {}

  @Header('Cache-Control', 'no-store')
  @Get('topics/:id/research')
  @RequirePermissions('ai_content.view')
  async research(@Param('id') id: string) {
    return { data: await this.service.research(id) };
  }

  @Header('Cache-Control', 'no-store')
  @Post('topics/:id/novelty')
  @HttpCode(200)
  @RequirePermissions('ai_content.view', 'ai_content.review')
  async novelty(@Param('id') id: string) {
    return { data: await this.service.checkNovelty(id) };
  }

  @Header('Cache-Control', 'no-store')
  @Put('topics/:id/sources')
  @RequirePermissions('ai_content.view', 'ai_content.review')
  async sources(@Param('id') id: string, @Body() body: TopicSourcesDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.service.setSources(id, body, admin, context(req)) };
  }

  @Header('Cache-Control', 'no-store')
  @Post('topics/:id/research')
  @HttpCode(200)
  @RequirePermissions('ai_content.view', 'ai_content.review')
  async researchAction(@Param('id') id: string, @Body() body: ResearchActionDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.service.researchAction(id, body, admin, context(req)) };
  }

  @Header('Cache-Control', 'no-store')
  @Post('claims/:id/resolve')
  @HttpCode(200)
  @RequirePermissions('ai_content.view', 'ai_content.review')
  async resolve(@Param('id') id: string, @Body() body: ResolveClaimDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.service.resolve(id, body, admin, context(req)) };
  }

  @Header('Cache-Control', 'no-store')
  @Post('packets/:id/claims')
  @RequirePermissions('ai_content.view', 'ai_content.review')
  async addClaim(@Param('id') id: string, @Body() body: AddClaimDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.service.addClaim(id, body, admin, context(req)) };
  }

  @Header('Cache-Control', 'no-store')
  @Post('discovery')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @RequirePermissions('ai_content.view', 'ai_content.review')
  async discover(@Headers('idempotency-key') key: string | undefined, @CurrentAdmin() admin: AdminPrincipal) {
    return { data: await this.service.discover(key, admin) };
  }

  @Header('Cache-Control', 'no-store')
  @Get('discovery/:id')
  @RequirePermissions('ai_content.view', 'ai_content.review')
  async discovery(@Param('id') id: string) {
    return { data: await this.service.operation(id) };
  }

  @Header('Cache-Control', 'no-store')
  @Get('sources')
  @RequirePermissions('ai_content.configure')
  async listSources() {
    return { data: await this.service.listSources() };
  }

  @Header('Cache-Control', 'no-store')
  @Post('sources')
  @RequirePermissions('ai_content.configure')
  async createSource(@Body() body: ResearchSourceInputDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.service.createSource(body, admin, context(req)) };
  }

  @Header('Cache-Control', 'no-store')
  @Patch('sources/:id')
  @RequirePermissions('ai_content.configure')
  async updateSource(@Param('id') id: string, @Body() body: UpdateResearchSourceDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.service.updateSource(id, body, admin, context(req)) };
  }
}
