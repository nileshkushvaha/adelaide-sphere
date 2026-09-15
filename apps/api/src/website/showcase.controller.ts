import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, Max } from 'class-validator';
import type { RequestContext } from '../auth/auth.service.js';
import { CurrentAdmin, Public, RequirePermissions, type AuthenticatedRequest } from '../auth/decorators.js';
import { getRequestId } from '../common/request-id.js';
import { PaginationQueryDto, collectionMeta } from '../common/pagination.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { MediaService } from '../media/media.service.js';
import { SettingsImageDto } from '../settings/dto/general-settings.dto.js';
import { PARTNER_LIMITS, PartnerService } from './partner.service.js';
import { TESTIMONIAL_LIMITS, TestimonialService } from './testimonial.service.js';

const ctxOf = (req: AuthenticatedRequest): RequestContext => ({ ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req) });

// ---- testimonials ---------------------------------------------------------

export class TestimonialDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  @ApiPropertyOptional({ nullable: true }) relationship!: string | null;
  @ApiProperty() quote!: string;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Stars the person gave, 1–5; null when they gave none' }) rating!: number | null;
  @ApiPropertyOptional({ nullable: true }) businessId!: string | null;
  @ApiPropertyOptional({ nullable: true }) mediaId!: string | null;
  @ApiPropertyOptional({ type: SettingsImageDto, nullable: true, description: 'The referenced image, resolved for preview; null when none is set or it is not processed' }) image!: SettingsImageDto | null;
  @ApiProperty() displayOrder!: number;
  @ApiProperty({ enum: ['draft', 'published'] }) status!: string;
  @ApiPropertyOptional({ nullable: true }) publishedAt!: string | null;
  @ApiProperty() version!: number;
  @ApiProperty() updatedAt!: string;
}

export class UpsertTestimonialDto {
  @ApiProperty({ maxLength: TESTIMONIAL_LIMITS.displayName }) @IsString() @MaxLength(TESTIMONIAL_LIMITS.displayName) displayName!: string;
  @ApiPropertyOptional({ nullable: true, maxLength: TESTIMONIAL_LIMITS.relationship }) @IsOptional() @IsString() @MaxLength(TESTIMONIAL_LIMITS.relationship) relationship?: string | null;
  @ApiProperty({ maxLength: TESTIMONIAL_LIMITS.quote }) @IsString() @MaxLength(TESTIMONIAL_LIMITS.quote) quote!: string;
  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, maximum: 5, description: 'Stars the person gave, 1–5; omit when they gave none' }) @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(64) businessId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(64) mediaId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) displayOrder?: number;
}

export class UpdateTestimonialDto extends UpsertTestimonialDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
}

export class ApproveDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ nullable: true, description: 'How the consent or authorisation was obtained, for the record.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string | null;
}

export class VersionOnlyDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
}

export class ListTestimonialsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['draft', 'published'] }) @IsOptional() @IsIn(['draft', 'published']) status?: 'draft' | 'published';
  @ApiPropertyOptional({ maxLength: 120, description: 'Matches the person and the words they said' }) @IsOptional() @IsString() @MaxLength(120) q?: string;
}

const testimonialDto = (media: MediaService) => async (row: {
  id: string;
  displayName: string;
  relationship: string | null;
  quote: string;
  rating: number | null;
  businessId: string | null;
  mediaId: string | null;
  displayOrder: number;
  status: string;
  publishedAt: Date | null;
  version: number;
  updatedAt: Date;
}) => ({
  image: await media.publicImageRefOfKind(row.mediaId, 'card'),
  id: row.id,
  displayName: row.displayName,
  relationship: row.relationship,
  quote: row.quote,
  rating: row.rating,
  businessId: row.businessId,
  mediaId: row.mediaId,
  displayOrder: row.displayOrder,
  status: row.status,
  publishedAt: row.publishedAt?.toISOString() ?? null,
  version: row.version,
  updatedAt: row.updatedAt.toISOString(),
});

/** Approved and published testimonials (SRS 1.2 TSTM 004). */
@ApiTags('public-site')
@Public()
@Controller('testimonials')
export class TestimonialPublicController {
  constructor(
    private readonly testimonials: TestimonialService,
    private readonly media: MediaService,
  ) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'Approved, published testimonials in display order' })
  async list() {
    return { data: await this.testimonials.publicList() };
  }
}

/** Administration of testimonials (SRS 1.2 TSTM 005). */
@ApiTags('admin-website')
@Controller('admin/testimonials')
export class TestimonialAdminController {
  constructor(
    private readonly testimonials: TestimonialService,
    private readonly media: MediaService,
  ) {}

  @RequirePermissions('website.testimonials.view')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [TestimonialDto] })
  async list(@Query() query: ListTestimonialsQueryDto) {
    const { rows, total } = await this.testimonials.list({ page: query.page, pageSize: query.pageSize, status: query.status, q: query.q });
    return { data: await Promise.all(rows.map(testimonialDto(this.media))), meta: collectionMeta(query.page, query.pageSize, total) };
  }

  @RequirePermissions('website.testimonials.view')
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: TestimonialDto })
  async get(@Param('id') id: string) {
    return { data: await testimonialDto(this.media)(await this.testimonials.get(id)) };
  }

  @RequirePermissions('website.testimonials.create')
  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: TestimonialDto })
  async create(@Body() body: UpsertTestimonialDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await testimonialDto(this.media)(await this.testimonials.create(body, admin, ctxOf(req))) };
  }

  @RequirePermissions('website.testimonials.update')
  @Put(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: TestimonialDto })
  async update(@Param('id') id: string, @Body() body: UpdateTestimonialDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await testimonialDto(this.media)(await this.testimonials.update(id, body, admin, ctxOf(req))) };
  }


  @RequirePermissions('website.testimonials.publish')
  @Post(':id/publish')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: TestimonialDto })
  async publish(@Param('id') id: string, @Body() body: VersionOnlyDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await testimonialDto(this.media)(await this.testimonials.setPublished(id, true, body.expectedVersion, admin, ctxOf(req))) };
  }

  @RequirePermissions('website.testimonials.publish')
  @Post(':id/unpublish')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: TestimonialDto })
  async unpublish(@Param('id') id: string, @Body() body: VersionOnlyDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await testimonialDto(this.media)(await this.testimonials.setPublished(id, false, body.expectedVersion, admin, ctxOf(req))) };
  }

  @RequirePermissions('website.testimonials.delete')
  @Delete(':id')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async remove(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.testimonials.remove(id, admin, ctxOf(req));
  }
}

// ---- client and partner organisations -------------------------------------

export class PartnerDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) relationshipLabel!: string | null;
  @ApiPropertyOptional({ nullable: true }) mediaId!: string | null;
  @ApiPropertyOptional({ type: SettingsImageDto, nullable: true, description: 'The referenced image, resolved for preview; null when none is set or it is not processed' }) image!: SettingsImageDto | null;
  @ApiPropertyOptional({ nullable: true }) logoAlt!: string | null;
  @ApiPropertyOptional({ nullable: true }) websiteUrl!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'When authorisation to display the mark was recorded. Publication is refused while it is null.' })
  authorisedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) authorisedByAdminId!: string | null;
  @ApiPropertyOptional({ nullable: true }) authorisationNote!: string | null;
  @ApiProperty() displayOrder!: number;
  @ApiProperty({ enum: ['draft', 'published'] }) status!: string;
  @ApiPropertyOptional({ nullable: true }) publishedAt!: string | null;
  @ApiProperty() version!: number;
  @ApiProperty() updatedAt!: string;
}

export class UpsertPartnerDto {
  @ApiProperty({ maxLength: PARTNER_LIMITS.name }) @IsString() @MaxLength(PARTNER_LIMITS.name) name!: string;
  @ApiPropertyOptional({ nullable: true, maxLength: PARTNER_LIMITS.relationship }) @IsOptional() @IsString() @MaxLength(PARTNER_LIMITS.relationship) relationshipLabel?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(64) mediaId?: string | null;
  @ApiPropertyOptional({ nullable: true, maxLength: PARTNER_LIMITS.logoAlt, description: 'Names the organisation; required before publication.' })
  @IsOptional()
  @IsString()
  @MaxLength(PARTNER_LIMITS.logoAlt)
  logoAlt?: string | null;
  @ApiPropertyOptional({ nullable: true, maxLength: PARTNER_LIMITS.websiteUrl }) @IsOptional() @IsString() @MaxLength(PARTNER_LIMITS.websiteUrl) websiteUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) displayOrder?: number;
}

export class UpdatePartnerDto extends UpsertPartnerDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
}

export class ListPartnersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['draft', 'published'] }) @IsOptional() @IsIn(['draft', 'published']) status?: 'draft' | 'published';
  @ApiPropertyOptional({ maxLength: 120, description: 'Matches the organisation and how it is described' }) @IsOptional() @IsString() @MaxLength(120) q?: string;
}

const partnerDto = (media: MediaService) => async (row: {
  id: string;
  name: string;
  relationshipLabel: string | null;
  mediaId: string | null;
  logoAlt: string | null;
  websiteUrl: string | null;
  authorisedAt: Date | null;
  authorisedByAdminId: string | null;
  authorisationNote: string | null;
  displayOrder: number;
  status: string;
  publishedAt: Date | null;
  version: number;
  updatedAt: Date;
}) => ({
  image: await media.publicImageRefOfKind(row.mediaId, 'card'),
  id: row.id,
  name: row.name,
  relationshipLabel: row.relationshipLabel,
  mediaId: row.mediaId,
  logoAlt: row.logoAlt,
  websiteUrl: row.websiteUrl,
  authorisedAt: row.authorisedAt?.toISOString() ?? null,
  authorisedByAdminId: row.authorisedByAdminId,
  authorisationNote: row.authorisationNote,
  displayOrder: row.displayOrder,
  status: row.status,
  publishedAt: row.publishedAt?.toISOString() ?? null,
  version: row.version,
  updatedAt: row.updatedAt.toISOString(),
});

/** Published client and partner organisations (SRS 1.2 PTNR 005). */
@ApiTags('public-site')
@Public()
@Controller('partners')
export class PartnerPublicController {
  constructor(
    private readonly partners: PartnerService,
    private readonly media: MediaService,
  ) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'Published, authorised organisations with a processed logo' })
  async list() {
    return { data: await this.partners.publicList() };
  }
}

/** Administration of client and partner organisations (SRS 1.2 PTNR 005). */
@ApiTags('admin-website')
@Controller('admin/partners')
export class PartnerAdminController {
  constructor(
    private readonly partners: PartnerService,
    private readonly media: MediaService,
  ) {}

  @RequirePermissions('website.clients.view')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [PartnerDto] })
  async list(@Query() query: ListPartnersQueryDto) {
    const { rows, total } = await this.partners.list({ page: query.page, pageSize: query.pageSize, status: query.status, q: query.q });
    return { data: await Promise.all(rows.map(partnerDto(this.media))), meta: collectionMeta(query.page, query.pageSize, total) };
  }

  @RequirePermissions('website.clients.view')
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PartnerDto })
  async get(@Param('id') id: string) {
    return { data: await partnerDto(this.media)(await this.partners.get(id)) };
  }

  @RequirePermissions('website.clients.create')
  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PartnerDto })
  async create(@Body() body: UpsertPartnerDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await partnerDto(this.media)(await this.partners.create(body, admin, ctxOf(req))) };
  }

  @RequirePermissions('website.clients.update')
  @Put(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Changing the logo clears the recorded authorisation: it was given for a particular mark.' })
  @ApiOkResponse({ type: PartnerDto })
  async update(@Param('id') id: string, @Body() body: UpdatePartnerDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await partnerDto(this.media)(await this.partners.update(id, body, admin, ctxOf(req))) };
  }

  @RequirePermissions('website.clients.approve')
  @Post(':id/authorise')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: "Record written authorisation to display the organisation's mark. Publication is refused without it." })
  @ApiOkResponse({ type: PartnerDto })
  async authorise(@Param('id') id: string, @Body() body: ApproveDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await partnerDto(this.media)(await this.partners.authorise(id, body.note ?? null, body.expectedVersion, admin, ctxOf(req))) };
  }

  @RequirePermissions('website.clients.publish')
  @Post(':id/publish')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PartnerDto })
  async publish(@Param('id') id: string, @Body() body: VersionOnlyDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await partnerDto(this.media)(await this.partners.setPublished(id, true, body.expectedVersion, admin, ctxOf(req))) };
  }

  @RequirePermissions('website.clients.publish')
  @Post(':id/unpublish')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PartnerDto })
  async unpublish(@Param('id') id: string, @Body() body: VersionOnlyDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await partnerDto(this.media)(await this.partners.setPublished(id, false, body.expectedVersion, admin, ctxOf(req))) };
  }

  @RequirePermissions('website.clients.delete')
  @Delete(':id')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async remove(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.partners.remove(id, admin, ctxOf(req));
  }
}
