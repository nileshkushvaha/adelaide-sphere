import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestContext } from '../auth/auth.service.js';
import { CurrentAdmin, RequirePermissions, RequireAnyPermission, type AuthenticatedRequest } from '../auth/decorators.js';
import { getRequestId } from '../common/request-id.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { CategoryDto, CreateCategoryDto, CreateLocalAreaDto, CreateServiceDto, ListTermsQueryDto, LocalAreaDto, ServiceDto, TermStateDto, UpdateCategoryDto,
  CategoryListItemDto,
  ServiceListItemDto,
  LocalAreaListItemDto, UpdateLocalAreaDto, UpdateServiceDto } from './dto/taxonomy.dto.js';
import { TaxonomyService } from './taxonomy.service.js';

const ctxOf = (req: AuthenticatedRequest): RequestContext => ({ ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req) });

@ApiTags('admin-taxonomy')
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly taxonomy: TaxonomyService) {}
  @RequireAnyPermission('categories.view', 'listings.read', 'listings.create', 'listings.update')
  @Get() @Header('Cache-Control', 'no-store') @ApiExtraModels(CategoryListItemDto) @ApiOkResponse({ type: [CategoryListItemDto] }) @ApiOperation({ summary: 'List categories (q, status, sort, order, page, pageSize)' }) list(@Query() q: ListTermsQueryDto) { return this.taxonomy.listCategories(q); }
  @RequirePermissions('categories.create')
  @Post() @HttpCode(201) @Header('Cache-Control', 'no-store') @ApiOkResponse({ type: CategoryDto }) async create(@Body() body: CreateCategoryDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) { return { data: await this.taxonomy.createCategory(body, actor, ctxOf(req)) }; }
  @RequirePermissions('categories.view')
  @Get(':id') @Header('Cache-Control', 'no-store') @ApiOkResponse({ type: CategoryDto }) async get(@Param('id') id: string) { return { data: await this.taxonomy.getCategory(id) }; }
  @RequirePermissions('categories.update')
  @Patch(':id') @Header('Cache-Control', 'no-store') @ApiOkResponse({ type: CategoryDto }) async update(@Param('id') id: string, @Body() body: UpdateCategoryDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) { return { data: await this.taxonomy.updateCategory(id, body, actor, ctxOf(req)) }; }
  @RequirePermissions('categories.update')
  @Post(':id/deactivate') @HttpCode(200) @Header('Cache-Control', 'no-store') async deactivate(@Param('id') id: string, @Body() body: TermStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) { return { data: await this.taxonomy.setActive('category', id, false, body.expectedVersion, body.reason, actor, ctxOf(req)) }; }
  @RequirePermissions('categories.update')
  @Post(':id/activate') @HttpCode(200) @Header('Cache-Control', 'no-store') async activate(@Param('id') id: string, @Body() body: TermStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) { return { data: await this.taxonomy.setActive('category', id, true, body.expectedVersion, body.reason, actor, ctxOf(req)) }; }
}

@ApiTags('admin-taxonomy')
@Controller('admin/services')
export class AdminServicesController {
  constructor(private readonly taxonomy: TaxonomyService) {}
  @RequireAnyPermission('services.view', 'listings.read', 'listings.create', 'listings.update')
  @Get() @Header('Cache-Control', 'no-store') @ApiExtraModels(ServiceListItemDto) @ApiOkResponse({ type: [ServiceListItemDto] }) list(@Query() q: ListTermsQueryDto) { return this.taxonomy.listServices(q); }
  @RequirePermissions('services.create')
  @Post() @HttpCode(201) @Header('Cache-Control', 'no-store') @ApiOkResponse({ type: ServiceDto }) async create(@Body() body: CreateServiceDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) { return { data: await this.taxonomy.createService(body, actor, ctxOf(req)) }; }
  @RequirePermissions('services.view')
  @Get(':id') @Header('Cache-Control', 'no-store') @ApiOkResponse({ type: ServiceDto }) async get(@Param('id') id: string) { return { data: await this.taxonomy.getService(id) }; }
  @RequirePermissions('services.update')
  @Patch(':id') @Header('Cache-Control', 'no-store') @ApiOkResponse({ type: ServiceDto }) async update(@Param('id') id: string, @Body() body: UpdateServiceDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) { return { data: await this.taxonomy.updateService(id, body, actor, ctxOf(req)) }; }
  @RequirePermissions('services.update')
  @Post(':id/deactivate') @HttpCode(200) @Header('Cache-Control', 'no-store') async deactivate(@Param('id') id: string, @Body() body: TermStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) { return { data: await this.taxonomy.setActive('service', id, false, body.expectedVersion, body.reason, actor, ctxOf(req)) }; }
  @RequirePermissions('services.update')
  @Post(':id/activate') @HttpCode(200) @Header('Cache-Control', 'no-store') async activate(@Param('id') id: string, @Body() body: TermStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) { return { data: await this.taxonomy.setActive('service', id, true, body.expectedVersion, body.reason, actor, ctxOf(req)) }; }
}

@ApiTags('admin-taxonomy')
@Controller('admin/areas')
export class AdminLocalAreasController {
  constructor(private readonly taxonomy: TaxonomyService) {}
  @RequireAnyPermission('areas.view', 'listings.read', 'listings.create', 'listings.update')
  @Get() @Header('Cache-Control', 'no-store') @ApiExtraModels(LocalAreaListItemDto) @ApiOkResponse({ type: [LocalAreaListItemDto] }) list(@Query() q: ListTermsQueryDto) { return this.taxonomy.listLocalAreas(q); }
  @RequirePermissions('areas.create')
  @Post() @HttpCode(201) @Header('Cache-Control', 'no-store') @ApiOkResponse({ type: LocalAreaDto }) async create(@Body() body: CreateLocalAreaDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) { return { data: await this.taxonomy.createLocalArea(body, actor, ctxOf(req)) }; }
  @RequirePermissions('areas.view')
  @Get(':id') @Header('Cache-Control', 'no-store') @ApiOkResponse({ type: LocalAreaDto }) async get(@Param('id') id: string) { return { data: await this.taxonomy.getLocalArea(id) }; }
  @RequirePermissions('areas.update')
  @Patch(':id') @Header('Cache-Control', 'no-store') @ApiOkResponse({ type: LocalAreaDto }) async update(@Param('id') id: string, @Body() body: UpdateLocalAreaDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) { return { data: await this.taxonomy.updateLocalArea(id, body, actor, ctxOf(req)) }; }
  @RequirePermissions('areas.update')
  @Post(':id/deactivate') @HttpCode(200) @Header('Cache-Control', 'no-store') async deactivate(@Param('id') id: string, @Body() body: TermStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) { return { data: await this.taxonomy.setActive('localArea', id, false, body.expectedVersion, body.reason, actor, ctxOf(req)) }; }
  @RequirePermissions('areas.update')
  @Post(':id/activate') @HttpCode(200) @Header('Cache-Control', 'no-store') async activate(@Param('id') id: string, @Body() body: TermStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) { return { data: await this.taxonomy.setActive('localArea', id, true, body.expectedVersion, body.reason, actor, ctxOf(req)) }; }
}
