import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MENU_ITEM_STYLES, MENU_ITEM_TYPE_KEYS, MENU_LIMITS, MENU_LOCATION_KEYS, type MenuItemStyle, type MenuItemType, type MenuLocationKey } from '@adelaide-sphere/domain';
import type { RequestContext } from '../auth/auth.service.js';
import { CurrentAdmin, Public, RequirePermissions, RequireAnyPermission, type AuthenticatedRequest } from '../auth/decorators.js';
import { getRequestId } from '../common/request-id.js';
import { PaginationQueryDto, collectionMeta } from '../common/pagination.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { MENU_LINK_SOURCE_TYPES, MenuLinkSourcesService, type MenuLinkSourceType } from './menu-link-sources.service.js';
import { MenuService } from './menu.service.js';
import type { MenuSourceState } from './menu-resolver.js';

const ctxOf = (req: AuthenticatedRequest): RequestContext => ({ ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req) });

const SOURCE_STATES: readonly MenuSourceState[] = ['ok', 'unpublished', 'scheduled', 'inactive', 'missing'];

// ---- response shapes -------------------------------------------------------

export class MenuSourceDto {
  @ApiProperty({ enum: SOURCE_STATES, description: 'Whether the public can see what the item links to.' }) state!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) title!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) href!: string | null;
}

export class AdminMenuItemDto {
  @ApiProperty() key!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) parentKey!: string | null;
  @ApiProperty({ enum: MENU_ITEM_TYPE_KEYS }) type!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) refId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) routeKey!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) url!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) label!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) titleAttribute!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) icon!: string | null;
  @ApiProperty({ enum: MENU_ITEM_STYLES }) style!: string;
  @ApiProperty() openInNewTab!: boolean;
  @ApiProperty() relNofollow!: boolean;
  @ApiProperty({ type: MenuSourceDto }) source!: MenuSourceDto;
}

export class AdminMenuSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() version!: number;
  @ApiProperty() itemCount!: number;
  @ApiProperty({ enum: MENU_LOCATION_KEYS, isArray: true }) locations!: string[];
  @ApiProperty() updatedAt!: string;
}

export class AdminMenuDetailDto extends AdminMenuSummaryDto {
  @ApiProperty({ type: [AdminMenuItemDto] }) items!: AdminMenuItemDto[];
}

export class AdminMenuLocationDto {
  @ApiProperty({ enum: MENU_LOCATION_KEYS }) location!: string;
  @ApiProperty() label!: string;
  @ApiProperty() description!: string;
  @ApiProperty() maxDepth!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) menuId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) menuName!: string | null;
  @ApiProperty() version!: number;
  @ApiProperty() updatedAt!: string;
}

export class MenuLinkSourceDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() href!: string;
  @ApiProperty({ enum: SOURCE_STATES }) state!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) hint!: string | null;
}

export class PublicMenuItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Null for a heading that only groups its children.' }) href!: string | null;
  @ApiProperty() external!: boolean;
  @ApiProperty() newTab!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) rel!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) title!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) icon!: string | null;
  @ApiProperty({ enum: MENU_ITEM_STYLES }) style!: string;
  @ApiProperty({ type: () => [PublicMenuItemDto] }) children!: PublicMenuItemDto[];
}

export class PublicMenusDto {
  @ApiProperty({ type: [PublicMenuItemDto] }) primary!: PublicMenuItemDto[];
  @ApiProperty({ type: [PublicMenuItemDto] }) secondary!: PublicMenuItemDto[];
  @ApiProperty({ type: [PublicMenuItemDto] }) footer!: PublicMenuItemDto[];
  @ApiProperty({ type: [PublicMenuItemDto] }) footer_bottom!: PublicMenuItemDto[];
}

// ---- request bodies ----------------------------------------------------------

export class MenuItemInputDto {
  @ApiProperty({ maxLength: MENU_LIMITS.key }) @IsString() @MaxLength(MENU_LIMITS.key) key!: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MENU_LIMITS.key }) @IsOptional() @IsString() @MaxLength(MENU_LIMITS.key) parentKey?: string | null;
  @ApiProperty({ enum: MENU_ITEM_TYPE_KEYS }) @IsIn(MENU_ITEM_TYPE_KEYS as MenuItemType[]) type!: MenuItemType;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 64 }) @IsOptional() @IsString() @MaxLength(64) refId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 32 }) @IsOptional() @IsString() @MaxLength(32) routeKey?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MENU_LIMITS.url }) @IsOptional() @IsString() @MaxLength(MENU_LIMITS.url) url?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MENU_LIMITS.label }) @IsOptional() @IsString() @MaxLength(MENU_LIMITS.label) label?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MENU_LIMITS.titleAttribute }) @IsOptional() @IsString() @MaxLength(MENU_LIMITS.titleAttribute) titleAttribute?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MENU_LIMITS.description }) @IsOptional() @IsString() @MaxLength(MENU_LIMITS.description) description?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 40 }) @IsOptional() @IsString() @MaxLength(40) icon?: string | null;
  @ApiPropertyOptional({ enum: MENU_ITEM_STYLES }) @IsOptional() @IsIn(MENU_ITEM_STYLES as MenuItemStyle[]) style?: MenuItemStyle;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() openInNewTab?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() relNofollow?: boolean;
}

export class CreateMenuDto {
  @ApiProperty({ maxLength: MENU_LIMITS.name }) @IsString() @MaxLength(MENU_LIMITS.name) name!: string;
}

export class SaveMenuDto extends CreateMenuDto {
  @ApiProperty({ description: 'Version last read; a concurrent change is refused with 409.' }) @IsInt() @Min(1) expectedVersion!: number;

  @ApiProperty({ type: [MenuItemInputDto], description: 'The whole tree, flat, in display order, parents before children.' })
  @IsArray()
  @ArrayMaxSize(MENU_LIMITS.items)
  @ValidateNested({ each: true })
  @Type(() => MenuItemInputDto)
  items!: MenuItemInputDto[];
}

export class AssignMenuLocationDto {
  @ApiPropertyOptional({ type: String, nullable: true, description: 'The menu to show here, or null to show none.' }) @IsOptional() @IsString() @MaxLength(64) menuId?: string | null;
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
}

export class MenuLocationParamDto {
  @IsIn(MENU_LOCATION_KEYS as MenuLocationKey[]) location!: MenuLocationKey;
}

export class MenuLinkSourceQueryDto extends PaginationQueryDto {
  @ApiProperty({ enum: MENU_LINK_SOURCE_TYPES }) @IsIn(MENU_LINK_SOURCE_TYPES) type!: MenuLinkSourceType;
  @ApiPropertyOptional({ maxLength: 120 }) @IsOptional() @IsString() @MaxLength(120) q?: string;
  @ApiPropertyOptional({ enum: ['recent', 'title'], default: 'title' }) @IsOptional() @IsIn(['recent', 'title']) sort?: 'recent' | 'title';
}

// ---- controllers -------------------------------------------------------------

/** Resolved navigation for every location (SRS 1.9 MENU 005). */
@ApiTags('public-site')
@Public()
@Controller('site/menus')
export class MenuPublicController {
  constructor(private readonly menus: MenuService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'Visible navigation for the header, top bar and footer' })
  @ApiOkResponse({ type: PublicMenusDto })
  async list() {
    return { data: await this.menus.publicMenus() };
  }
}

/** Administration of navigation menus (SRS 1.9 MENU 002–003). */
@ApiTags('admin-website')
@Controller('admin/menus')
export class MenuAdminController {
  constructor(
    private readonly menus: MenuService,
    private readonly sources: MenuLinkSourcesService,
  ) {}

  @RequirePermissions('website.menus.view')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [AdminMenuSummaryDto] })
  async list(@Query() query: PaginationQueryDto) {
    const { rows, total } = await this.menus.list({ page: query.page, pageSize: query.pageSize });
    return { data: rows, meta: collectionMeta(query.page, query.pageSize, total) };
  }

  // Declared before `:id` so these paths are never read as a menu id.
  @RequirePermissions('website.menus.view')
  @Get('locations')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [AdminMenuLocationDto] })
  async locations() {
    return { data: await this.menus.locations() };
  }

  @RequirePermissions('website.menus.assign')
  @Put('locations/:location')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Show a menu in a location, or clear it' })
  @ApiOkResponse({ type: [AdminMenuLocationDto] })
  async assign(@Param() params: MenuLocationParamDto, @Body() body: AssignMenuLocationDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.menus.assignLocation(params.location, { menuId: body.menuId ?? null, expectedVersion: body.expectedVersion }, admin, ctxOf(req)) };
  }

  @RequirePermissions('website.menus.manage')
  @Get('link-sources')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Content a menu item can link to, for the add-items panels' })
  @ApiOkResponse({ type: [MenuLinkSourceDto] })
  async linkSources(@Query() query: MenuLinkSourceQueryDto) {
    const { rows, total } = await this.sources.search({ type: query.type, q: query.q, page: query.page, pageSize: query.pageSize, sort: query.sort ?? 'title' });
    return { data: rows, meta: collectionMeta(query.page, query.pageSize, total) };
  }

  @RequirePermissions('website.menus.view')
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminMenuDetailDto })
  async get(@Param('id') id: string) {
    return { data: await this.menus.get(id) };
  }

  @RequirePermissions('website.menus.manage')
  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminMenuDetailDto })
  async create(@Body() body: CreateMenuDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.menus.create(body, admin, ctxOf(req)) };
  }

  @RequirePermissions('website.menus.manage')
  @Put(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Save the whole menu tree in one transaction' })
  @ApiOkResponse({ type: AdminMenuDetailDto })
  async save(@Param('id') id: string, @Body() body: SaveMenuDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    const items = body.items.map((item) => ({ ...item, parentKey: item.parentKey ?? null }));
    return { data: await this.menus.save(id, { name: body.name, expectedVersion: body.expectedVersion, items }, admin, ctxOf(req)) };
  }

  @RequirePermissions('website.menus.manage')
  @Delete(':id')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async remove(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.menus.remove(id, admin, ctxOf(req));
  }
}

/**
 * Link search for the article editor (SRS 1.10 BLOG 004): the same titles,
 * addresses and publication states the menu builder uses, under the article
 * permission, so a writer can link to a page, article, category, area or
 * published business without knowing its address.
 */
@ApiTags('admin-blog')
@Controller('admin/editor/link-sources')
export class EditorLinkSourcesController {
  constructor(private readonly sources: MenuLinkSourcesService) {}

  @RequireAnyPermission('posts.create', 'posts.update', 'website.pages.create', 'website.pages.update')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Content an article can link to or show as a card' })
  @ApiOkResponse({ type: [MenuLinkSourceDto] })
  async search(@Query() query: MenuLinkSourceQueryDto) {
    const { rows, total } = await this.sources.search({ type: query.type, q: query.q, page: query.page, pageSize: query.pageSize, sort: query.sort ?? 'title' });
    return { data: rows, meta: collectionMeta(query.page, query.pageSize, total) };
  }
}
