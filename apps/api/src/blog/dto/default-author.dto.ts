import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DefaultAuthorSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() active!: boolean;
}

/** An administrator's own default author preference (SRS 1.10 BLOG 001); never public. */
export class DefaultAuthorDto {
  @ApiProperty({ type: String, nullable: true }) authorId!: string | null;
  @ApiProperty({ type: DefaultAuthorSummaryDto, nullable: true }) author!: DefaultAuthorSummaryDto | null;
}

export class SetDefaultAuthorDto {
  @ApiProperty({ type: String, nullable: true, description: 'An active author profile, or null to clear the preference' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  authorId?: string | null;
}
