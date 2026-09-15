import { ApiProperty } from '@nestjs/swagger';

export class AdminSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty({ type: [String], description: 'Effective permission keys (resource.action): inherited ∪ direct' }) permissions!: string[];
  @ApiProperty({ type: [String], description: 'Permissions inherited through active roles' }) inheritedPermissions!: string[];
  @ApiProperty({ type: [String], description: 'Permissions granted directly to this administrator' }) directPermissions!: string[];
  @ApiProperty() totpEnabled!: boolean;
}

export class SessionSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time', description: 'Sliding idle deadline' }) idleExpiresAt!: string;
  @ApiProperty({ format: 'date-time', description: 'Absolute deadline' }) expiresAt!: string;
}

export class AuthenticatedDto {
  @ApiProperty({ type: AdminSummaryDto }) admin!: AdminSummaryDto;
  @ApiProperty({ type: SessionSummaryDto }) session!: SessionSummaryDto;
}

export class AuthenticatedEnvelopeDto {
  @ApiProperty({ type: AuthenticatedDto }) data!: AuthenticatedDto;
}

export class AcceptedEnvelopeDto {
  @ApiProperty({ example: { accepted: true } }) data!: { accepted: true };
}
