import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const emptyToNull = () => Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value));

export class FeaturedPlacementDto {
  @ApiProperty() id!: string;
  @ApiProperty() businessId!: string;
  @ApiProperty() businessName!: string;
  @ApiProperty() businessSlug!: string;
  @ApiProperty({ description: 'Publication state of the listing itself' }) businessStatus!: string;
  @ApiProperty() position!: number;
  @ApiProperty({ format: 'date-time' }) startsAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) endsAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ enum: ['scheduled', 'live', 'not-published', 'ended'] }) state!: 'scheduled' | 'live' | 'not-published' | 'ended';
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class CreateFeaturedPlacementDto {
  @ApiProperty() @IsString() @MaxLength(64) businessId!: string;
  @ApiProperty({ format: 'date-time' }) @IsDateString() startsAt!: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, description: 'Open-ended when omitted' }) @IsOptional() @emptyToNull() @IsDateString() endsAt?: string | null;
  @ApiPropertyOptional({ minimum: 0, maximum: 999, default: 0, description: 'Lower positions appear first' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(999) position?: number;
  @ApiPropertyOptional({ maxLength: 500, description: 'Editorial reason; recorded in the audit log' }) @IsOptional() @trim() @IsString() @MaxLength(500) note?: string;
}

export class UpdateFeaturedPlacementDto {
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) @IsOptional() @emptyToNull() @IsDateString() endsAt?: string | null;
  @ApiPropertyOptional({ minimum: 0, maximum: 999 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(999) position?: number;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 }) @IsOptional() @emptyToNull() @trim() @IsString() @MaxLength(500) note?: string | null;
}
