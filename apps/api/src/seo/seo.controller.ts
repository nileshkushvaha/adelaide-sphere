import { Body, Controller, Delete, Get, Header, HttpCode, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestContext } from '../auth/auth.service.js';
import { CurrentAdmin, Public, RequirePermissions, type AuthenticatedRequest } from '../auth/decorators.js';
import { getRequestId } from '../common/request-id.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { CreateRedirectDto, ListRedirectsQueryDto, RedirectDto, RedirectPreviewDto, RedirectResolutionDto, RedirectStateDto } from './dto/redirect.dto.js';
import { SitemapFeedDto } from './dto/sitemap.dto.js';
import { RedirectsService } from './redirects.service.js';
import { SITEMAP_SECTIONS, SitemapService, type SitemapSection } from './sitemap.service.js';

const ctxOf = (req: AuthenticatedRequest): RequestContext => ({ ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req) });

/** Feeds the web tier renders as XML sitemaps and applies as redirects (SRS SEO 002/004). */
@ApiTags('public-seo')
@Public()
@Controller('seo')
export class SeoPublicController {
  constructor(
    private readonly sitemap: SitemapService,
    private readonly redirects: RedirectsService,
  ) {}

  @Get('sitemap/:section')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: `Canonical indexable paths for one sitemap section (${SITEMAP_SECTIONS.join(', ')})` })
  @ApiOkResponse({ type: SitemapFeedDto })
  async section(@Param('section') section: string) {
    if (!(SITEMAP_SECTIONS as readonly string[]).includes(section)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found' });
    const data = await this.sitemap.section(section as SitemapSection);
    return { data, meta: { count: data.length, generatedAt: new Date().toISOString() } };
  }

  @Get('redirects/resolve')
  // Ten seconds, not sixty: switching a redirect off is an operational lever,
  // and this cache is one of two layers no purge can reach (the other is the web
  // middleware's own map). The admin screens promise "within about ten seconds".
  @Header('Cache-Control', 'public, max-age=10')
  @ApiOperation({ summary: 'Resolve a public path to a 301 target or a 410; 404 when there is no rule' })
  @ApiOkResponse({ type: RedirectResolutionDto })
  async resolve(@Query('path') path?: string) {
    const resolution = path ? await this.redirects.resolve(path) : null;
    if (!resolution) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found' });
    return { data: resolution };
  }
}

/** Redirect administration (SRS SEO 004); `redirects.manage` throughout. */
@ApiTags('admin-seo')
@Controller('admin/redirects')
export class RedirectsAdminController {
  constructor(private readonly redirects: RedirectsService) {}

  @RequirePermissions('redirects.view')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List redirects (q, kind, page, pageSize)' })
  @ApiOkResponse({ type: [RedirectDto] })
  list(@Query() query: ListRedirectsQueryDto) {
    return this.redirects.list(query);
  }

  /**
   * What a path would do, for an administrator.
   *
   * Declared before the `:id` routes so `/resolve` is not swallowed as an id,
   * and deliberately not the public route: that one is cached for a minute, and
   * it answers 404 for "switched off" and "no rule at all" alike — which would
   * tell an administrator a path is free while a deactivated rule sits on it.
   */
  @RequirePermissions('redirects.view')
  @Get('resolve')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'What a given path does right now, and why when it does nothing' })
  @ApiOkResponse({ type: RedirectPreviewDto })
  async preview(@Query('path') path: string) {
    return { data: await this.redirects.preview(path ?? '') };
  }

  @RequirePermissions('redirects.create')
  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Create a 301 redirect, or mark a removed path as 410 gone' })
  @ApiOkResponse({ type: RedirectDto })
  async create(@Body() body: CreateRedirectDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.redirects.create(body, actor, ctxOf(req)) };
  }

  @RequirePermissions('redirects.update')
  @Post(':id/deactivate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Stop serving a redirect without deleting it' })
  @ApiOkResponse({ type: RedirectDto })
  async deactivate(@Param('id') id: string, @Body() body: RedirectStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.redirects.setActive(id, false, body.reason ?? null, actor, ctxOf(req)) };
  }

  @RequirePermissions('redirects.update')
  @Post(':id/activate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Serve a redirect that was switched off' })
  @ApiOkResponse({ type: RedirectDto })
  async activate(@Param('id') id: string, @Body() body: RedirectStateDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.redirects.setActive(id, true, body.reason ?? null, actor, ctxOf(req)) };
  }

  @RequirePermissions('redirects.delete')
  @Delete(':id')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Delete a redirect' })
  async remove(@Param('id') id: string, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    await this.redirects.remove(id, actor, ctxOf(req));
  }
}
