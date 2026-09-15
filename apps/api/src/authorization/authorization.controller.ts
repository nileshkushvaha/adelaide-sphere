import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Put, Patch, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentAdmin, RequirePermissions, type AuthenticatedRequest } from '../auth/decorators.js';
import { SensitiveMutation } from './decorators.js';
import { getRequestId } from '../common/request-id.js';
import { PaginationQueryDto } from '../common/pagination.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { AuthorizationService, type RequestContext } from './authorization.service.js';
import { CreateRoleDto, ReplaceAdminPermissionsDto, ReplaceAdminRolesDto, ReplaceRolePermissionsDto, UpdateRoleDto } from './dto/authorization.dto.js';

function contextOf(req: AuthenticatedRequest): RequestContext {
  return { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null, requestId: getRequestId(req) };
}

export class ListRolesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Matches the role key or name', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

/**
 * Access administration (SRS RBAC 008). Every route declares its permission, so
 * the global default-deny guard enforces it before the handler runs; reading and
 * granting are separate permissions, and nothing here is reachable with a
 * session alone.
 */
@ApiTags('admin-authorization')
@Controller('admin')
export class AuthorizationController {
  constructor(private readonly authorization: AuthorizationService) {}

  @Get('permissions')
  @RequirePermissions('permissions.view')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'The registered permission catalogue, grouped by module (read-only)' })
  async permissions() {
    return { data: await this.authorization.listPermissions() };
  }

  @Get('roles')
  @RequirePermissions('roles.view')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List roles (paginated; q)' })
  async listRoles(@Query() query: ListRolesQueryDto) {
    return this.authorization.listRoles({ page: query.page, pageSize: query.pageSize, q: query.q });
  }

  @Get('roles/:id')
  @RequirePermissions('roles.view')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'One role with the permissions it carries' })
  async getRole(@Param('id') id: string) {
    return { data: await this.authorization.getRole(id) };
  }

  @Post('roles')
  @RequirePermissions('roles.create')
  @SensitiveMutation()
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Create a role' })
  async createRole(@Body() body: CreateRoleDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.authorization.createRole(body, actor, contextOf(req)) };
  }

  @Patch('roles/:id')
  @RequirePermissions('roles.update')
  @SensitiveMutation()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Edit role details or activation (expectedVersion required)' })
  async updateRole(@Param('id') id: string, @Body() body: UpdateRoleDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.authorization.updateRole(id, body, actor, contextOf(req)) };
  }

  @Put('roles/:id/permissions')
  @RequirePermissions('roles.update')
  @SensitiveMutation()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: "Replace a role's permissions completely (idempotent; expectedVersion required)" })
  async replaceRolePermissions(
    @Param('id') id: string,
    @Body() body: ReplaceRolePermissionsDto,
    @CurrentAdmin() actor: AdminPrincipal,
    @Req() req: AuthenticatedRequest,
  ) {
    return { data: await this.authorization.replaceRolePermissions(id, body, actor, contextOf(req)) };
  }

  @Delete('roles/:id')
  @RequirePermissions('roles.delete')
  @SensitiveMutation()
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Delete an unused, non-system role' })
  async deleteRole(@Param('id') id: string, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    await this.authorization.deleteRole(id, actor, contextOf(req));
  }

  @Get('admins/:id/access')
  @RequirePermissions('admins.view')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: "An administrator's roles, direct permissions, effective permissions and their sources" })
  async adminAccess(@Param('id') id: string) {
    return { data: await this.authorization.getAdminAccess(id) };
  }

  @Put('admins/:id/roles')
  @RequirePermissions('admins.access.manage')
  @SensitiveMutation()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: "Replace an administrator's roles completely (expectedVersion required)" })
  async replaceAdminRoles(@Param('id') id: string, @Body() body: ReplaceAdminRolesDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.authorization.replaceAdminRoles(id, body, actor, contextOf(req)) };
  }

  @Put('admins/:id/permissions')
  @RequirePermissions('admins.access.manage')
  @SensitiveMutation()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: "Replace an administrator's direct permissions completely (expectedVersion required)" })
  async replaceAdminPermissions(
    @Param('id') id: string,
    @Body() body: ReplaceAdminPermissionsDto,
    @CurrentAdmin() actor: AdminPrincipal,
    @Req() req: AuthenticatedRequest,
  ) {
    return { data: await this.authorization.replaceAdminPermissions(id, body, actor, contextOf(req)) };
  }
}
