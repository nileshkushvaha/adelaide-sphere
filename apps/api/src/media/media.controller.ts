import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestContext } from '../auth/auth.service.js';
import { CurrentAdmin, RequireAnyPermission, RequirePermissions, type AuthenticatedRequest } from '../auth/decorators.js';
import { getRequestId } from '../common/request-id.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { CompleteUploadDto, GalleryEntryDto, ListMediaQueryDto, MediaAssetDto, RequestUploadDto, SetGalleryDto, UpdateMediaDto, UploadTicketDto } from './dto/media.dto.js';
import { MediaService } from './media.service.js';

const ctxOf = (req: AuthenticatedRequest): RequestContext => ({ ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req) });

/**
 * Media library (SRS MED 001–004, change log 1.16). Viewing, editing and
 * deleting use the Media library codes; uploading needs `media.upload` for an
 * image or `media.documents.upload` for a PDF, which the service checks against
 * the declared type.
 */
@ApiTags('admin-media')
@Controller('admin/media')
export class MediaAdminController {
  constructor(private readonly media: MediaService) {}

  @RequirePermissions('media.view')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List media assets (kind, status, q, unused)' })
  @ApiOkResponse({ type: [MediaAssetDto] })
  list(@Query() query: ListMediaQueryDto) {
    return this.media.list(query);
  }

  @RequireAnyPermission('media.upload', 'media.documents.upload')
  @Post('uploads')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Request a short-lived signed upload for the private quarantine bucket' })
  @ApiOkResponse({ type: UploadTicketDto })
  async requestUpload(@Body() body: RequestUploadDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.media.requestUpload(body, actor, ctxOf(req)) };
  }

  @RequireAnyPermission('media.upload', 'media.documents.upload')
  @Post(':id/complete')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Validate the uploaded bytes and queue variant processing' })
  @ApiOkResponse({ type: MediaAssetDto })
  async complete(@Param('id') id: string, @Body() body: CompleteUploadDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.media.completeUpload(id, body, actor, ctxOf(req)) };
  }

  @RequirePermissions('media.view')
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: MediaAssetDto })
  async get(@Param('id') id: string) {
    return { data: await this.media.get(id) };
  }

  @RequirePermissions('media.update')
  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Edit alt text, credit, rights note and focal point' })
  @ApiOkResponse({ type: MediaAssetDto })
  async update(@Param('id') id: string, @Body() body: UpdateMediaDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.media.update(id, body, actor, ctxOf(req)) };
  }

  @RequirePermissions('media.delete')
  @Delete(':id')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Delete an unused asset; refused while any usage exists' })
  async remove(@Param('id') id: string, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    await this.media.remove(id, actor, ctxOf(req));
  }
}

/** Listing galleries (SRS MED 004): order, caption and contextual alt live on the usage. */
@ApiTags('admin-businesses')
@Controller('admin/businesses/:businessId/gallery')
export class BusinessGalleryController {
  constructor(private readonly media: MediaService) {}

  @RequirePermissions('listings.read')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [GalleryEntryDto] })
  async get(@Param('businessId') businessId: string) {
    return { data: await this.media.gallery(businessId) };
  }

  @RequirePermissions('listings.update')
  @Put()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Replace the gallery (order, captions, alt overrides, cover) with expectedVersion' })
  @ApiOkResponse({ type: [GalleryEntryDto] })
  async set(@Param('businessId') businessId: string, @Body() body: SetGalleryDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.media.setGallery(businessId, body, actor, ctxOf(req)) };
  }
}
