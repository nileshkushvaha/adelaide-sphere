import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../password.service.js';

export class ChangePasswordDto {
  @ApiProperty({ writeOnly: true })
  @IsString({ message: 'Current password is required' })
  @MinLength(1, { message: 'Current password is required' })
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH, writeOnly: true })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` })
  @MaxLength(PASSWORD_MAX_LENGTH, { message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters` })
  newPassword!: string;
}

export class AcceptSetupDto {
  @ApiProperty({ description: 'Token from the setup link', writeOnly: true })
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Token format is invalid' })
  token!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH, writeOnly: true })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` })
  @MaxLength(PASSWORD_MAX_LENGTH, { message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters` })
  password!: string;
}

/** Re-authentication for sensitive actions when the session is older than the recent-auth window. */
export class ReauthenticateDto {
  @ApiPropertyOptional({ writeOnly: true, description: 'Required when the session is older than 5 minutes' })
  @IsOptional()
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword?: string;
}

export class TotpVerifyDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from your authenticator app' })
  code!: string;
}

export class TotpDisableDto extends ReauthenticateDto {
  @ApiPropertyOptional({ example: '123456', description: 'Current TOTP code or a recovery code' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string;
}

export class TotpChallengeDto {
  @ApiProperty({ writeOnly: true, description: 'Challenge token returned by login' })
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Challenge format is invalid' })
  challenge!: string;

  @ApiProperty({ example: '123456', description: '6-digit TOTP code or a recovery code (xxxx-xxxx)' })
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  code!: string;
}

export class SessionListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) lastSeenAt!: string;
  @ApiProperty({ format: 'date-time' }) idleExpiresAt!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ type: String, nullable: true }) ipAddress!: string | null;
  @ApiProperty({ type: String, nullable: true }) userAgent!: string | null;
  @ApiProperty({ description: 'Browser family and platform, e.g. "Chrome on macOS". Not device identification (SRS 1.2 SECS 005).' })
  device!: string;
  @ApiProperty({ description: 'True for the session making the request' }) current!: boolean;
}

export class TotpEnrollmentDto {
  @ApiProperty({ description: 'otpauth:// URI to render as a QR code' }) otpauthUri!: string;
  @ApiProperty({ description: 'Base32 secret for manual entry' }) secret!: string;
}

export class RecoveryCodesDto {
  @ApiProperty({ type: [String], description: 'Shown once; store safely' }) recoveryCodes!: string[];
}

export class LoginChallengeDto {
  @ApiProperty({ enum: ['totp'] }) requires!: 'totp';
  @ApiProperty({ description: 'Opaque challenge token for POST /auth/totp/challenge' }) challenge!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}
