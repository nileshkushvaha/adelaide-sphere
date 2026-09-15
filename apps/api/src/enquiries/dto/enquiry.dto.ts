import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../common/pagination.js';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const collapse = () => Transform(({ value }) => (typeof value === 'string' ? value.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim() : value));

export const HANDLING_STATUSES = ['new', 'inProgress', 'closed'] as const;
export const DELIVERY_STATUSES = ['queued', 'providerAccepted', 'delivered', 'retrying', 'failed', 'suppressed'] as const;

/** Visitor enquiry (SRS ENQ 001). No destination field exists: the recipient comes from the listing. */
export class SubmitEnquiryDto {
  @ApiProperty({ minLength: 2, maxLength: 80 }) @trim() @IsString() @Length(2, 80, { message: 'Name must be 2\u201380 characters' }) name!: string;
  @ApiProperty({ maxLength: 254, writeOnly: true }) @trim() @IsEmail({}, { message: 'Enter a valid email address' }) @MaxLength(254) email!: string;
  @ApiPropertyOptional({ maxLength: 30, writeOnly: true }) @IsOptional() @trim() @IsString() @MaxLength(30) phone?: string;
  @ApiProperty({ minLength: 3, maxLength: 150 }) @collapse() @IsString() @Length(3, 150) subject!: string;
  @ApiProperty({ minLength: 20, maxLength: 5000 }) @collapse() @IsString() @Length(20, 5000, { message: 'Message must be 20\u20135000 characters' }) message!: string;
  @ApiProperty({ description: 'Acknowledgement that the contact details are shared with the business to respond (SRS ENQ 001)' }) @IsBoolean() acknowledged!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2048) captchaToken?: string;
  @ApiPropertyOptional({ writeOnly: true }) @IsOptional() @IsString() @MaxLength(200) website?: string;
}

export class EnquiryReceiptDto {
  @ApiProperty() receiptId!: string;
  @ApiProperty({ enum: ['accepted'], description: 'Durably accepted; not a claim that email was delivered (SRS ENQ 003)' }) status!: 'accepted';
  @ApiProperty() message!: string;
}

export class AdminEnquiryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['business', 'site'] }) kind!: 'business' | 'site';
  @ApiProperty({ type: String, nullable: true }) businessId!: string | null;
  @ApiProperty({ type: String, nullable: true }) businessName!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Visible to enquiry handlers only' }) email!: string;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty() subject!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ enum: HANDLING_STATUSES }) handlingStatus!: (typeof HANDLING_STATUSES)[number];
  @ApiProperty({ enum: DELIVERY_STATUSES }) deliveryStatus!: (typeof DELIVERY_STATUSES)[number];
  @ApiProperty() deliveryAttempts!: number;
  @ApiProperty({ type: String, nullable: true }) lastError!: string | null;
  @ApiProperty({ type: String, nullable: true }) suppressionReason!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) deliveredAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) handledByAdminId!: string | null;
  @ApiProperty() acknowledgedVersion!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class ListEnquiriesQueryDto {
  @ApiPropertyOptional({ enum: HANDLING_STATUSES }) @IsOptional() @IsIn(HANDLING_STATUSES) handlingStatus?: (typeof HANDLING_STATUSES)[number];
  @ApiPropertyOptional({ enum: DELIVERY_STATUSES }) @IsOptional() @IsIn(DELIVERY_STATUSES) deliveryStatus?: (typeof DELIVERY_STATUSES)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) businessId?: string;
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE) pageSize = DEFAULT_PAGE_SIZE;
}

export class UpdateEnquiryDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty({ enum: HANDLING_STATUSES, description: 'Handling state is independent of delivery state (SRS ENQ 004)' }) @IsIn(HANDLING_STATUSES) handlingStatus!: (typeof HANDLING_STATUSES)[number];
}

export class RetryEnquiryDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty({ maxLength: 500, description: 'Recorded in the audit log (SRS ENQ 006)' }) @trim() @IsString() @Length(5, 500) reason!: string;
}
