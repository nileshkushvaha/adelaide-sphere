import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../common/pagination.js';
import { REVIEW_STATES } from '../review-rules.js';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const collapse = () => Transform(({ value }) => (typeof value === 'string' ? value.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim() : value));

/** Visitor review submission (SRS REV 001). No account exists; the email is for moderation contact only. */
export class SubmitReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5, description: 'Whole number 1–5' }) @Type(() => Number) @IsInt() @Min(1) @Max(5) rating!: number;
  @ApiProperty({ minLength: 2, maxLength: 80 }) @trim() @IsString() @Length(2, 80, { message: 'Name must be 2–80 characters' }) displayName!: string;
  @ApiProperty({ maxLength: 254, writeOnly: true, description: 'Never published; used for moderation contact only' }) @trim() @IsEmail({}, { message: 'Enter a valid email address' }) @MaxLength(254) email!: string;
  @ApiProperty({ minLength: 20, maxLength: 3000 }) @collapse() @IsString() @Length(20, 3000, { message: 'Review must be 20–3000 characters' }) text!: string;
  @ApiProperty({ description: 'Acknowledgement of the review guidelines and privacy notice (SRS PRIV 001)' }) @IsBoolean() acknowledged!: boolean;
  @ApiPropertyOptional({ description: 'Turnstile token (SRS SEC 002)' }) @IsOptional() @IsString() @MaxLength(2048) captchaToken?: string;
  @ApiPropertyOptional({ description: 'Honeypot: must stay empty', writeOnly: true }) @IsOptional() @IsString() @MaxLength(200) website?: string;
}

export class SubmissionReceiptDto {
  @ApiProperty({ description: 'Opaque reference the visitor can quote; not a review id' }) receiptId!: string;
  @ApiProperty({ enum: ['pending'] }) status!: 'pending';
  @ApiProperty({ description: 'Neutral acknowledgement text' }) message!: string;
}

export class PublicReviewDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ minimum: 1, maximum: 5 }) rating!: number;
  @ApiProperty({ description: 'Redacted text when an editor replaced it, otherwise the original' }) text!: string;
  @ApiProperty({ description: 'True when an editor redacted the published text (SRS REV 003)' }) redacted!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class ListPublicReviewsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE) pageSize = DEFAULT_PAGE_SIZE;
  @ApiPropertyOptional({ enum: ['newest', 'highest', 'lowest'], default: 'newest' }) @IsOptional() @IsIn(['newest', 'highest', 'lowest']) sort: 'newest' | 'highest' | 'lowest' = 'newest';
}

export const REPORT_REASONS = ['spam', 'offensive', 'misleading', 'privacy', 'other'] as const;

/** Abuse report on an approved review (SRS REP 001). */
export class SubmitReportDto {
  @ApiPropertyOptional({ description: 'Approved review being reported; provide exactly one target (SRS REP 001)' }) @IsOptional() @IsString() @MaxLength(64) reviewId?: string;
  @ApiPropertyOptional({ description: 'Approved comment being reported; provide exactly one target' }) @IsOptional() @IsString() @MaxLength(64) commentId?: string;
  @ApiProperty({ enum: REPORT_REASONS }) @IsIn(REPORT_REASONS) reason!: (typeof REPORT_REASONS)[number];
  @ApiPropertyOptional({ maxLength: 1000 }) @IsOptional() @collapse() @IsString() @MaxLength(1000) details?: string;
  @ApiPropertyOptional({ maxLength: 254, writeOnly: true, description: 'Optional private contact; never disclosed' }) @IsOptional() @trim() @IsEmail({}, { message: 'Enter a valid email address' }) @MaxLength(254) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2048) captchaToken?: string;
  @ApiPropertyOptional({ writeOnly: true }) @IsOptional() @IsString() @MaxLength(200) website?: string;
}

export class ReportReceiptDto {
  @ApiProperty() receiptId!: string;
  @ApiProperty({ enum: ['received'] }) status!: 'received';
  @ApiProperty() message!: string;
}

// ---- admin -----------------------------------------------------------------

export class AdminReviewDto {
  @ApiProperty() id!: string;
  @ApiProperty() businessId!: string;
  @ApiProperty() businessName!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ description: 'Only present for moderators; never public' }) email!: string;
  @ApiProperty() rating!: number;
  @ApiProperty({ description: 'Exactly as submitted (SRS REV 003)' }) originalText!: string;
  @ApiProperty({ type: String, nullable: true }) publicText!: string | null;
  @ApiProperty({ type: String, nullable: true }) redactionReason!: string | null;
  @ApiProperty({ enum: REVIEW_STATES }) status!: (typeof REVIEW_STATES)[number];
  @ApiProperty({ type: String, nullable: true }) moderationReason!: string | null;
  @ApiProperty({ type: String, nullable: true }) moderatorAdminId!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) decidedAt!: string | null;
  @ApiProperty({ description: 'Same email reviewed this business recently (SRS REV 005)' }) repeatFlagged!: boolean;
  @ApiProperty() openReportCount!: number;
  @ApiProperty() acknowledgedVersion!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class ListAdminReviewsQueryDto {
  @ApiPropertyOptional({ description: 'One record by id, so an abuse report can link to the item it is about' }) @IsOptional() @IsString() @MaxLength(64) id?: string;
  @ApiPropertyOptional({ enum: REVIEW_STATES }) @IsOptional() @IsIn(REVIEW_STATES) status?: (typeof REVIEW_STATES)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) businessId?: string;
  @ApiPropertyOptional({ description: 'Only reviews flagged as repeat submissions' }) @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() repeatFlagged?: boolean;
  @ApiPropertyOptional({ description: 'Only reviews with open abuse reports' }) @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() reported?: boolean;
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE) pageSize = DEFAULT_PAGE_SIZE;
}

export class ModerateReviewDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ maxLength: 500, description: 'Recorded in the audit log; required for reject and spam' }) @IsOptional() @trim() @IsString() @MaxLength(500) reason?: string;
}

export class RedactReviewDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty({ type: String, nullable: true, maxLength: 3000, description: 'Published text; null restores the original' }) @IsOptional() @collapse() @IsString() @MaxLength(3000) publicText!: string | null;
  @ApiProperty({ maxLength: 500, description: 'Why the text was changed (SRS REV 003)' }) @trim() @IsString() @Length(5, 500) reason!: string;
}

export class AdminReportDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['review', 'comment'] }) targetType!: 'review' | 'comment';
  @ApiProperty({ type: String, nullable: true }) reviewId!: string | null;
  @ApiProperty({ type: String, nullable: true }) commentId!: string | null;
  @ApiProperty({ description: 'Business id for a review, article id for a comment' }) parentId!: string;
  @ApiProperty() reason!: string;
  @ApiProperty({ type: String, nullable: true }) details!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Only present for report handlers' }) reporterEmail!: string | null;
  @ApiProperty({ description: 'Public content as reported (SRS REP 001)' }) targetSnapshot!: string;
  @ApiProperty({ enum: ['open', 'investigating', 'resolved'] }) status!: 'open' | 'investigating' | 'resolved';
  @ApiProperty({ type: String, nullable: true, enum: ['retain', 'remove', 'spam'] }) outcome!: 'retain' | 'remove' | 'spam' | null;
  @ApiProperty({ type: String, nullable: true }) resolutionNote!: string | null;
  @ApiProperty({ type: String, nullable: true }) moderatorAdminId!: string | null;
  @ApiProperty({ enum: REVIEW_STATES, description: 'Current status of the reported review or comment' }) targetStatus!: (typeof REVIEW_STATES)[number];
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) resolvedAt!: string | null;
}

export class ListAdminReportsQueryDto {
  @ApiPropertyOptional({ enum: ['open', 'investigating', 'resolved'] }) @IsOptional() @IsIn(['open', 'investigating', 'resolved']) status?: 'open' | 'investigating' | 'resolved';
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE) pageSize = DEFAULT_PAGE_SIZE;
}

export class ResolveReportDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty({ enum: ['retain', 'remove', 'spam'], description: 'Removing the content is a separate review decision (SRS REP 002)' }) @IsIn(['retain', 'remove', 'spam']) outcome!: 'retain' | 'remove' | 'spam';
  @ApiPropertyOptional({ maxLength: 1000 }) @IsOptional() @collapse() @IsString() @MaxLength(1000) note?: string;
}

export class InvestigateReportDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
}
