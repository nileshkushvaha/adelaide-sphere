import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../common/pagination.js';
import { REVIEW_STATES } from '../../reviews/review-rules.js';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const collapse = () => Transform(({ value }) => (typeof value === 'string' ? value.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim() : value));

/** Visitor comment or reply (SRS COM 001, 1.10: two levels). Plain text only; no login. */
export class SubmitCommentDto {
  @ApiProperty({ minLength: 2, maxLength: 80 }) @trim() @IsString() @Length(2, 80, { message: 'Name must be 2–80 characters' }) displayName!: string;
  @ApiProperty({ maxLength: 254, writeOnly: true, description: 'Never published; moderation contact only' }) @trim() @IsEmail({}, { message: 'Enter a valid email address' }) @MaxLength(254) email!: string;
  @ApiProperty({ minLength: 2, maxLength: 2000 }) @collapse() @IsString() @Length(2, 2000, { message: 'Comment must be 2–2000 characters' }) text!: string;
  @ApiProperty({ description: 'Acknowledgement of the comment guidelines and privacy notice' }) @IsBoolean() acknowledged!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2048) captchaToken?: string;
  @ApiPropertyOptional({ writeOnly: true }) @IsOptional() @IsString() @MaxLength(200) website?: string;
  @ApiPropertyOptional({ maxLength: 64, description: 'The approved comment being replied to; a reply to a reply joins the same thread (two levels)' }) @IsOptional() @IsString() @MaxLength(64) parentId?: string;
}

export class CommentReceiptDto {
  @ApiProperty() receiptId!: string;
  @ApiProperty({ enum: ['pending'] }) status!: 'pending';
  @ApiProperty() message!: string;
}

export class PublicCommentDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() text!: string;
  @ApiProperty() redacted!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, nullable: true, description: 'The top-level comment this replies to' }) parentId!: string | null;
  @ApiProperty({ description: 'Written by the Adelaide Sphere team' }) staff!: boolean;
  @ApiProperty({ type: () => [PublicCommentDto], description: 'Approved replies, oldest first; always empty on a reply' }) replies!: PublicCommentDto[];
}

export class ListPublicCommentsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE) pageSize = 20;
}

export class AdminCommentDto {
  @ApiProperty() id!: string;
  @ApiProperty() postId!: string;
  @ApiProperty() postTitle!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Masked; visible to moderators only; null on a team reply' }) email!: string | null;
  @ApiProperty() originalText!: string;
  @ApiProperty({ type: String, nullable: true }) publicText!: string | null;
  @ApiProperty({ type: String, nullable: true }) redactionReason!: string | null;
  @ApiProperty({ enum: REVIEW_STATES }) status!: (typeof REVIEW_STATES)[number];
  @ApiProperty({ type: String, nullable: true }) moderationReason!: string | null;
  @ApiProperty({ type: String, nullable: true }) moderatorAdminId!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) decidedAt!: string | null;
  @ApiProperty() openReportCount!: number;
  @ApiProperty({ type: String, nullable: true }) acknowledgedVersion!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'The top-level comment this replies to' }) parentId!: string | null;
  @ApiProperty({ type: String, nullable: true }) parentDisplayName!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'The start of the comment being replied to' }) parentExcerpt!: string | null;
  @ApiProperty({ description: 'A reply written by the team from moderation' }) staff!: boolean;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class ListAdminCommentsQueryDto {
  @ApiPropertyOptional({ enum: REVIEW_STATES }) @IsOptional() @IsIn(REVIEW_STATES) status?: (typeof REVIEW_STATES)[number];
  @ApiPropertyOptional({ description: 'One record by id, so an abuse report can link to the item it is about' }) @IsOptional() @IsString() @MaxLength(64) id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) postId?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() reported?: boolean;
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE) pageSize = DEFAULT_PAGE_SIZE;
}

export class ModerateCommentDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ maxLength: 500, description: 'Required for reject and spam' }) @IsOptional() @trim() @IsString() @MaxLength(500) reason?: string;
}

export class RedactCommentDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty({ type: String, nullable: true, maxLength: 2000 }) @IsOptional() @collapse() @IsString() @MaxLength(2000) publicText!: string | null;
  @ApiProperty({ maxLength: 500 }) @trim() @IsString() @Length(5, 500) reason!: string;
}

/** A reply from the Adelaide Sphere team, written in moderation and published at once (SRS 1.10 COM 001). */
export class StaffReplyDto {
  @ApiProperty({ minLength: 2, maxLength: 2000 }) @collapse() @IsString() @Length(2, 2000, { message: 'Reply must be 2–2000 characters' }) text!: string;
}
