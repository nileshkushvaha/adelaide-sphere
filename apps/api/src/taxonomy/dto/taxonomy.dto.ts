import { SERVICE_ICON_KEYS } from '@adelaide-sphere/domain/service-icons';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.js';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '../../common/slug.js';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export const TERM_SORT_FIELDS = ['name', 'slug', 'sortOrder', 'createdAt', 'updatedAt'] as const;

export class ListTermsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive match on name or slug', maxLength: 120 })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';

  @ApiPropertyOptional({ type: String, description: 'Comma-separated ids (at most 50): only these terms, whatever their status — how a picker shows the names of terms already chosen' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').map((id) => id.trim()).filter(Boolean) : value))
  @IsArray()
  @ArrayMaxSize(50)
  @Matches(/^[a-z0-9]{20,40}$/, { each: true, message: 'ids must be record ids' })
  ids?: string[];

  @ApiPropertyOptional({ description: 'Categories only: just top-level categories (possible parents)' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  topLevel?: boolean;

  @ApiPropertyOptional({ enum: TERM_SORT_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(TERM_SORT_FIELDS)
  sort: (typeof TERM_SORT_FIELDS)[number] = 'name';
}

class TermBaseDto {
  @ApiProperty({ minLength: 2, maxLength: 80 })
  @trim()
  @IsString()
  @Length(2, 80, { message: 'Name must be 2–80 characters' })
  name!: string;

  @ApiPropertyOptional({ description: 'Lowercase-hyphen slug; generated from the name when omitted', maxLength: SLUG_MAX_LENGTH })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(SLUG_MAX_LENGTH)
  @Matches(SLUG_PATTERN, { message: 'Slug must be lowercase letters, numbers and single hyphens' })
  slug?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;
}

export class CreateCategoryDto extends TermBaseDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Parent category id (must be a root category); omit for a root', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  parentId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Image shown on the home-page tile and the landing page (media asset id)' }) @IsOptional() @IsString() @MaxLength(64) imageMediaId?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 180, nullable: true, description: 'Search-result title; the name is used when empty' }) @IsOptional() @trim() @IsString() @MaxLength(180) seoTitle?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 300, nullable: true, description: 'Meta description; the description is used when empty' }) @IsOptional() @trim() @IsString() @MaxLength(300) seoDescription?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 255, nullable: true, description: 'Comma-separated keywords' }) @IsOptional() @trim() @IsString() @MaxLength(255) seoKeywords?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Share image (media asset id); the category image, then the site image, is used when empty' }) @IsOptional() @IsString() @MaxLength(64) ogImageMediaId?: string | null;
}

export class UpdateCategoryDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ minLength: 2, maxLength: 80 }) @IsOptional() @trim() @IsString() @Length(2, 80, { message: 'Name must be 2–80 characters' }) name?: string;
  @ApiPropertyOptional({ maxLength: SLUG_MAX_LENGTH }) @IsOptional() @trim() @IsString() @MaxLength(SLUG_MAX_LENGTH) @Matches(SLUG_PATTERN, { message: 'Slug must be lowercase letters, numbers and single hyphens' }) slug?: string;
  @ApiPropertyOptional({ maxLength: 500, nullable: true }) @IsOptional() @trim() @IsString() @MaxLength(500) description?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(64) parentId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10_000) sortOrder?: number;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Image shown on the home-page tile and the landing page (media asset id)' }) @IsOptional() @IsString() @MaxLength(64) imageMediaId?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 180, nullable: true, description: 'Search-result title; the name is used when empty' }) @IsOptional() @trim() @IsString() @MaxLength(180) seoTitle?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 300, nullable: true, description: 'Meta description; the description is used when empty' }) @IsOptional() @trim() @IsString() @MaxLength(300) seoDescription?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 255, nullable: true, description: 'Comma-separated keywords' }) @IsOptional() @trim() @IsString() @MaxLength(255) seoKeywords?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Share image (media asset id); the category image, then the site image, is used when empty' }) @IsOptional() @IsString() @MaxLength(64) ogImageMediaId?: string | null;
}

export class CreateServiceDto extends TermBaseDto {
  @ApiPropertyOptional({ type: [String], description: 'Search synonyms (2–80 chars each, max 20)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(2, 80, { each: true, message: 'Synonyms must be 2–80 characters' })
  synonyms?: string[];

  @ApiPropertyOptional({ type: String, nullable: true, enum: SERVICE_ICON_KEYS, description: 'Icon from the shared library; omit to match the name' })
  @IsOptional()
  @IsIn(SERVICE_ICON_KEYS, { message: 'Choose an icon from the library' })
  icon?: string | null;
}

export class UpdateServiceDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ minLength: 2, maxLength: 80 }) @IsOptional() @trim() @IsString() @Length(2, 80, { message: 'Name must be 2–80 characters' }) name?: string;
  @ApiPropertyOptional({ maxLength: SLUG_MAX_LENGTH }) @IsOptional() @trim() @IsString() @MaxLength(SLUG_MAX_LENGTH) @Matches(SLUG_PATTERN, { message: 'Slug must be lowercase letters, numbers and single hyphens' }) slug?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @Length(2, 80, { each: true, message: 'Synonyms must be 2–80 characters' }) synonyms?: string[];
  @ApiPropertyOptional({ type: String, nullable: true, enum: SERVICE_ICON_KEYS }) @IsOptional() @IsIn(SERVICE_ICON_KEYS, { message: 'Choose an icon from the library' }) icon?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10_000) sortOrder?: number;
}

export class CreateLocalAreaDto extends TermBaseDto {
  @ApiPropertyOptional({ description: 'Editorial introduction (plain text in MVP)', maxLength: 5000 })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(5000)
  editorialIntro?: string;

  @ApiPropertyOptional({ description: 'How eligibility was verified against the approved boundary', maxLength: 255 })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(255)
  eligibilitySource?: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Image shown at the top of the area page (media asset id)' }) @IsOptional() @IsString() @MaxLength(64) imageMediaId?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 180, nullable: true, description: 'Search-result title; the name is used when empty' }) @IsOptional() @trim() @IsString() @MaxLength(180) seoTitle?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 300, nullable: true, description: 'Meta description; the introduction is used when empty' }) @IsOptional() @trim() @IsString() @MaxLength(300) seoDescription?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 255, nullable: true, description: 'Comma-separated keywords' }) @IsOptional() @trim() @IsString() @MaxLength(255) seoKeywords?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Share image (media asset id); the area image, then the site image, is used when empty' }) @IsOptional() @IsString() @MaxLength(64) ogImageMediaId?: string | null;
}

export class UpdateLocalAreaDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ minLength: 2, maxLength: 80 }) @IsOptional() @trim() @IsString() @Length(2, 80, { message: 'Name must be 2–80 characters' }) name?: string;
  @ApiPropertyOptional({ maxLength: SLUG_MAX_LENGTH }) @IsOptional() @trim() @IsString() @MaxLength(SLUG_MAX_LENGTH) @Matches(SLUG_PATTERN, { message: 'Slug must be lowercase letters, numbers and single hyphens' }) slug?: string;
  @ApiPropertyOptional({ maxLength: 5000, nullable: true }) @IsOptional() @trim() @IsString() @MaxLength(5000) editorialIntro?: string | null;
  @ApiPropertyOptional({ maxLength: 255, nullable: true }) @IsOptional() @trim() @IsString() @MaxLength(255) eligibilitySource?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10_000) sortOrder?: number;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Image shown at the top of the area page (media asset id)' }) @IsOptional() @IsString() @MaxLength(64) imageMediaId?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 180, nullable: true, description: 'Search-result title; the name is used when empty' }) @IsOptional() @trim() @IsString() @MaxLength(180) seoTitle?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 300, nullable: true, description: 'Meta description; the introduction is used when empty' }) @IsOptional() @trim() @IsString() @MaxLength(300) seoDescription?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 255, nullable: true, description: 'Comma-separated keywords' }) @IsOptional() @trim() @IsString() @MaxLength(255) seoKeywords?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Share image (media asset id); the area image, then the site image, is used when empty' }) @IsOptional() @IsString() @MaxLength(64) ogImageMediaId?: string | null;
}

export class TermStateDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class TermImageRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() url!: string;
  @ApiProperty() alt!: string;
}

export class CategoryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) parentId!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ type: String, nullable: true }) imageMediaId!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoDescription!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoKeywords!: string | null;
  @ApiProperty({ type: String, nullable: true }) ogImageMediaId!: string | null;
  @ApiProperty({ type: TermImageRefDto, nullable: true, description: 'The chosen image, resolved for the editor preview' }) image!: TermImageRefDto | null;
  @ApiProperty({ type: TermImageRefDto, nullable: true }) ogImage!: TermImageRefDto | null;
  @ApiProperty() active!: boolean;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

/**
 * A category as the admin list shows it: the record, plus the two facts the
 * list needs and the detail screen does not — how many listings use it, and
 * the parent's name rather than its id. Both are computed per page in one
 * query each, so the list stays a fixed number of round trips however many
 * rows it holds.
 */
export class CategoryListItemDto extends CategoryDto {
  @ApiProperty({ description: 'Draft and published listings using this as their primary or an additional category.' }) listingCount!: number;
  @ApiProperty({ type: String, nullable: true }) parentName!: string | null;
}

export class PublicCategoryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: TermImageRefDto, nullable: true, description: 'Card-sized image for tiles and the landing page' }) image!: TermImageRefDto | null;
  @ApiProperty({ type: String, nullable: true }) seoTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoDescription!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoKeywords!: string | null;
  @ApiProperty({ type: TermImageRefDto, nullable: true, description: 'Share image at hero size; null falls back to the category image, then the site image' }) shareImage!: TermImageRefDto | null;
  @ApiProperty({ type: () => [PublicCategoryDto] }) children!: PublicCategoryDto[];
}

export class ServiceDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: [String] }) synonyms!: string[];
  @ApiProperty({ type: String, nullable: true, description: 'Icon key from the shared library; null matches the name' }) icon!: string | null;
  @ApiProperty() active!: boolean;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class ServiceListItemDto extends ServiceDto {
  @ApiProperty({ description: 'Draft and published listings offering this service.' }) listingCount!: number;
}

export class LocalAreaDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: String, nullable: true }) editorialIntro!: string | null;
  @ApiProperty({ type: String, nullable: true }) eligibilitySource!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) eligibilityVerifiedAt!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ type: String, nullable: true }) imageMediaId!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoDescription!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoKeywords!: string | null;
  @ApiProperty({ type: String, nullable: true }) ogImageMediaId!: string | null;
  @ApiProperty({ type: TermImageRefDto, nullable: true }) image!: TermImageRefDto | null;
  @ApiProperty({ type: TermImageRefDto, nullable: true }) ogImage!: TermImageRefDto | null;
  @ApiProperty() active!: boolean;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

/** An approved local area as the public site shows it (SRS BUS 008). */
export class PublicLocalAreaDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: String, nullable: true }) editorialIntro!: string | null;
  @ApiProperty({ type: TermImageRefDto, nullable: true }) image!: TermImageRefDto | null;
  @ApiProperty({ type: String, nullable: true }) seoTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoDescription!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoKeywords!: string | null;
  @ApiProperty({ type: TermImageRefDto, nullable: true }) shareImage!: TermImageRefDto | null;
}

export class LocalAreaListItemDto extends LocalAreaDto {
  @ApiProperty({ description: 'Draft and published listings in this area.' }) listingCount!: number;
}
