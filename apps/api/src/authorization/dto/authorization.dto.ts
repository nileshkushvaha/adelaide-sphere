import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { ALL_PERMISSION_KEYS } from '../../identity/permissions.js';

/** Upper bound for any permission array: the catalogue itself, with headroom. */
const MAX_PERMISSIONS = Math.max(64, ALL_PERMISSION_KEYS.length * 2);
const MAX_ROLES = 32;

/**
 * Request bodies for access administration (SRS RBAC 008). Every field is
 * declared, so the global allowlisting validation rejects anything else — an
 * `isSystem` or `version` smuggled into a payload cannot reach the database.
 * These DTOs check shape only; the service enforces the catalogue, the protected
 * role, self-escalation and the last-super-admin invariant.
 */
export class CreateRoleDto {
  @ApiProperty({ description: 'Stable key: lower-case letters, digits and underscores', example: 'editor' })
  @IsString()
  @Length(2, 64)
  key!: string;

  @ApiProperty({ maxLength: 80 }) @IsString() @Length(2, 80) name!: string;
  @ApiProperty({ maxLength: 255 }) @IsString() @Length(0, 255) description!: string;

  @ApiProperty({ type: [String], description: 'Registered permission codes this role carries' })
  @IsArray()
  @ArrayMaxSize(MAX_PERMISSIONS)
  @IsString({ each: true })
  permissions!: string[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ maxLength: 80 }) @IsOptional() @IsString() @Length(2, 80) name?: string;
  @ApiPropertyOptional({ maxLength: 255 }) @IsOptional() @IsString() @Length(0, 255) description?: string;
  @ApiPropertyOptional({ description: 'An inactive role grants nothing' }) @IsOptional() @IsBoolean() isActive?: boolean;

  @ApiProperty({ description: 'Version the edit was made against; a mismatch is refused with 409' })
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

export class ReplaceRolePermissionsDto {
  @ApiProperty({ type: [String], description: 'The complete set after the change; anything absent is removed' })
  @IsArray()
  @ArrayMaxSize(MAX_PERMISSIONS)
  @IsString({ each: true })
  permissions!: string[];

  @ApiProperty() @IsInt() @Min(0) expectedVersion!: number;
}

export class ReplaceAdminRolesDto {
  @ApiProperty({ type: [String], description: 'The complete set of role ids after the change' })
  @IsArray()
  @ArrayMaxSize(MAX_ROLES)
  @IsString({ each: true })
  roleIds!: string[];

  @ApiProperty({ description: "The administrator record's version" }) @IsInt() @Min(0) expectedVersion!: number;
}

export class ReplaceAdminPermissionsDto {
  @ApiProperty({ type: [String], description: 'The complete set of directly granted permission codes after the change' })
  @IsArray()
  @ArrayMaxSize(MAX_PERMISSIONS)
  @IsString({ each: true })
  permissions!: string[];

  @ApiProperty() @IsInt() @Min(0) expectedVersion!: number;
}
