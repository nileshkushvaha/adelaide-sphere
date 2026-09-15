import { ApiProperty, ApiPropertyOptional, IntersectionType, OmitType } from '@nestjs/swagger';
import { LINK_KINDS, MAX_LINKS } from '../business-rules.js';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUrl, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.js';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '../../common/slug.js';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const emptyToNull = () => Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value));

export const BUSINESS_SORT_FIELDS = ['name', 'updatedAt', 'createdAt', 'firstPublishedAt', 'status'] as const;

export class ListBusinessesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive match on name, slug, suburb or postcode; digits also match the public phone', maxLength: 120 }) @IsOptional() @trim() @IsString() @MaxLength(120) q?: string;
  @ApiPropertyOptional({ enum: ['draft', 'published', 'archived'] }) @IsOptional() @IsIn(['draft', 'published', 'archived']) status?: 'draft' | 'published' | 'archived';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) localAreaId?: string;
  @ApiPropertyOptional({ enum: BUSINESS_SORT_FIELDS, default: 'updatedAt' }) @IsOptional() @IsIn(BUSINESS_SORT_FIELDS) sort: (typeof BUSINESS_SORT_FIELDS)[number] = 'updatedAt';
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' }) @IsOptional() @IsIn(['asc', 'desc']) override order: 'asc' | 'desc' = 'desc';
  @ApiPropertyOptional({ enum: ['yes', 'no'], description: 'Whether a featured placement is in force right now (SRS DIR 007)' }) @IsOptional() @IsIn(['yes', 'no']) featured?: 'yes' | 'no';
}

export class AddressInputDto {
  @ApiProperty({ maxLength: 120 }) @trim() @IsString() @Length(1, 120) line1!: string;
  @ApiPropertyOptional({ type: String, maxLength: 120, nullable: true }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(120) line2?: string | null;
  @ApiProperty({ maxLength: 80, description: 'Suburb label as displayed' }) @trim() @IsString() @Length(1, 80) suburb!: string;
  @ApiProperty({ description: 'South Australian postcode (5xxx)' }) @trim() @IsString() @Matches(/^5\d{3}$/, { message: 'Postcode must be a South Australian postcode (5xxx)' }) postcode!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) @IsOptional() @IsNumber() @Min(-38.1) @Max(-26) latitude?: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) @IsOptional() @IsNumber() @Min(129) @Max(141) longitude?: number | null;
}

const URL_OPTS = { require_protocol: true, protocols: ['http', 'https'], require_tld: true, disallow_auth: true };

export class BusinessLinkInputDto {
  @ApiProperty({ enum: LINK_KINDS }) @IsIn(LINK_KINDS) kind!: (typeof LINK_KINDS)[number];
  @ApiProperty({ maxLength: 500, description: 'http(s) URL; known kinds must point at their own domain (SRS BUS 003)' }) @trim() @IsString() @MaxLength(500) url!: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 60 }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(60) label?: string | null;
}

export class BusinessLinkDto {
  @ApiProperty({ enum: LINK_KINDS }) kind!: (typeof LINK_KINDS)[number];
  @ApiProperty() url!: string;
  @ApiProperty({ type: String, nullable: true }) label!: string | null;
}

class BusinessFieldsDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 120 }) @IsOptional() @trim() @IsString() @Length(2, 120, { message: 'Name must be 2–120 characters' }) name?: string;
  @ApiPropertyOptional({ maxLength: SLUG_MAX_LENGTH }) @IsOptional() @trim() @IsString() @MaxLength(SLUG_MAX_LENGTH) @Matches(SLUG_PATTERN, { message: 'Slug must be lowercase letters, numbers and single hyphens' }) slug?: string;
  @ApiPropertyOptional({ maxLength: 5000 }) @IsOptional() @trim() @IsString() @MaxLength(5000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) primaryCategoryId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) secondaryCategoryIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) serviceIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) localAreaId?: string;
  @ApiPropertyOptional({ type: String, maxLength: 30, nullable: true }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(30) @Matches(/^[+\d][\d\s()-]{5,29}$/, { message: 'Enter a valid phone number' }) publicPhone?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 254, nullable: true }) @IsOptional() @emptyToNull() @trim() @IsEmail({}, { message: 'Enter a valid email address' }) @MaxLength(254) publicEmail?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true }) @IsOptional() @emptyToNull() @trim() @IsUrl(URL_OPTS, { message: 'Website must be an http(s) URL' }) @MaxLength(500) publicUrl?: string | null;
  @ApiPropertyOptional({ enum: ['full', 'areaOnly'] }) @IsOptional() @IsIn(['full', 'areaOnly']) addressVisibility?: 'full' | 'areaOnly';
  @ApiPropertyOptional({ type: AddressInputDto, nullable: true }) @IsOptional() @ValidateNested() @Type(() => AddressInputDto) address?: AddressInputDto | null;
  @ApiPropertyOptional({ type: String, maxLength: 254, nullable: true, writeOnly: true, description: 'Private enquiry destination; encrypted at rest, never public' }) @IsOptional() @emptyToNull() @trim() @IsEmail({}, { message: 'Enter a valid email address' }) @MaxLength(254) privateEnquiryEmail?: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1836, description: 'The year the business began trading; shown publicly as "n years in business"' }) @IsOptional() @IsInt() establishedYear?: number | null;
  @ApiPropertyOptional({ type: String, maxLength: 180, nullable: true, description: 'Search-result title; the listing name is used when empty' }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(180) seoTitle?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 300, nullable: true, description: 'Meta description; the listing description is used when empty' }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(300) seoDescription?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 255, nullable: true, description: 'Comma-separated keywords' }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(255) seoKeywords?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 64, nullable: true, description: 'A processed media asset used when the listing is shared; the cover photograph is used when empty' }) @IsOptional() @emptyToNull() @IsString() @MaxLength(64) ogImageMediaId?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 255, nullable: true, description: 'How Adelaide eligibility was verified; saving it records the verification time' }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(255) eligibilitySource?: string | null;
  @ApiPropertyOptional({ description: 'Set true once content rights/sources have been reviewed' }) @IsOptional() @IsBoolean() contentRightsReviewed?: boolean;
  @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(500) contentRightsNote?: string | null;
  @ApiPropertyOptional({ type: [BusinessLinkInputDto], description: `Website/social links, replace semantics, at most ${MAX_LINKS}` }) @IsOptional() @IsArray() @ArrayMaxSize(MAX_LINKS) @ValidateNested({ each: true }) @Type(() => BusinessLinkInputDto) links?: BusinessLinkInputDto[];
}

class RequiredBusinessFieldsDto {
  @ApiProperty({ minLength: 2, maxLength: 120 }) @trim() @IsString() @Length(2, 120, { message: 'Name must be 2–120 characters' }) name!: string;
  @ApiProperty() @IsString() @MaxLength(64) primaryCategoryId!: string;
  @ApiProperty() @IsString() @MaxLength(64) localAreaId!: string;
  @ApiProperty({ maxLength: 5000 }) @trim() @IsString() @MaxLength(5000) description!: string;
}

export class CreateBusinessDto extends IntersectionType(RequiredBusinessFieldsDto, OmitType(BusinessFieldsDto, ['name', 'primaryCategoryId', 'localAreaId', 'description'] as const)) {}

export class UpdateBusinessDto extends BusinessFieldsDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
}

export class BusinessStateDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @trim() @IsString() @MaxLength(500) reason?: string;
  @ApiPropertyOptional({ maxLength: 500, description: 'Required to publish a listing flagged as a possible duplicate (SRS BUS 007)' }) @IsOptional() @trim() @IsString() @Length(5, 500) duplicateOverrideReason?: string;
}

export class BusinessAddressDto {
  @ApiProperty() line1!: string;
  @ApiProperty({ type: String, nullable: true }) line2!: string | null;
  @ApiProperty() suburb!: string;
  @ApiProperty() postcode!: string;
  @ApiProperty({ type: Number, nullable: true }) latitude!: number | null;
  @ApiProperty({ type: Number, nullable: true }) longitude!: number | null;
}

export class DuplicateWarningDto {
  @ApiProperty() businessId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: ['name_and_address', 'name_and_phone', 'name'] }) match!: 'name_and_address' | 'name_and_phone' | 'name';
}

/** A preview of a chosen image, so the editor can show what is selected. */
export class BusinessImagePreviewDto {
  @ApiProperty() id!: string;
  @ApiProperty() url!: string;
  @ApiProperty() alt!: string;
}

export class BusinessDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: ['draft', 'published', 'archived'] }) status!: 'draft' | 'published' | 'archived';
  @ApiProperty() primaryCategoryId!: string;
  @ApiProperty({ type: [String] }) secondaryCategoryIds!: string[];
  @ApiProperty({ type: [String] }) serviceIds!: string[];
  @ApiProperty() localAreaId!: string;
  @ApiProperty({ type: String, nullable: true }) publicPhone!: string | null;
  @ApiProperty({ type: String, nullable: true }) publicEmail!: string | null;
  @ApiProperty({ type: String, nullable: true }) publicUrl!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'tel: link derived from publicPhone (SRS BUS 003)' }) telHref!: string | null;
  @ApiProperty({ type: [BusinessLinkDto] }) links!: BusinessLinkDto[];
  @ApiProperty({ enum: ['unknown', 'scheduled'], description: 'Operating hours state; see GET /admin/businesses/{id}/hours' }) hoursMode!: 'unknown' | 'scheduled';
  @ApiProperty({ enum: ['full', 'areaOnly'] }) addressVisibility!: 'full' | 'areaOnly';
  @ApiProperty({ type: BusinessAddressDto, nullable: true }) address!: BusinessAddressDto | null;
  @ApiProperty({ type: String, nullable: true, description: 'Only present for listings.write holders on the detail endpoint' }) privateEnquiryEmail?: string | null;
  @ApiProperty() hasPrivateEnquiryEmail!: boolean;
  @ApiProperty({ type: Number, nullable: true }) establishedYear!: number | null;
  @ApiProperty({ type: String, nullable: true }) seoTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoDescription!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoKeywords!: string | null;
  @ApiProperty({ type: String, nullable: true }) ogImageMediaId!: string | null;
  @ApiProperty({ type: BusinessImagePreviewDto, nullable: true, description: 'The share image, for the editor preview' }) ogImage!: BusinessImagePreviewDto | null;
  @ApiProperty({ type: String, nullable: true }) eligibilitySource!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) eligibilityVerifiedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) contentRightsReviewedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) contentRightsNote!: string | null;
  @ApiProperty({ type: String, nullable: true }) duplicateOverrideReason!: string | null;
  @ApiProperty({ type: [DuplicateWarningDto] }) duplicateWarnings!: DuplicateWarningDto[];
  @ApiProperty({ type: [String], description: 'Unmet publication requirements (SRS BUS 002); empty when publishable' }) publicationBlockers!: string[];
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) firstPublishedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) publishedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) archivedAt!: string | null;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class BusinessListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: ['draft', 'published', 'archived'] }) status!: 'draft' | 'published' | 'archived';
  @ApiProperty() primaryCategoryId!: string;
  @ApiProperty() primaryCategoryName!: string;
  @ApiProperty() localAreaId!: string;
  @ApiProperty() localAreaName!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Suburb of the street address, where there is one' }) suburb!: string | null;
  @ApiProperty({ description: 'A featured placement is in force right now (SRS DIR 007)' }) featuredNow!: boolean;
  @ApiProperty() publishable!: boolean;
  @ApiProperty() duplicateFlagged!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) firstPublishedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty() version!: number;
}
