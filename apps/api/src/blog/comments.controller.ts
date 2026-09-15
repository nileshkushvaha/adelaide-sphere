import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestContext } from '../auth/auth.service.js';
import { CurrentAdmin, RequirePermissions, type AuthenticatedRequest } from '../auth/decorators.js';
import { getRequestId } from '../common/request-id.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { CommentsService } from './comments.service.js';
import { AdminCommentDto, ListAdminCommentsQueryDto, ModerateCommentDto, RedactCommentDto, StaffReplyDto } from './dto/comment.dto.js';

const ctxOf = (req: AuthenticatedRequest): RequestContext => ({ ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req) });

/** Comment moderation (SRS COM 001): the same states and rules as reviews. */
@ApiTags('admin-comments')
@Controller('admin/comments')
export class CommentsAdminController {
  constructor(private readonly comments: CommentsService) {}

  @RequirePermissions('comments.view')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List comments (status, post, reported)' })
  @ApiOkResponse({ type: [AdminCommentDto] })
  list(@Query() query: ListAdminCommentsQueryDto) {
    return this.comments.adminList(query);
  }

  @RequirePermissions('comments.email.view')
  @Get(':id/email')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Reveal the commenter’s private address. Every reveal is recorded.' })
  async commenterEmail(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: { email: await this.comments.revealEmail(id, admin, ctxOf(req)) } };
  }

  @RequirePermissions('comments.view')
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminCommentDto })
  async get(@Param('id') id: string) {
    return { data: await this.comments.adminGet(id) };
  }

  @RequirePermissions('comments.moderate')
  @Post(':id/approve')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminCommentDto })
  async approve(@Param('id') id: string, @Body() body: ModerateCommentDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.comments.moderate(id, 'approve', body, actor, ctxOf(req)) };
  }

  @RequirePermissions('comments.moderate')
  @Post(':id/reject')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminCommentDto })
  async reject(@Param('id') id: string, @Body() body: ModerateCommentDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.comments.moderate(id, 'reject', body, actor, ctxOf(req)) };
  }

  @RequirePermissions('comments.moderate')
  @Post(':id/spam')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminCommentDto })
  async spam(@Param('id') id: string, @Body() body: ModerateCommentDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.comments.moderate(id, 'spam', body, actor, ctxOf(req)) };
  }

  @RequirePermissions('comments.redact')
  @Patch(':id/redaction')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Replace or restore the published text; the original is always kept' })
  @ApiOkResponse({ type: AdminCommentDto })
  async redact(@Param('id') id: string, @Body() body: RedactCommentDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.comments.redact(id, body, actor, ctxOf(req)) };
  }

  @RequirePermissions('comments.reply')
  @Post(':id/reply')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Reply as the Adelaide Sphere team; published at once and recorded' })
  @ApiOkResponse({ type: AdminCommentDto })
  async reply(@Param('id') id: string, @Body() body: StaffReplyDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.comments.staffReply(id, body, actor, ctxOf(req)) };
  }
}
