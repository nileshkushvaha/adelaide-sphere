import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../common/pagination.js';
import { MAX_PATH_LENGTH } from '../redirect-rules.js';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

// Appended, matching the database enum's order — see the migration for why the
// order matters there.
export const REDIRECT_KINDS = ['permanent', 'gone', 'temporary'] as const;
export type RedirectKindValue = (typeof REDIRECT_KINDS)[number];

export class RedirectDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Canonical site-relative path that redirects' }) sourcePath!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Site-relative destination; null for a 410' }) targetPath!: string | null;
  @ApiProperty({ enum: REDIRECT_KINDS }) kind!: RedirectKindValue;
  @ApiProperty({ description: 'An inactive rule is kept but not served: the site behaves as though it were not there.' }) isActive!: boolean;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ type: String, nullable: true }) resourceType!: string | null;
  @ApiProperty({ type: String, nullable: true }) resourceId!: string | null;
  @ApiProperty({ type: String, nullable: true }) createdByAdminId!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class CreateRedirectDto {
  @ApiProperty({ maxLength: MAX_PATH_LENGTH, example: '/business/old-slug' }) @trim() @IsString() @Length(1, MAX_PATH_LENGTH) sourcePath!: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_PATH_LENGTH, example: '/business/new-slug', description: 'Required unless kind is "gone"' })
  @IsOptional() @trim() @IsString() @MaxLength(MAX_PATH_LENGTH) targetPath?: string | null;
  @ApiPropertyOptional({ enum: REDIRECT_KINDS, default: 'permanent' }) @IsOptional() @IsIn(REDIRECT_KINDS) kind?: RedirectKindValue;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @trim() @IsString() @MaxLength(500) reason?: string;
  @ApiPropertyOptional({ enum: ['business', 'post', 'page'] }) @IsOptional() @IsIn(['business', 'post', 'page']) resourceType?: string;
  @ApiPropertyOptional({ maxLength: 64 }) @IsOptional() @IsString() @MaxLength(64) resourceId?: string;
}

export class ListRedirectsQueryDto {
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(120) q?: string;
  @ApiPropertyOptional({ enum: REDIRECT_KINDS }) @IsOptional() @IsIn(REDIRECT_KINDS) kind?: RedirectKindValue;
  @ApiPropertyOptional({ description: 'Only rules that are on, or only those switched off.' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isActive?: boolean;
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE) pageSize?: number = DEFAULT_PAGE_SIZE;
}

export class RedirectResolutionDto {
  @ApiProperty({ enum: REDIRECT_KINDS }) kind!: RedirectKindValue;
  @ApiProperty({ enum: [301, 302, 410], description: 'Status the site must return' }) status!: 301 | 302 | 410;
  @ApiProperty({ type: String, nullable: true }) targetPath!: string | null;
}

/** State change for a rule. Absolute and idempotent, so it carries no version. */
export class RedirectStateDto {
  @ApiPropertyOptional({ maxLength: 500, description: 'Recorded in the audit log' }) @IsOptional() @trim() @IsString() @MaxLength(500) reason?: string;
}

/**
 * What a path would do, for an administrator. Unlike the public resolution this
 * says *why* nothing happens, which the public route must never disclose.
 */
export class RedirectPreviewDto {
  @ApiProperty({ description: 'Exactly what was asked about' }) requestedPath!: string;
  @ApiProperty({ type: String, nullable: true, description: 'The path after normalisation; null when it is not a usable path' }) normalisedPath!: string | null;
  @ApiPropertyOptional({ type: RedirectDto, nullable: true }) rule!: RedirectDto | null;
  @ApiProperty({ type: Number, nullable: true, enum: [301, 302, 410], description: 'Null when nothing happens' }) status!: 301 | 302 | 410 | null;
  @ApiProperty({ type: String, nullable: true }) targetPath!: string | null;
  @ApiProperty({ enum: ['applies', 'inactive', 'no-rule', 'no-target', 'invalid-path'] })
  outcome!: 'applies' | 'inactive' | 'no-rule' | 'no-target' | 'invalid-path';
}

/** Slug change of a published listing or article (SRS SEO 004, UX 003). */
export class ChangeSlugDto {
  @ApiProperty({ maxLength: 200, description: 'New slug; the old public path becomes a 301' }) @trim() @IsString() @Length(1, 200) slug!: string;
  @ApiProperty({ minimum: 1 }) @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ maxLength: 500, description: 'Recorded on the redirect and in the audit log' }) @IsOptional() @trim() @IsString() @MaxLength(500) reason?: string;
}
