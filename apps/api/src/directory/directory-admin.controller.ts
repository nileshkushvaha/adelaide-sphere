import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestContext } from '../auth/auth.service.js';
import { CurrentAdmin, RequirePermissions, type AuthenticatedRequest } from '../auth/decorators.js';
import { getRequestId } from '../common/request-id.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { FeaturedService } from './featured.service.js';
import { CreateFeaturedPlacementDto, FeaturedPlacementDto, UpdateFeaturedPlacementDto } from './dto/featured.dto.js';
import { DirectoryService } from './directory.service.js';
import { HoursDto, PutHoursDto } from './dto/hours.dto.js';
import { HoursService } from './hours/hours.service.js';
import { BusinessDto, BusinessStateDto, CreateBusinessDto, ListBusinessesQueryDto, UpdateBusinessDto, BusinessListItemDto } from './dto/business.dto.js';
import { ChangeSlugDto } from '../seo/dto/redirect.dto.js';

const ctxOf = (req: AuthenticatedRequest): RequestContext => ({ ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req) });

/** Admin listing management (SRS section 16, DirectoryModule). Reads need listings.read; writes listings.write; publication listings.publish. */
@ApiTags('admin-businesses')
@Controller('admin/businesses')
export class DirectoryAdminController {
  constructor(
    private readonly directory: DirectoryService,
    private readonly hours: HoursService,
  ) {}

  @RequirePermissions('listings.read')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List listings (q, status, categoryId, localAreaId, sort, order, page, pageSize)' })
  @ApiExtraModels(BusinessListItemDto)
  @ApiOkResponse({ type: [BusinessListItemDto] })
  list(@Query() q: ListBusinessesQueryDto) {
    return this.directory.list(q);
  }

  @RequirePermissions('listings.create')
  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: BusinessDto })
  async create(@Body() body: CreateBusinessDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.directory.create(body, actor, ctxOf(req)) };
  }

  @RequirePermissions('listings.read')
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: BusinessDto })
  async get(@Param('id') id: string, @CurrentAdmin() actor: AdminPrincipal) {
    return { data: await this.directory.get(id, actor) };
  }

  @RequirePermissions('listings.update')
  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Edit a draft/published listing (expectedVersion required)' })
  @ApiOkResponse({ type: BusinessDto })
  async update(@Param('id') id: string, @Body() body: UpdateBusinessDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.directory.update(id, body, actor, ctxOf(req)) };
  }

  @RequirePermissions('listings.publish')
  @Post(':id/slug')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Change the public slug; a published listing keeps a 301 from the old path (SRS SEO 004)' })
  @ApiOkResponse({ type: BusinessDto })
  async changeSlug(@Param('id') id: string, @Body() body: ChangeSlugDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.directory.changeSlug(id, body, actor, ctxOf(req)) };
  }

  @RequirePermissions('listings.publish')
  @Post(':id/publish')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Publish (draft → published); 409 PUBLICATION_BLOCKED / DUPLICATE_SUSPECTED' })
  @ApiOkResponse({ type: BusinessDto })
  async publish(@Param('id') id: string, @Body() body: BusinessStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.directory.transition(id, 'publish', body, actor, ctxOf(req)) };
  }

  @RequirePermissions('listings.publish')
  @Post(':id/unpublish')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: BusinessDto })
  async unpublish(@Param('id') id: string, @Body() body: BusinessStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.directory.transition(id, 'unpublish', body, actor, ctxOf(req)) };
  }

  @RequirePermissions('listings.publish')
  @Post(':id/archive')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: BusinessDto })
  async archive(@Param('id') id: string, @Body() body: BusinessStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.directory.transition(id, 'archive', body, actor, ctxOf(req)) };
  }

  @RequirePermissions('listings.publish')
  @Post(':id/restore')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: BusinessDto })
  async restore(@Param('id') id: string, @Body() body: BusinessStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.directory.transition(id, 'restore', body, actor, ctxOf(req)) };
  }

  @RequirePermissions('listings.read')
  @Get(':id/hours')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Operating hours (Australia/Adelaide wall clock) with the status evaluated now' })
  @ApiOkResponse({ type: HoursDto })
  async getHours(@Param('id') id: string) {
    return { data: await this.hours.get(id) };
  }

  @RequirePermissions('listings.update')
  @Put(':id/hours')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Replace the weekly schedule and exceptions atomically (expectedVersion)' })
  @ApiOkResponse({ type: HoursDto })
  async putHours(@Param('id') id: string, @Body() body: PutHoursDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.hours.put(id, body, actor, ctxOf(req)) };
  }
}

/** Manual featured placements (SRS DIR 007); `listings.publish` only. */
@ApiTags('admin-directory')
@Controller('admin/featured')
export class FeaturedAdminController {
  constructor(private readonly featured: FeaturedService) {}

  @RequirePermissions('featured.view')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'All placements with their current state' })
  @ApiOkResponse({ type: [FeaturedPlacementDto] })
  async list() {
    return { data: await this.featured.list() };
  }

  @RequirePermissions('featured.manage')
  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Feature a listing for a period; at most three ever appear per query' })
  @ApiOkResponse({ type: FeaturedPlacementDto })
  async create(@Body() body: CreateFeaturedPlacementDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.featured.create(body, actor, ctxOf(req)) };
  }

  @RequirePermissions('featured.manage')
  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: FeaturedPlacementDto })
  async update(@Param('id') id: string, @Body() body: UpdateFeaturedPlacementDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.featured.update(id, body, actor, ctxOf(req)) };
  }

  @RequirePermissions('featured.manage')
  @Delete(':id')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async remove(@Param('id') id: string, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    await this.featured.remove(id, actor, ctxOf(req));
  }
}
