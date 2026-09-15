import { ApiExtraModels, ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { PRICING_LIMITS, PRICING_PERIODS, PRICING_PLAN_KEYS, type PricingPeriod, type PricingPlanKey } from '@adelaide-sphere/domain';
import { LIMITS, SOCIAL_PLATFORMS, type SocialPlatform } from '../general-settings.js';

/** One published price (SRS 1.12). The DTO checks shape; `validateGeneralSettings` applies the rules and defaults. */
export class PricingPlanDto {
  @ApiProperty({ enum: PRICING_PLAN_KEYS }) @IsIn(PRICING_PLAN_KEYS) key!: PricingPlanKey;
  @ApiProperty({ maxLength: PRICING_LIMITS.name.max }) @IsString() @MaxLength(PRICING_LIMITS.name.max) name!: string;
  @ApiProperty({ description: 'Australian cents, GST inclusive' }) @IsInt() @Min(0) @Max(PRICING_LIMITS.priceCents) priceCents!: number;
  @ApiProperty({ enum: PRICING_PERIODS }) @IsIn(PRICING_PERIODS) period!: PricingPeriod;
  @ApiProperty({ type: String, nullable: true, maxLength: PRICING_LIMITS.summary }) @IsOptional() @IsString() @MaxLength(PRICING_LIMITS.summary) summary!: string | null;
  @ApiProperty({ type: [String], maxItems: PRICING_LIMITS.features }) @IsArray() @ArrayMaxSize(PRICING_LIMITS.features) @IsString({ each: true }) @MaxLength(PRICING_LIMITS.feature, { each: true }) features!: string[];
}

export class PricingSettingsDto {
  @ApiProperty({ description: 'Whether prices are shown on the home and contact pages' }) @IsBoolean() enabled!: boolean;
  @ApiProperty({ type: [PricingPlanDto] }) @IsArray() @ArrayMaxSize(PRICING_PLAN_KEYS.length) @ValidateNested({ each: true }) @Type(() => PricingPlanDto) plans!: PricingPlanDto[];
}

/**
 * One optional profile URL per platform. The DTO only checks shape and length;
 * `validateGeneralSettings` enforces that each link stays on its own domain
 * (SRS CFG 001, BUS 003 link rules).
 */
export class SocialLinksDto {
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITS.socialUrl }) @IsOptional() @IsString() @MaxLength(LIMITS.socialUrl) facebook?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITS.socialUrl }) @IsOptional() @IsString() @MaxLength(LIMITS.socialUrl) instagram?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITS.socialUrl }) @IsOptional() @IsString() @MaxLength(LIMITS.socialUrl) x?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITS.socialUrl }) @IsOptional() @IsString() @MaxLength(LIMITS.socialUrl) youtube?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITS.socialUrl }) @IsOptional() @IsString() @MaxLength(LIMITS.socialUrl) pinterest?: string | null;
}

/** General settings as an administrator edits them (SRS CFG 001). */
export class GeneralSettingsDto {
  @ApiProperty({ minLength: LIMITS.applicationName.min, maxLength: LIMITS.applicationName.max, description: 'Public name used in the header, page titles and the copyright line' })
  @IsString()
  @MaxLength(LIMITS.applicationName.max)
  applicationName!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITS.shortName, description: 'Compact name for tight spaces' }) @IsOptional() @IsString() @MaxLength(LIMITS.shortName) shortName?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITS.organisationName }) @IsOptional() @IsString() @MaxLength(LIMITS.organisationName) organisationName?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITS.tagline, description: 'Shown after the name in the browser title' }) @IsOptional() @IsString() @MaxLength(LIMITS.tagline) tagline?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITS.metaDescription, description: 'Default meta description (SRS SEO 001)' })
  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.metaDescription)
  metaDescription?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITS.supportEmail, description: 'Published contact address; a development domain is refused' })
  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.supportEmail)
  supportEmail?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITS.supportPhone, description: 'Australian phone number; stored normalised' }) @IsOptional() @IsString() @MaxLength(LIMITS.supportPhone) supportPhone?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITS.websiteUrl }) @IsOptional() @IsString() @MaxLength(LIMITS.websiteUrl) websiteUrl?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITS.address, description: 'At most four lines' }) @IsOptional() @IsString() @MaxLength(LIMITS.address) address?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITS.mediaId, description: 'Ready media asset used as the logo' }) @IsOptional() @IsString() @MaxLength(LIMITS.mediaId) logoMediaId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITS.mediaId, description: 'Ready media asset used on dark backgrounds' }) @IsOptional() @IsString() @MaxLength(LIMITS.mediaId) darkLogoMediaId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITS.mediaId, description: 'Ready media asset used as the browser icon' }) @IsOptional() @IsString() @MaxLength(LIMITS.mediaId) faviconMediaId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITS.mediaId, description: 'Default social share image' }) @IsOptional() @IsString() @MaxLength(LIMITS.mediaId) shareImageMediaId?: string | null;

  @ApiPropertyOptional({ description: 'Contact strip above the public navigation; refused while it would be empty' }) @IsOptional() @IsBoolean() headerTopBarEnabled?: boolean;
  @ApiPropertyOptional({ type: SocialLinksDto }) @IsOptional() @IsObject() @ValidateNested() @Type(() => SocialLinksDto) social?: SocialLinksDto;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITS.copyrightText, description: 'Supports {year} and {name}; empty uses the built-in line' })
  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.copyrightText)
  copyrightText?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITS.footerText }) @IsOptional() @IsString() @MaxLength(LIMITS.footerText) footerText?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITS.siteMapSrc, description: 'Google Maps "Embed a map" HTML or address for the map above the footer; empty shows Adelaide' }) @IsOptional() @IsString() @MaxLength(LIMITS.siteMapSrc) siteMapSrc?: string | null;
  @ApiPropertyOptional({ type: PricingSettingsDto, description: 'Published prices (SRS 1.12)' }) @IsOptional() @IsObject() @ValidateNested() @Type(() => PricingSettingsDto) pricing?: PricingSettingsDto;
}

export class UpdateGeneralSettingsDto extends GeneralSettingsDto {
  @ApiProperty({ minimum: 0, description: 'Version returned by GET; 0 when no settings row has been saved yet' }) @IsInt() @Min(0) expectedVersion!: number;
}

export class SettingsImageDto {
  @ApiProperty() id!: string;
  @ApiProperty() url!: string;
  @ApiProperty() alt!: string;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
}

export class PublicPhoneNumberDto {
  @ApiProperty({ description: 'Formatted for reading, e.g. 03 9000 0000' }) display!: string;
  @ApiProperty({ description: 'tel: href for dialling' }) telHref!: string;
}

/** The stored record as the admin screen reads it back, with branding resolved for preview. */
export class GeneralSettingsRecordDto extends GeneralSettingsDto {
  @ApiProperty({ type: PublicPhoneNumberDto, nullable: true, description: 'Normalised phone; null when none is set' }) supportPhoneDisplay!: PublicPhoneNumberDto | null;
  @ApiProperty({ type: SettingsImageDto, nullable: true }) logo!: SettingsImageDto | null;
  @ApiPropertyOptional({ type: SettingsImageDto, nullable: true }) darkLogo?: SettingsImageDto | null;
  @ApiProperty({ type: SettingsImageDto, nullable: true }) favicon!: SettingsImageDto | null;
  @ApiProperty({ type: SettingsImageDto, nullable: true }) shareImage!: SettingsImageDto | null;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: String, nullable: true }) updatedByAdminId!: string | null;
}

export class PublicSocialLinkDto {
  @ApiProperty({ enum: SOCIAL_PLATFORMS }) platform!: SocialPlatform;
  @ApiProperty() url!: string;
}

export class PublicSiteContactDto {
  @ApiProperty({ type: String, nullable: true, description: 'Published only when a routable address is configured' }) email!: string | null;
  @ApiProperty({ type: PublicPhoneNumberDto, nullable: true }) phone!: PublicPhoneNumberDto | null;
  @ApiProperty({ type: String, nullable: true }) websiteUrl!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Free text, at most four lines' }) address!: string | null;
}

export class PublicSiteBrandingDto {
  @ApiProperty({ type: SettingsImageDto, nullable: true }) logo!: SettingsImageDto | null;
  @ApiPropertyOptional({ type: SettingsImageDto, nullable: true }) darkLogo?: SettingsImageDto | null;
  @ApiProperty({ type: SettingsImageDto, nullable: true, description: 'Smallest rendition, used as the browser icon' }) favicon!: SettingsImageDto | null;
  @ApiProperty({ type: SettingsImageDto, nullable: true, description: 'Default Open Graph image' }) shareImage!: SettingsImageDto | null;
}

/** The map above the footer (SRS 1.11 BUS 003); always present, loaded only when a visitor asks. */
export class PublicSiteMapDto {
  @ApiProperty({ description: 'A validated Google Maps embed address, or the built-in Adelaide map' }) src!: string;
  @ApiProperty() title!: string;
}

/** Prices for the home and contact pages (SRS 1.12); ordered through the contact form, never paid on the site. */
export class PublicPricingDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ enum: ['AUD'] }) currency!: 'AUD';
  @ApiProperty({ description: 'Amounts include GST' }) gstInclusive!: boolean;
  @ApiProperty({ type: [PricingPlanDto] }) plans!: PricingPlanDto[];
}

export class PublicSiteFooterDto {
  @ApiProperty({ type: String, nullable: true, description: 'Template with {year} and {name}; clients render it so the year is never stale' }) copyrightText!: string | null;
  @ApiProperty({ type: String, nullable: true }) text!: string | null;
}

/** Everything the public site needs to render its shell (SRS CFG 001, UX 002). */
/**
 * Search metadata the public site applies to the routes with no record of
 * their own, with each share image already resolved so the site never has to
 * look one up while rendering a page.
 */
export class PublicRouteSeoEntryDto {
  @ApiProperty({ type: String, nullable: true }) metaTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) metaDescription!: string | null;
  @ApiProperty({ type: String, nullable: true }) metaKeywords!: string | null;
  @ApiProperty({ type: String, nullable: true }) canonicalUrl!: string | null;
  @ApiProperty({ description: '"default" means the page keeps its own rule' }) robots!: string;
  @ApiProperty({ type: SettingsImageDto, nullable: true }) ogImage!: SettingsImageDto | null;
}

export class PublicAnalyticsDto {
  @ApiProperty({ type: String, nullable: true }) googleAnalyticsId!: string | null;
  @ApiProperty({ type: String, nullable: true }) googleTagManagerId!: string | null;
  @ApiProperty({ type: String, nullable: true }) facebookPixelId!: string | null;
}

export class PublicRouteSeoDto {
  @ApiProperty({ type: 'object', additionalProperties: { $ref: getSchemaPath(PublicRouteSeoEntryDto) }, description: 'Keyed by route; every declared route is present' })
  routes!: Record<string, PublicRouteSeoEntryDto>;
  @ApiProperty() twitterCard!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Search Console verification tag' })
  googleSiteVerification!: string | null;
  @ApiProperty({ type: PublicAnalyticsDto, description: 'Loaded by the public site only after the visitor accepts analytics cookies' })
  analytics!: PublicAnalyticsDto;
}

@ApiExtraModels(PublicRouteSeoEntryDto)
export class PublicSiteSettingsDto {
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) shortName!: string | null;
  @ApiProperty({ type: String, nullable: true }) organisationName!: string | null;
  @ApiProperty({ type: String, nullable: true }) tagline!: string | null;
  @ApiProperty({ type: String, nullable: true }) metaDescription!: string | null;
  @ApiProperty({ type: PublicSiteContactDto }) contact!: PublicSiteContactDto;
  @ApiProperty({ type: PublicSiteBrandingDto }) branding!: PublicSiteBrandingDto;
  @ApiProperty({ description: 'Whether the contact strip above the navigation is shown' }) headerTopBarEnabled!: boolean;
  @ApiProperty({ type: [PublicSocialLinkDto], description: 'Configured profiles in a fixed order; empty when none are set' }) social!: PublicSocialLinkDto[];
  @ApiProperty({ type: PublicSiteFooterDto }) footer!: PublicSiteFooterDto;
  @ApiProperty({ type: PublicSiteMapDto }) siteMap!: PublicSiteMapDto;
  @ApiProperty({ type: PublicPricingDto }) pricing!: PublicPricingDto;
  @ApiProperty({ type: PublicRouteSeoDto }) seo!: PublicRouteSeoDto;
}
