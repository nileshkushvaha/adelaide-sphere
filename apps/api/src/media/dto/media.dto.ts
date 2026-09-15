import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { ALLOWED_UPLOAD_MIME, MAX_DOCUMENT_BYTES } from '@adelaide-sphere/domain';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../common/pagination.js';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const emptyToNull = () => Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value));

export const MEDIA_STATUSES = ['quarantined', 'ready', 'rejected'] as const;
export const MEDIA_KINDS = ['image', 'document'] as const;

/** Step 1 of the upload flow (SRS MED 002): ask for a constrained signed URL. */
export class RequestUploadDto {
  @ApiProperty({ maxLength: 255, description: 'Original file name, for admin display only' }) @trim() @IsString() @Length(1, 255) fileName!: string;
  @ApiProperty({ enum: ALLOWED_UPLOAD_MIME, description: 'An image type, or application/pdf for a document (change log 1.16)' }) @IsIn(ALLOWED_UPLOAD_MIME) contentType!: (typeof ALLOWED_UPLOAD_MIME)[number];
  @ApiProperty({ minimum: 1, maximum: MAX_DOCUMENT_BYTES, description: 'Images up to 10 MB, documents up to 20 MB; the service applies the limit for the kind' }) @Type(() => Number) @IsInt() @Min(1) @Max(MAX_DOCUMENT_BYTES) bytes!: number;
  @ApiPropertyOptional({ maxLength: 180, description: "A document's display name; required for a PDF" }) @IsOptional() @trim() @IsString() @MaxLength(180) title?: string;
}

export class UploadTicketDto {
  @ApiProperty() assetId!: string;
  @ApiProperty({ description: 'Short-lived signed PUT URL; the key is server-generated' }) uploadUrl!: string;
  @ApiProperty({ type: Object, description: 'Headers that must accompany the PUT' }) headers!: Record<string, string>;
  @ApiProperty() expiresInSeconds!: number;
}

/** Step 2: the client reports the upload finished; the server verifies it. */
export class CompleteUploadDto {
  @ApiPropertyOptional({ description: 'SHA-256 of the uploaded bytes, hex; verified when supplied' }) @IsOptional() @IsString() @MaxLength(64) checksum?: string;
  @ApiPropertyOptional({ maxLength: 255, description: 'Alt text; required before the asset can be used on a page (SRS MED 003)' }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(255) altText?: string | null;
}

export class UpdateMediaDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 255 }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(255) altText?: string | null;
  @ApiPropertyOptional({ maxLength: 180, description: "A document's display name; documents only" }) @IsOptional() @trim() @IsString() @Length(1, 180) title?: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 255 }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(255) credit?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(500) rightsNote?: string | null;
  @ApiPropertyOptional({ minimum: 0, maximum: 1, description: 'Focal point as a fraction of the width' }) @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1) focalX?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 1 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1) focalY?: number;
}

export class MediaVariantDto {
  @ApiProperty({ enum: ['thumbnail', 'card', 'hero'] }) kind!: 'thumbnail' | 'card' | 'hero';
  @ApiProperty() url!: string;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
}

export class MediaUsageDto {
  @ApiProperty({ enum: ['business', 'post', 'page', 'author', 'testimonial', 'partner', 'category', 'area', 'blogCategory', 'blogTag', 'faq', 'setting', 'menu'] }) kind!: 'business' | 'post' | 'page' | 'author' | 'testimonial' | 'partner' | 'category' | 'area' | 'blogCategory' | 'blogTag' | 'faq' | 'setting' | 'menu';
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
}

export class MediaAssetDto {
  @ApiProperty() id!: string;
  @ApiProperty() sourceName!: string;
  @ApiProperty({ enum: MEDIA_KINDS }) kind!: (typeof MEDIA_KINDS)[number];
  @ApiProperty({ type: String, nullable: true, description: "A document's display name" }) title!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'The published PDF, once its upload has been checked' }) documentUrl!: string | null;
  @ApiProperty({ type: Number, nullable: true }) pageCount!: number | null;
  @ApiProperty() mimeType!: string;
  @ApiProperty() bytes!: number;
  @ApiProperty({ type: Number, nullable: true }) width!: number | null;
  @ApiProperty({ type: Number, nullable: true }) height!: number | null;
  @ApiProperty({ enum: MEDIA_STATUSES }) status!: (typeof MEDIA_STATUSES)[number];
  @ApiProperty({ type: String, nullable: true }) rejectionReason!: string | null;
  @ApiProperty({ type: String, nullable: true }) altText!: string | null;
  @ApiProperty({ type: String, nullable: true }) credit!: string | null;
  @ApiProperty({ type: String, nullable: true }) rightsNote!: string | null;
  @ApiProperty({ type: Number, nullable: true }) focalX!: number | null;
  @ApiProperty({ type: Number, nullable: true }) focalY!: number | null;
  @ApiProperty({ type: [MediaVariantDto], description: 'Empty until processing finishes; a quarantined asset has no public URL' }) variants!: MediaVariantDto[];
  @ApiProperty({ type: [MediaUsageDto] }) usages!: MediaUsageDto[];
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class ListMediaQueryDto {
  @ApiPropertyOptional({ enum: MEDIA_STATUSES }) @IsOptional() @IsIn(MEDIA_STATUSES) status?: (typeof MEDIA_STATUSES)[number];
  @ApiPropertyOptional({ enum: MEDIA_KINDS, description: 'Images or documents; both when omitted' }) @IsOptional() @IsIn(MEDIA_KINDS) kind?: (typeof MEDIA_KINDS)[number];
  @ApiPropertyOptional({ maxLength: 120 }) @IsOptional() @trim() @IsString() @MaxLength(120) q?: string;
  @ApiPropertyOptional({ description: 'Only assets that are not used anywhere' }) @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() unused?: boolean;
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE) pageSize = DEFAULT_PAGE_SIZE;
}

/** Gallery usage on a listing (SRS MED 004). */
export class GalleryItemDto {
  @ApiProperty() @IsString() @MaxLength(64) mediaId!: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 255 }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(255) caption?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 255, description: 'Alt text for this context; falls back to the asset alt text' }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(255) altOverride?: string | null;
  @ApiPropertyOptional({ description: 'Exactly one item may be the cover' }) @IsOptional() @IsBoolean() isCover?: boolean;
}

export class SetGalleryDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty({ type: [GalleryItemDto], maxItems: 24, description: 'Replaces the gallery; order is the array order' })
  @IsArray()
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => GalleryItemDto)
  items!: GalleryItemDto[];
}

export class GalleryEntryDto {
  @ApiProperty() mediaId!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ type: String, nullable: true }) caption!: string | null;
  @ApiProperty({ description: 'Alt text actually used: the override when set, otherwise the asset alt text' }) alt!: string;
  @ApiProperty() isCover!: boolean;
  @ApiProperty({ type: [MediaVariantDto] }) variants!: MediaVariantDto[];
}
