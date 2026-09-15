import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { ROBOTS_DIRECTIVES } from '@adelaide-sphere/domain';
import { TWITTER_CARD_TYPES } from '../seo-settings.js';
import { SettingsImageDto } from './general-settings.dto.js';

/**
 * The per-route document is an open map keyed by route, so the shape is
 * described here for the contract and checked by `validateSeoSettings`, which
 * is the authority: a DTO cannot express "one entry per declared route, every
 * field optional, unknown routes dropped".
 */
export class RouteSeoDto {
  @ApiProperty({ type: String, nullable: true }) metaTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) metaDescription!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Comma-separated; recorded and published, but search engines ignore it' }) metaKeywords!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Absolute https URL; null means the page’s own address' }) canonicalUrl!: string | null;
  @ApiProperty({ enum: ROBOTS_DIRECTIVES }) robots!: (typeof ROBOTS_DIRECTIVES)[number];
  @ApiProperty({ type: String, nullable: true }) ogImageMediaId!: string | null;
}

@ApiExtraModels(RouteSeoDto, SettingsImageDto)
export class SeoVerificationDto {
  @ApiProperty({ type: String, nullable: true }) googleSearchConsole!: string | null;
  @ApiProperty({ type: String, nullable: true }) googleAnalyticsId!: string | null;
  @ApiProperty({ type: String, nullable: true }) googleTagManagerId!: string | null;
  @ApiProperty({ type: String, nullable: true }) facebookPixelId!: string | null;
}

export class SeoSettingsRecordDto {
  @ApiProperty({ type: 'object', additionalProperties: { $ref: getSchemaPath(RouteSeoDto) }, description: 'One entry per route declared in SEO_ROUTES' })
  routes!: Record<string, RouteSeoDto>;
  @ApiProperty({ enum: TWITTER_CARD_TYPES }) twitterCard!: (typeof TWITTER_CARD_TYPES)[number];
  @ApiProperty({ type: SeoVerificationDto }) verification!: SeoVerificationDto;
  @ApiProperty({ type: 'object', additionalProperties: { $ref: getSchemaPath(SettingsImageDto) }, description: 'Resolved share image per route, for preview; absent when none is set' })
  shareImages!: Record<string, SettingsImageDto>;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: String, nullable: true }) updatedByAdminId!: string | null;
}

export class UpdateSeoSettingsDto {
  @ApiProperty({ type: 'object', additionalProperties: { type: 'object' } }) @IsOptional() @IsObject() routes?: Record<string, unknown>;
  @ApiProperty({ enum: TWITTER_CARD_TYPES, required: false }) @IsOptional() @IsString() twitterCard?: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } }) @IsOptional() @IsObject() verification?: Record<string, unknown>;
  @ApiProperty({ minimum: 0, description: 'Version returned by GET; 0 when nothing has been saved yet' }) @IsInt() @Min(0) expectedVersion!: number;
}
