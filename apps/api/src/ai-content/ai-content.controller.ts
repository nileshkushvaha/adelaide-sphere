import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentAdmin,
  RequirePermissions,
  type AuthenticatedRequest,
} from '../auth/decorators.js';
import { getRequestId } from '../common/request-id.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { AiContentService } from './ai-content.service.js';
import {
  CreateTopicDto,
  ReorderTopicsDto,
  TopicActionDto,
  TopicDto,
  TopicPriorityDto,
  TopicQueryDto,
} from './ai-content.dto.js';
const context = (req: AuthenticatedRequest) => ({
  ip: req.ip ?? 'unknown',
  userAgent: req.headers['user-agent'],
  requestId: getRequestId(req),
});
@ApiTags('admin-ai-content')
@Controller('admin/ai-content')
export class AiContentController {
  constructor(private readonly service: AiContentService) {}
  @Header('Cache-Control', 'no-store')
  @Get('overview')
  @RequirePermissions('ai_content.view')
  async overview() {
    return { data: await this.service.overview() };
  }
  @Header('Cache-Control', 'no-store')
  @Get('topics')
  @RequirePermissions('ai_content.view')
  @ApiOkResponse({ type: [TopicDto] })
  list(@Query() query: TopicQueryDto) {
    return this.service.list(query);
  }
  @Header('Cache-Control', 'no-store')
  @Get('topics/:id')
  @RequirePermissions('ai_content.view')
  @ApiOkResponse({ type: TopicDto })
  async detail(@Param('id') id: string) {
    return { data: await this.service.detail(id) };
  }
  @Header('Cache-Control', 'no-store')
  @Post('topics')
  @RequirePermissions('ai_content.view', 'ai_content.manage_topics')
  @ApiCreatedResponse({ type: TopicDto })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async create(
    @Body() body: CreateTopicDto,
    @Headers('idempotency-key') key: string | undefined,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: AuthenticatedRequest,
  ) {
    return { data: await this.service.create(body, key, admin, context(req)) };
  }
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [TopicDto] })
  @Put('topics/reorder')
  @RequirePermissions('ai_content.view', 'ai_content.manage_topics')
  async reorder(
    @Body() body: ReorderTopicsDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: AuthenticatedRequest,
  ) {
    return {
      data: await this.service.reorder(body.items, admin, context(req)),
    };
  }
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: TopicDto })
  @Put('topics/:id/priority')
  @RequirePermissions('ai_content.view', 'ai_content.manage_topics')
  async priority(
    @Param('id') id: string,
    @Body() body: TopicPriorityDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: AuthenticatedRequest,
  ) {
    return {
      data: (
        await this.service.reorder([{ id, ...body }], admin, context(req))
      )[0],
    };
  }
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ type: TopicDto })
  @Post('topics/:id/actions')
  @RequirePermissions('ai_content.view', 'ai_content.manage_topics')
  async action(
    @Param('id') id: string,
    @Body() body: TopicActionDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: AuthenticatedRequest,
  ) {
    return { data: await this.service.action(id, body, admin, context(req)) };
  }
}
