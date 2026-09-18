import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const ID = /^[a-z0-9]{20,40}$/;

export class TopicArticleSettingsDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ nullable: true, description: 'An existing active blog category; null clears it.' })
  @IsOptional() @IsString() @Matches(ID) categoryId?: string | null;
}

export class GenerateDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty({ enum: ['full', 'metadata'], description: 'A full draft, or title/summary/SEO suggestions for an article in review.' })
  @IsIn(['full', 'metadata']) scope!: 'full' | 'metadata';
}

export class ApproveContentDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty({ minimum: 1, description: 'The article version the reviewer read.' }) @IsInt() @Min(1) postVersion!: number;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ConfirmFactsDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty({ minimum: 1, description: 'The article version whose facts the reviewer checked against the evidence.' }) @IsInt() @Min(1) postVersion!: number;
  @ApiProperty({ maxLength: 500, description: 'What was checked against the evidence.' }) @IsString() @MinLength(5) @MaxLength(500) note!: string;
}

export class TopicVersionOnlyDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
}

export class ApplyProposalDto {
  @ApiProperty({ minimum: 1, description: 'The article version the proposal was compared with.' }) @IsInt() @Min(1) expectedPostVersion!: number;
}

export class ResolveOperationDto {
  @ApiProperty({ enum: ['reconcile', 'abandon'] }) @IsIn(['reconcile', 'abandon']) action!: 'reconcile' | 'abandon';
  @ApiProperty({ maxLength: 500, description: 'What was checked, and why this is safe.' }) @IsString() @MinLength(5) @MaxLength(500) note!: string;
}

export class ResumePaidCallsDto {
  @ApiProperty({ maxLength: 500 }) @IsString() @MinLength(5) @MaxLength(500) note!: string;
}

export class ProposePriceDto {
  @ApiProperty({ maxLength: 64 }) @IsString() @Matches(/^[a-z0-9][a-z0-9.-]{2,63}$/) version!: string;
  @ApiProperty({ enum: ['openai'] }) @IsIn(['openai']) provider!: 'openai';
  @ApiProperty({ enum: ['gpt-5.6-terra', 'gpt-5.6-luna'] }) @IsIn(['gpt-5.6-terra', 'gpt-5.6-luna']) model!: string;
  @ApiProperty({ enum: ['USD', 'AUD', 'EUR', 'GBP'] }) @IsIn(['USD', 'AUD', 'EUR', 'GBP']) currency!: string;
  @ApiProperty({ description: 'Millionths of the currency per million input tokens (USD 2.00 = 2000000).' }) @IsInt() @Min(1) @Max(1_000_000_000) inputMicrosPerMTok!: number;
  @ApiProperty() @IsInt() @Min(0) @Max(1_000_000_000) cachedInputMicrosPerMTok!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(1_000_000_000) outputMicrosPerMTok!: number;
  @ApiProperty({ description: 'Input tokens above which a different price applies; such calls are refused.' }) @IsInt() @Min(1000) @Max(10_000_000) longContextThresholdTokens!: number;
  @ApiProperty({ maxLength: 500 }) @IsString() @Matches(/^https:\/\/[^\s]+$/) @MaxLength(500) sourceUrl!: string;
  @ApiProperty() @IsISO8601() effectiveFrom!: string;
}
