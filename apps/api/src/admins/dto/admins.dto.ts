import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.js';

export const ADMIN_SORT_FIELDS = ['createdAt', 'email', 'displayName', 'lastLoginAt', 'status'] as const;
export type AdminSortField = (typeof ADMIN_SORT_FIELDS)[number];

export class ListAdminsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive match on email or display name', maxLength: 120 })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Role key; matches administrators holding that role', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  role?: string;

  @ApiPropertyOptional({ enum: ['invited', 'active', 'disabled'] })
  @IsOptional()
  @IsIn(['invited', 'active', 'disabled'])
  status?: 'invited' | 'active' | 'disabled';

  @ApiPropertyOptional({ enum: ADMIN_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(ADMIN_SORT_FIELDS)
  sort: AdminSortField = 'createdAt';
}

export class CreateAdminDto {
  @ApiProperty({ maxLength: 254 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 2, maxLength: 80 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 80, { message: 'Display name must be 2–80 characters' })
  displayName!: string;

  @ApiProperty({ type: [String], example: ['super_admin'], description: 'Role keys (MVP: super_admin only)' })
  @ArrayNotEmpty({ message: 'At least one role is required' })
  @ArrayMaxSize(5)
  @IsString({ each: true })
  roleKeys!: string[];
}

export class UpdateAdminDto {
  @ApiProperty({ description: 'Version the client last saw; 409 when stale (SRS API 005)' })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ minLength: 2, maxLength: 80 })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 80, { message: 'Display name must be 2–80 characters' })
  displayName?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @ArrayNotEmpty({ message: 'At least one role is required' })
  @ArrayMaxSize(5)
  @IsString({ each: true })
  roleKeys?: string[];
}

export class AdminStateChangeDto {
  @ApiProperty({ description: 'Version the client last saw' })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ maxLength: 500, description: 'Recorded in the audit log' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: ['invited', 'active', 'disabled'] }) status!: 'invited' | 'active' | 'disabled';
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty() totpEnabled!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) lastLoginAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty() version!: number;
}

export class AdminEnvelopeDto {
  @ApiProperty({ type: AdminListItemDto }) data!: AdminListItemDto;
}

export class AdminCollectionMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
  @ApiProperty() pageCount!: number;
}

export class AdminCollectionDto {
  @ApiProperty({ type: [AdminListItemDto] }) data!: AdminListItemDto[];
  @ApiProperty({ type: AdminCollectionMetaDto }) meta!: AdminCollectionMetaDto;
}
