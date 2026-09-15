import { SettingsImageDto } from './general-settings.dto.js';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';
import { BODY_FORMATS } from '../../blog/dto/blog.dto.js';
import type { BodyFormat } from '../../blog/sanitise.js';
import { MAX_SLUG_LENGTH, PAGE_LAYOUTS, SYSTEM_PAGE_SLUGS, type StaticPageLayout } from '../static-pages.js';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const emptyToNull = () => Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value));

export class StaticPageReferencesDto {
  @ApiProperty({ type: 'object', additionalProperties: { type: 'object', required: ['url', 'alt'], properties: { url: { type: 'string' }, alt: { type: 'string' } } }, description: 'Library images the sections use, by id: a thumbnail and its alt text' })
  images!: Record<string, { url: string; alt: string }>;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'object', required: ['title', 'url'], properties: { title: { type: 'string' }, url: { type: 'string' } } }, description: 'Library documents the section buttons link, by id' })
  documents!: Record<string, { title: string; url: string }>;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'object', required: ['name', 'slug', 'status'], properties: { name: { type: 'string' }, slug: { type: 'string' }, status: { type: 'string' } } }, description: 'Businesses the sections show, by id, whatever their status' })
  businesses!: Record<string, { name: string; slug: string; status: string }>;
}

export class StaticPageDto {
  @ApiProperty({ description: `Public address. The system pages are ${SYSTEM_PAGE_SLUGS.join(', ')}; anything else is a page an administrator created.` }) slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ description: 'Sanitised HTML actually rendered (SRS SEC 001)' }) sanitizedBody!: string;
  @ApiProperty({ description: 'Source exactly as the editor wrote it' }) bodySource!: string;
  @ApiProperty({ enum: BODY_FORMATS }) bodyFormat!: BodyFormat;
  @ApiProperty({ type: String, nullable: true }) seoTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoDescription!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoKeywords!: string | null;
  @ApiProperty({ type: String, nullable: true }) ogImageMediaId!: string | null;
  @ApiProperty({ type: SettingsImageDto, nullable: true, description: 'Resolved share image, or null when the site image is used' }) ogImage!: SettingsImageDto | null;
  @ApiProperty({ type: 'array', items: { type: 'object' }, description: 'The page sections (change log 1.17); a page written before sections reads as one text section' }) sections!: Record<string, unknown>[];
  @ApiProperty({ description: 'True when the page has been saved with sections; false for a page still stored as one body' }) hasSections!: boolean;
  @ApiProperty({ type: StaticPageReferencesDto, description: 'Names and previews of what the sections refer to, so the editor can show them. Empty in the page list.' }) references!: StaticPageReferencesDto;
  @ApiProperty({ description: 'Hidden from search engines and left out of the sitemap' }) noindex!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'When a scheduled page goes live' }) scheduledAt!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Why a scheduled page returned to draft' }) publishFailure!: string | null;
  @ApiProperty({ enum: ['draft', 'published', 'scheduled'] }) status!: 'draft' | 'published' | 'scheduled';
  @ApiProperty({ enum: PAGE_LAYOUTS, description: 'Where the supporting column sits, or whether the page runs full width' }) layout!: StaticPageLayout;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) publishedAt!: string | null;
  @ApiProperty({ type: [String], description: 'Reasons this page cannot be published yet (SRS CFG 002)' }) publicationBlockers!: string[];
  @ApiProperty({ description: 'Editor-facing explanation of what the page is for' }) purpose!: string;
  @ApiProperty({ enum: ['generic'], description: 'Which public template renders this page' }) template!: 'generic';
  @ApiProperty({ description: 'True for a page the product refers to by address: not creatable, renameable or deletable' }) isSystem!: boolean;
  @ApiProperty({ description: 'True only for a custom page that is not currently published' }) canDelete!: boolean;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: String, nullable: true }) updatedByAdminId!: string | null;
}

export class CreateStaticPageDto {
  @ApiProperty({ maxLength: MAX_SLUG_LENGTH, example: 'community-guidelines', description: 'Public address; lower-case letters, numbers and single hyphens. Reserved and taken addresses are refused.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @Length(2, MAX_SLUG_LENGTH)
  slug!: string;

  @ApiProperty({ minLength: 3, maxLength: 180 }) @trim() @IsString() @Length(3, 180) title!: string;
  @ApiPropertyOptional({ maxLength: 200_000, description: 'The page as one body; used only when `sections` is not sent' }) @IsOptional() @IsString() @MaxLength(200_000) body?: string;
  @ApiPropertyOptional({ type: 'array', items: { type: 'object' }, maxItems: 30, description: 'The page sections (change log 1.17), validated and sanitised by the server' }) @IsOptional() @IsArray() @ArrayMaxSize(30) sections?: Record<string, unknown>[];
  @ApiPropertyOptional({ enum: BODY_FORMATS, default: 'html' }) @IsOptional() @IsIn(BODY_FORMATS) bodyFormat?: BodyFormat;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 180 }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(180) seoTitle?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 300 }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(300) seoDescription?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 255, description: 'Comma-separated; recorded, not read by search engines' }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(255) seoKeywords?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Ready media asset used when the page is shared' }) @IsOptional() @emptyToNull() @IsString() @MaxLength(64) ogImageMediaId?: string | null;
  @ApiPropertyOptional({ enum: PAGE_LAYOUTS, default: 'rightSidebar', description: 'Page layout: a sidebar on the right or left of the reading column, or the full width' }) @IsOptional() @IsIn(PAGE_LAYOUTS) layout?: StaticPageLayout;
  @ApiPropertyOptional({ description: 'Hide from search engines and the sitemap' }) @IsOptional() @IsBoolean() noindex?: boolean;
}

export class UpdateStaticPageDto {
  @ApiProperty({ minimum: 0, description: '0 for a page that has never been saved' }) @IsInt() @Min(0) expectedVersion!: number;
  @ApiProperty({ minLength: 3, maxLength: 180 }) @trim() @IsString() @Length(3, 180) title!: string;
  @ApiPropertyOptional({ maxLength: 200_000, description: 'The page as one body; used only when `sections` is not sent' }) @IsOptional() @IsString() @MaxLength(200_000) body?: string;
  @ApiPropertyOptional({ type: 'array', items: { type: 'object' }, maxItems: 30, description: 'The page sections (change log 1.17), validated and sanitised by the server' }) @IsOptional() @IsArray() @ArrayMaxSize(30) sections?: Record<string, unknown>[];
  @ApiPropertyOptional({ description: 'Hide from search engines and the sitemap' }) @IsOptional() @IsBoolean() noindex?: boolean;
  @ApiPropertyOptional({ enum: BODY_FORMATS, default: 'html' }) @IsOptional() @IsIn(BODY_FORMATS) bodyFormat?: BodyFormat;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 180 }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(180) seoTitle?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 300 }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(300) seoDescription?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 255, description: 'Comma-separated; recorded, not read by search engines' }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(255) seoKeywords?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Ready media asset used when the page is shared' }) @IsOptional() @emptyToNull() @IsString() @MaxLength(64) ogImageMediaId?: string | null;
  @ApiPropertyOptional({ enum: PAGE_LAYOUTS, default: 'rightSidebar', description: 'Page layout: a sidebar on the right or left of the reading column, or the full width' }) @IsOptional() @IsIn(PAGE_LAYOUTS) layout?: StaticPageLayout;
  @ApiPropertyOptional({ maxLength: 500, description: 'A note kept with the version this save replaces' }) @IsOptional() @trim() @IsString() @MaxLength(500) revisionReason?: string;
}

export class StaticPageStateDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @trim() @IsString() @MaxLength(500) reason?: string;
}

export class PublicStaticPageDto {
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ description: 'Sanitised HTML' }) body!: string;
  @ApiProperty({ type: String, nullable: true }) seoTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoDescription!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoKeywords!: string | null;
  @ApiProperty({ type: String, nullable: true }) ogImageMediaId!: string | null;
  @ApiProperty({ type: SettingsImageDto, nullable: true, description: 'Resolved share image, or null when the site image is used' }) ogImage!: SettingsImageDto | null;
  @ApiProperty({ type: String, nullable: true, description: 'Photographer credit recorded with the page image. Several licences require it to be shown wherever the picture is.' }) ogImageCredit!: string | null;
  @ApiProperty({ enum: PAGE_LAYOUTS, description: 'Layout the editor chose for this page' }) layout!: StaticPageLayout;
  @ApiProperty({ type: 'array', items: { type: 'object' }, description: 'Visible sections in order (change log 1.17); empty for a page still stored as one body' }) sections!: Record<string, unknown>[];
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'object', required: ['url', 'alt', 'width', 'height', 'credit'], properties: { url: { type: 'string' }, alt: { type: 'string' }, width: { type: 'number' }, height: { type: 'number' }, credit: { type: 'string', nullable: true } } },
    description: 'Library images the sections show, by id, with the credit recorded on the picture',
  })
  images!: Record<string, { url: string; alt: string; width: number; height: number; credit: string | null }>;
  @ApiProperty({ type: Object, description: 'Published PDF documents the sections link, by id' }) documents!: Record<string, { url: string; title: string; bytes: number }>;
  @ApiProperty({ type: Object, description: 'Published businesses the sections show, by id' }) businesses!: Record<string, { id: string; slug: string; name: string; categoryName: string | null; areaName: string | null }>;
  @ApiProperty({ description: 'Hidden from search engines' }) noindex!: boolean;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class PublicStaticPageSummaryDto {
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
}

/**
 * Narrowing for the page list.
 *
 * Applied after the list is assembled rather than in the query, because half of
 * it does not come from the database: the system pages are defined in code and
 * appear whether or not anyone has ever edited them. A `WHERE` clause would
 * silently drop exactly the pages an administrator is most likely to be looking
 * for.
 */
export class ListStaticPagesQueryDto {
  @ApiPropertyOptional({ maxLength: 80, description: 'Matches title and address' }) @IsOptional() @IsString() @MaxLength(80) q?: string;
  @ApiPropertyOptional({ enum: ['draft', 'published', 'scheduled'] }) @IsOptional() @IsIn(['draft', 'published', 'scheduled']) status?: 'draft' | 'published' | 'scheduled';
}

export class StaticPagePreviewLinkDto {
  @ApiProperty({ description: 'Path on the public site that shows the page privately, e.g. /preview/page/<token>' }) path!: string;
  @ApiProperty({ format: 'date-time', description: 'The link stops working at this time, or when the editor signs out' }) expiresAt!: string;
}

export class StaticPageRevisionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'The page version this snapshot was taken from' }) version!: number;
  @ApiProperty({ type: String, nullable: true }) title!: string | null;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ type: String, nullable: true }) actorName!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class StaticPageRevisionDetailDto extends StaticPageRevisionDto {
  @ApiProperty({ type: 'array', items: { type: 'object' }, description: 'The sections as they stood; a version saved before sections reads as one text section' }) sections!: Record<string, unknown>[];
  @ApiProperty({ description: 'The sanitised HTML of that version' }) bodyHtml!: string;
}

export class RestoreStaticPageRevisionDto {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedVersion!: number;
}

export class SaveStaticPageAutosaveDto {
  @ApiProperty({ minimum: 0, description: 'The page version the editor is working from' }) @IsInt() @Min(0) baseVersion!: number;
  @ApiProperty({ maxLength: 180 }) @IsString() @MaxLength(180) title!: string;
  @ApiProperty({ type: 'array', items: { type: 'object' }, maxItems: 30 }) @IsArray() @ArrayMaxSize(30) sections!: Record<string, unknown>[];
}

export class StaticPageAutosaveDto {
  @ApiProperty() title!: string;
  @ApiProperty({ type: 'array', items: { type: 'object' } }) sections!: Record<string, unknown>[];
  @ApiProperty() baseVersion!: number;
  @ApiProperty({ format: 'date-time' }) savedAt!: string;
  @ApiProperty({ description: 'True when the page has been saved by anyone since this copy was made' }) stale!: boolean;
}

export class StaticPageAutosaveReceiptDto {
  @ApiProperty({ format: 'date-time' }) savedAt!: string;
}

export class ScheduleStaticPageDto extends StaticPageStateDto {
  @ApiProperty({ format: 'date-time', description: 'UTC instant; the admin picks Australia/Adelaide time. Must be in the future.' }) @IsDateString() scheduledAt!: string;
}

export class UnpublishStaticPageDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty({ minLength: 3, maxLength: 500, description: 'Why the page is being taken down; kept in the activity log' }) @trim() @IsString() @Length(3, 500) reason!: string;
}

export class ChangeStaticPageAddressDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty({ maxLength: MAX_SLUG_LENGTH, description: 'The new address; the same rules as a new page' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @Length(2, MAX_SLUG_LENGTH)
  slug!: string;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @trim() @IsString() @MaxLength(500) reason?: string;
}

export class DuplicateStaticPageDto {
  @ApiProperty({ maxLength: MAX_SLUG_LENGTH, description: 'Address of the copy' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @Length(2, MAX_SLUG_LENGTH)
  slug!: string;
  @ApiProperty({ minLength: 3, maxLength: 180 }) @trim() @IsString() @Length(3, 180) title!: string;
}
