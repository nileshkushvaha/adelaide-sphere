import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { getRequestId } from '../common/request-id.js';
import { CurrentAdmin, CurrentSession, RequirePermissions, type AuthenticatedRequest } from '../auth/decorators.js';
import type { RequestContext } from '../auth/auth.service.js';
import type { SessionSummary } from '../auth/session.service.js';
import { SessionListItemDto } from '../auth/dto/account.dto.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { SensitiveMutation } from '../authorization/decorators.js';
import { AdminsService } from './admins.service.js';
import { AdminCollectionDto, AdminEnvelopeDto, AdminStateChangeDto, CreateAdminDto, ListAdminsQueryDto, UpdateAdminDto } from './dto/admins.dto.js';

function contextOf(req: AuthenticatedRequest): RequestContext {
  return { ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req) };
}

@ApiTags('admin-admins')
@Controller('admin/admins')
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @RequirePermissions('admins.view')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List administrators (paginated; q, status, sort, order)' })
  @ApiOkResponse({ type: AdminCollectionDto })
  list(@Query() query: ListAdminsQueryDto) {
    return this.admins.list(query);
  }

  @RequirePermissions('admins.create')
  @Post()
  @SensitiveMutation()
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Create an invited administrator and send a setup link' })
  @ApiOkResponse({ type: AdminEnvelopeDto })
  async create(@Body() body: CreateAdminDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.admins.create(body, actor, contextOf(req)) };
  }

  @RequirePermissions('admins.view')
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminEnvelopeDto })
  async get(@Param('id') id: string) {
    return { data: await this.admins.get(id) };
  }

  @RequirePermissions('admins.update')
  @Patch(':id')
  @SensitiveMutation()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Update display name / roles (expectedVersion required)' })
  @ApiOkResponse({ type: AdminEnvelopeDto })
  async update(@Param('id') id: string, @Body() body: UpdateAdminDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.admins.update(id, body, actor, contextOf(req)) };
  }

  @RequirePermissions('admins.status')
  @Post(':id/disable')
  @SensitiveMutation()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Disable an administrator and revoke their sessions' })
  @ApiOkResponse({ type: AdminEnvelopeDto })
  async disable(@Param('id') id: string, @Body() body: AdminStateChangeDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.admins.disable(id, body.expectedVersion, body.reason, actor, contextOf(req)) };
  }

  @RequirePermissions('admins.status')
  @Post(':id/enable')
  @SensitiveMutation()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminEnvelopeDto })
  async enable(@Param('id') id: string, @Body() body: AdminStateChangeDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.admins.enable(id, body.expectedVersion, body.reason, actor, contextOf(req)) };
  }

  @RequirePermissions('admins.create')
  @Post(':id/resend-setup')
  @SensitiveMutation()
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Re-send the setup link for an invited administrator' })
  async resendSetup(@Param('id') id: string, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    await this.admins.resendSetup(id, actor, contextOf(req));
    return { data: { accepted: true } };
  }

  // Session administration is its own capability (SRS 1.2 SECS 005): a security
  // operator may end somebody's sessions without being able to create, disable
  // or re-invite administrators. The method-level declaration replaces the
  // class-level `admins.manage` for these three routes.
  @RequirePermissions('security.sessions.view')
  @Get(':id/sessions')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [SessionListItemDto] })
  async sessions(@Param('id') id: string, @CurrentSession() session: SessionSummary) {
    return { data: await this.admins.listSessions(id, session.id) };
  }

  @RequirePermissions('security.sessions.revoke')
  @Delete(':id/sessions')
  @SensitiveMutation()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Revoke all sessions of an administrator' })
  async revokeAll(@Param('id') id: string, @CurrentAdmin() actor: AdminPrincipal, @CurrentSession() session: SessionSummary, @Req() req: AuthenticatedRequest) {
    const revoked = await this.admins.revokeAllSessions(id, actor, contextOf(req), actor.id === id ? session.id : undefined);
    return { data: { revoked } };
  }

  @RequirePermissions('security.sessions.revoke')
  @Delete(':id/sessions/:sessionId')
  @SensitiveMutation()
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async revokeOne(@Param('id') id: string, @Param('sessionId') sessionId: string, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.admins.revokeSession(id, sessionId, actor, contextOf(req));
  }
}
