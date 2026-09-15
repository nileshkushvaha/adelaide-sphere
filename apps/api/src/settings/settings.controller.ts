import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Put, Req, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestContext } from '../auth/auth.service.js';
import { CurrentAdmin, CurrentSession, Public, RequirePermissions, type AuthenticatedRequest } from '../auth/decorators.js';
import type { SessionSummary } from '../auth/session.service.js';
import { getRequestId } from '../common/request-id.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { HomeSettingsRecordDto, PublicHomeDto, UpdateHomeSettingsDto } from './dto/settings.dto.js';
import { SeoSettingsRecordDto, UpdateSeoSettingsDto } from './dto/seo-settings.dto.js';
import { GeneralSettingsRecordDto, PublicSiteSettingsDto, UpdateGeneralSettingsDto } from './dto/general-settings.dto.js';
import { SettingsService } from './settings.service.js';
import { StaticPagesService } from './static-pages.service.js';
import {
  CreateStaticPageDto,
  ListStaticPagesQueryDto,
  PublicStaticPageDto,
  PublicStaticPageSummaryDto,
  RestoreStaticPageRevisionDto,
  SaveStaticPageAutosaveDto,
  StaticPageAutosaveDto,
  StaticPageAutosaveReceiptDto,
  StaticPageDto,
  StaticPagePreviewLinkDto,
  StaticPageRevisionDetailDto,
  StaticPageRevisionDto,
  StaticPageStateDto,
  UpdateStaticPageDto,
  ChangeStaticPageAddressDto,
  DuplicateStaticPageDto,
  ScheduleStaticPageDto,
  UnpublishStaticPageDto,
} from './dto/static-page.dto.js';

const ctxOf = (req: AuthenticatedRequest): RequestContext => ({ ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req) });

/** Public home payload (SRS section 15: `GET /home`). Featured placements and latest posts join in later phases. */
@ApiTags('public-site')
@Public()
@Controller('home')
export class HomePublicController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Hero content and optional published-record counters' })
  @ApiOkResponse({ type: PublicHomeDto })
  async home() {
    return { data: await this.settings.publicHome() };
  }
}

/** Public shell settings (SRS CFG 001): the name, contact details, branding, header bar and footer the public site renders. */
@ApiTags('public-site')
@Public()
@Controller('site')
export class SiteSettingsPublicController {
  constructor(private readonly settings: SettingsService) {}

  @Get('settings')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'Application name, contact details, branding, header bar and footer' })
  @ApiOkResponse({ type: PublicSiteSettingsDto })
  async settingsPayload() {
    return { data: await this.settings.publicSiteSettings() };
  }
}

/** Editable site settings (SRS CFG 001); `settings.manage` only. */
@ApiTags('admin-settings')
@Controller('admin/settings')
export class SettingsAdminController {
  constructor(private readonly settings: SettingsService) {}

  @RequirePermissions('settings.home.view')
  @Get('home')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: HomeSettingsRecordDto })
  async get() {
    return { data: await this.settings.homeSettings() };
  }

  @RequirePermissions('settings.general.view')
  @Get('general')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Application information, branding, header bar and footer' })
  @ApiOkResponse({ type: GeneralSettingsRecordDto })
  async getGeneral() {
    return { data: await this.settings.generalSettings() };
  }

  @RequirePermissions('settings.general.update')
  @Put('general')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Replace the general settings (expectedVersion; audited)' })
  @ApiOkResponse({ type: GeneralSettingsRecordDto })
  async putGeneral(@Body() body: UpdateGeneralSettingsDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.settings.updateGeneralSettings(body, actor, ctxOf(req)) };
  }

  @RequirePermissions('settings.seo.view')
  @Get('seo')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Search and social metadata for routes with no record of their own' })
  @ApiOkResponse({ type: SeoSettingsRecordDto })
  async getSeo() {
    return { data: await this.settings.seoSettings() };
  }

  @RequirePermissions('settings.seo.update')
  @Put('seo')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Replace the SEO settings (expectedVersion; audited)' })
  @ApiOkResponse({ type: SeoSettingsRecordDto })
  async putSeo(@Body() body: UpdateSeoSettingsDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.settings.updateSeoSettings(body, actor, ctxOf(req)) };
  }

  @RequirePermissions('settings.home.update')
  @Put('home')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Replace the home settings (expectedVersion; audited)' })
  @ApiOkResponse({ type: HomeSettingsRecordDto })
  async put(@Body() body: UpdateHomeSettingsDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.settings.updateHomeSettings(body, actor, ctxOf(req)) };
  }
}

/** Information pages (SRS CFG 002, change log 1.17); each route declares its `website.pages.*` permission. */
@ApiTags('admin-settings')
@Controller('admin/pages')
export class StaticPagesAdminController {
  constructor(private readonly pages: StaticPagesService) {}

  @RequirePermissions('website.pages.view')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Every page, including ones never edited (q, status)' })
  @ApiOkResponse({ type: [StaticPageDto] })
  async list(@Query() query: ListStaticPagesQueryDto) {
    return { data: await this.pages.list(query) };
  }

  @RequirePermissions('website.pages.create')
  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Create a page at a chosen address; reserved and taken addresses are refused (SRS 1.7)' })
  @ApiOkResponse({ type: StaticPageDto })
  async create(@Body() body: CreateStaticPageDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.pages.create(body, actor, ctxOf(req)) };
  }

  @RequirePermissions('website.pages.view')
  @Get(':slug')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: StaticPageDto })
  async get(@Param('slug') slug: string) {
    return { data: await this.pages.get(slug) };
  }

  @RequirePermissions('website.pages.delete')
  @Delete(':slug')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Delete a custom page. A system page, or one still published, is refused.' })
  async remove(@Param('slug') slug: string, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    await this.pages.remove(slug, actor, ctxOf(req));
  }

  @RequirePermissions('website.pages.update')
  @Put(':slug')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Save the page; editing published text keeps a revision' })
  @ApiOkResponse({ type: StaticPageDto })
  async update(@Param('slug') slug: string, @Body() body: UpdateStaticPageDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.pages.update(slug, body, actor, ctxOf(req)) };
  }

  @RequirePermissions('website.pages.publish')
  @Post(':slug/publish')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Publish; 409 PUBLICATION_BLOCKED lists what is missing (SRS CFG 002)' })
  @ApiOkResponse({ type: StaticPageDto })
  async publish(@Param('slug') slug: string, @Body() body: StaticPageStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.pages.setStatus(slug, 'published', body, actor, ctxOf(req)) };
  }

  @RequirePermissions('website.pages.publish')
  @Post(':slug/unpublish')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: StaticPageDto })
  async unpublish(@Param('slug') slug: string, @Body() body: UnpublishStaticPageDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.pages.setStatus(slug, 'draft', body, actor, ctxOf(req)) };
  }

  @RequirePermissions('website.pages.publish')
  @Post(':slug/schedule')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Publish at a future time; the same checks run now and when the time comes (change log 1.17)' })
  @ApiOkResponse({ type: StaticPageDto })
  async schedule(@Param('slug') slug: string, @Body() body: ScheduleStaticPageDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.pages.schedule(slug, body, actor, ctxOf(req)) };
  }

  @RequirePermissions('website.pages.publish')
  @Post(':slug/unschedule')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: StaticPageDto })
  async unschedule(@Param('slug') slug: string, @Body() body: StaticPageStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.pages.unschedule(slug, body, actor, ctxOf(req)) };
  }

  @RequirePermissions('website.pages.publish')
  @Post(':slug/address')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Move a custom page to a new address; a published page leaves a permanent redirect (SEO 004)' })
  @ApiOkResponse({ type: StaticPageDto })
  async changeAddress(@Param('slug') slug: string, @Body() body: ChangeStaticPageAddressDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.pages.changeAddress(slug, body, actor, ctxOf(req)) };
  }

  @RequirePermissions('website.pages.create')
  @Post(':slug/duplicate')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Copy the page into a new draft at another address' })
  @ApiOkResponse({ type: StaticPageDto })
  async duplicate(@Param('slug') slug: string, @Body() body: DuplicateStaticPageDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.pages.duplicate(slug, body, actor, ctxOf(req)) };
  }

  @RequirePermissions('website.pages.view')
  @Post(':slug/preview-link')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'A private ten-minute link to the page in the public design, including the caller’s unsaved changes (change log 1.17)' })
  @ApiOkResponse({ type: StaticPagePreviewLinkDto })
  async previewLink(@Param('slug') slug: string, @CurrentSession() session: SessionSummary, @CurrentAdmin() actor: AdminPrincipal) {
    return { data: await this.pages.createPreviewLink(slug, session.id, actor) };
  }

  @RequirePermissions('website.pages.view')
  @Get(':slug/revisions')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Earlier versions of the page, newest first (up to 50)' })
  @ApiOkResponse({ type: [StaticPageRevisionDto] })
  async revisions(@Param('slug') slug: string) {
    return { data: await this.pages.revisions(slug) };
  }

  @RequirePermissions('website.pages.view')
  @Get(':slug/revisions/:revisionId')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: StaticPageRevisionDetailDto })
  async revision(@Param('slug') slug: string, @Param('revisionId') revisionId: string) {
    return { data: await this.pages.revisionDetail(slug, revisionId) };
  }

  @RequirePermissions('website.pages.update')
  @Post(':slug/revisions/:revisionId/restore')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Restore an earlier version’s title and sections; the current content is kept as a version first' })
  @ApiOkResponse({ type: StaticPageDto })
  async restoreRevision(@Param('slug') slug: string, @Param('revisionId') revisionId: string, @Body() body: RestoreStaticPageRevisionDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.pages.restoreRevision(slug, revisionId, body.expectedVersion, actor, ctxOf(req)) };
  }

  @RequirePermissions('website.pages.update')
  @Get(':slug/autosave')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'The caller’s kept copy of unsaved changes, or null' })
  @ApiOkResponse({ type: StaticPageAutosaveDto })
  async autosave(@Param('slug') slug: string, @CurrentAdmin() actor: AdminPrincipal) {
    return { data: await this.pages.getAutosave(slug, actor) };
  }

  @RequirePermissions('website.pages.update')
  @Put(':slug/autosave')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Keep a private copy of unsaved changes; never changes the page' })
  @ApiOkResponse({ type: StaticPageAutosaveReceiptDto })
  async saveAutosave(@Param('slug') slug: string, @Body() body: SaveStaticPageAutosaveDto, @CurrentAdmin() actor: AdminPrincipal) {
    return { data: await this.pages.saveAutosave(slug, body, actor) };
  }

  @RequirePermissions('website.pages.update')
  @Delete(':slug/autosave')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async discardAutosave(@Param('slug') slug: string, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    await this.pages.discardAutosave(slug, actor, ctxOf(req));
  }
}

/** A page behind a private preview link (change log 1.17): never cached, never indexed, 404 once expired. */
@ApiTags('public-site')
@Public()
@Controller('preview/pages')
export class StaticPagePreviewController {
  constructor(private readonly pages: StaticPagesService) {}

  @Get(':token')
  @Header('Cache-Control', 'no-store, private')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @Header('Referrer-Policy', 'no-referrer')
  @ApiOperation({ summary: 'A page behind a preview link issued to a signed-in editor' })
  @ApiOkResponse({ type: PublicStaticPageDto })
  async preview(@Param('token') token: string) {
    return { data: await this.pages.previewByToken(token) };
  }
}

/** Published information pages for the public site (SRS CFG 002). */
@ApiTags('public-site')
@Public()
@Controller('pages')
export class StaticPagesPublicController {
  constructor(private readonly pages: StaticPagesService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'Published information pages, for footer navigation' })
  @ApiOkResponse({ type: [PublicStaticPageSummaryDto] })
  async list() {
    return { data: await this.pages.publicList() };
  }

  @Get(':slug')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'One published information page (404 while it is a draft)' })
  @ApiOkResponse({ type: PublicStaticPageDto })
  async page(@Param('slug') slug: string) {
    return { data: await this.pages.publicPage(slug) };
  }
}
