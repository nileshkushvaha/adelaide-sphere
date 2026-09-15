import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { RequestContext } from '../auth/auth.service.js';
import { CurrentAdmin, Public, RequirePermissions, type AuthenticatedRequest } from '../auth/decorators.js';
import { getRequestId } from '../common/request-id.js';
import { PaginationQueryDto, collectionMeta } from '../common/pagination.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { FAQ_LIMITS, FaqService } from './faq.service.js';

const ctxOf = (req: AuthenticatedRequest): RequestContext => ({ ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req) });

export class FaqDto {
  @ApiProperty() id!: string;
  @ApiProperty() question!: string;
  @ApiProperty({ description: 'Sanitised HTML; the only form ever rendered publicly.' }) answerHtml!: string;
  @ApiProperty({ description: 'Source exactly as the editor wrote it.' }) answerSource!: string;
  @ApiProperty({ enum: ['markdown', 'html'] }) answerFormat!: string;
  @ApiPropertyOptional({ nullable: true }) groupName!: string | null;
  @ApiProperty() displayOrder!: number;
  @ApiProperty({ enum: ['draft', 'published'] }) status!: string;
  @ApiPropertyOptional({ nullable: true }) publishedAt!: string | null;
  @ApiProperty() version!: number;
  @ApiProperty() updatedAt!: string;
}

export class PublicFaqDto {
  @ApiProperty() id!: string;
  @ApiProperty() question!: string;
  @ApiProperty() answerHtml!: string;
  @ApiPropertyOptional({ nullable: true }) groupName!: string | null;
}

export class UpsertFaqDto {
  @ApiProperty({ maxLength: FAQ_LIMITS.question }) @IsString() @MaxLength(FAQ_LIMITS.question) question!: string;
  @ApiProperty({ maxLength: FAQ_LIMITS.answer }) @IsString() @MaxLength(FAQ_LIMITS.answer) answer!: string;
  @ApiPropertyOptional({ enum: ['markdown', 'html'] }) @IsOptional() @IsIn(['markdown', 'html']) answerFormat?: 'markdown' | 'html';
  @ApiPropertyOptional({ nullable: true, maxLength: FAQ_LIMITS.group }) @IsOptional() @IsString() @MaxLength(FAQ_LIMITS.group) groupName?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) displayOrder?: number;
}

export class UpdateFaqDto extends UpsertFaqDto {
  @ApiProperty({ description: 'Version last read; a concurrent change is refused with 409.' }) @IsInt() @Min(1) expectedVersion!: number;
}

export class PublishFaqDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
}

class ReorderEntryDto {
  @ApiProperty() @IsString() @MaxLength(64) id!: string;
  @ApiProperty() @IsInt() @Min(0) displayOrder!: number;
}

export class ReorderFaqsDto {
  @ApiProperty({ type: [ReorderEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ReorderEntryDto)
  order!: ReorderEntryDto[];
}

export class ListFaqsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['draft', 'published'] }) @IsOptional() @IsIn(['draft', 'published']) status?: 'draft' | 'published';
  @ApiPropertyOptional({ maxLength: FAQ_LIMITS.group }) @IsOptional() @IsString() @MaxLength(FAQ_LIMITS.group) groupName?: string;
  @ApiPropertyOptional({ maxLength: 120 }) @IsOptional() @IsString() @MaxLength(120) q?: string;
}

const toDto = (row: {
  id: string;
  question: string;
  answerHtml: string;
  answerSource: string;
  answerFormat: string;
  groupName: string | null;
  displayOrder: number;
  status: string;
  publishedAt: Date | null;
  version: number;
  updatedAt: Date;
}) => ({
  id: row.id,
  question: row.question,
  answerHtml: row.answerHtml,
  answerSource: row.answerSource,
  answerFormat: row.answerFormat,
  groupName: row.groupName,
  displayOrder: row.displayOrder,
  status: row.status,
  publishedAt: row.publishedAt?.toISOString() ?? null,
  version: row.version,
  updatedAt: row.updatedAt.toISOString(),
});

/** Published questions for the public site (SRS 1.2 FAQ 004). */
@ApiTags('public-site')
@Public()
@Controller('faqs')
export class FaqPublicController {
  constructor(private readonly faqs: FaqService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'Published questions in display order' })
  @ApiOkResponse({ type: [PublicFaqDto] })
  async list() {
    return { data: await this.faqs.publicList() };
  }
}

/** Administration of frequently asked questions (SRS 1.2 FAQ 002). */
@ApiTags('admin-website')
@Controller('admin/faqs')
export class FaqAdminController {
  constructor(private readonly faqs: FaqService) {}

  @RequirePermissions('website.faqs.view')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [FaqDto] })
  async list(@Query() query: ListFaqsQueryDto) {
    const { rows, total } = await this.faqs.list({ page: query.page, pageSize: query.pageSize, status: query.status, groupName: query.groupName, q: query.q });
    return { data: rows.map(toDto), meta: collectionMeta(query.page, query.pageSize, total) };
  }

  @RequirePermissions('website.faqs.view')
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: FaqDto })
  async get(@Param('id') id: string) {
    return { data: toDto(await this.faqs.get(id)) };
  }

  @RequirePermissions('website.faqs.create')
  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: FaqDto })
  async create(@Body() body: UpsertFaqDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: toDto(await this.faqs.create(body, admin, ctxOf(req))) };
  }

  @RequirePermissions('website.faqs.update')
  @Put(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: FaqDto })
  async update(@Param('id') id: string, @Body() body: UpdateFaqDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: toDto(await this.faqs.update(id, body, admin, ctxOf(req))) };
  }

  @RequirePermissions('website.faqs.update')
  @Post('reorder')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Apply a new display order in one transaction' })
  async reorder(@Body() body: ReorderFaqsDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.faqs.reorder(body.order, admin, ctxOf(req));
  }

  @RequirePermissions('website.faqs.publish')
  @Post(':id/publish')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: FaqDto })
  async publish(@Param('id') id: string, @Body() body: PublishFaqDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: toDto(await this.faqs.setPublished(id, true, body.expectedVersion, admin, ctxOf(req))) };
  }

  @RequirePermissions('website.faqs.publish')
  @Post(':id/unpublish')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: FaqDto })
  async unpublish(@Param('id') id: string, @Body() body: PublishFaqDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: toDto(await this.faqs.setPublished(id, false, body.expectedVersion, admin, ctxOf(req))) };
  }

  @RequirePermissions('website.faqs.delete')
  @Delete(':id')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async remove(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.faqs.remove(id, admin, ctxOf(req));
  }
}
