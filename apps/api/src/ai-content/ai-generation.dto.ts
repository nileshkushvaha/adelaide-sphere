import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../common/pagination.js';
import { ArrayMaxSize, ArrayMinSize, Equals, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

const ID = /^[a-z0-9]{20,40}$/;

export class TopicArticleSettingsDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ enum: ['manual', 'hybrid'], nullable: true, description: 'Per-article image mode; null follows AI Settings. Automatic is not approved.' })
  @IsOptional()
  @IsIn(['manual', 'hybrid', null])
  imageMode?: 'manual' | 'hybrid' | null;
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
  @ApiProperty({ enum: ['openai', 'xai', 'google'] }) @IsIn(['openai', 'xai', 'google']) provider!: string;
  @ApiProperty({ description: 'A listed text or image model of the provider.' }) @IsString() @Matches(/^[a-z0-9][a-z0-9.-]{1,63}$/) model!: string;
  @ApiProperty({ enum: ['USD', 'AUD', 'EUR', 'GBP'] }) @IsIn(['USD', 'AUD', 'EUR', 'GBP']) currency!: string;
  @ApiProperty({ description: 'Millionths of the currency per million input tokens (USD 2.00 = 2000000); zero only for a per-image price that bills no input.' }) @IsInt() @Min(0) @Max(1_000_000_000) inputMicrosPerMTok!: number;
  @ApiProperty() @IsInt() @Min(0) @Max(1_000_000_000) cachedInputMicrosPerMTok!: number;
  @ApiProperty({ description: 'Per million output tokens; zero only for a per-image price, which has no token output rate.' }) @IsInt() @Min(0) @Max(1_000_000_000) outputMicrosPerMTok!: number;
  @ApiProperty({ description: 'Input tokens above which a different price applies; such calls are refused.' }) @IsInt() @Min(1000) @Max(10_000_000) longContextThresholdTokens!: number;
  @ApiPropertyOptional({ enum: ['0.5k', '1k', '2k', '4k'], description: 'Image models only: the resolution tier this price covers.' }) @IsOptional() @IsIn(['0.5k', '1k', '2k', '4k']) imageResolution?: string;
  @ApiPropertyOptional({ enum: ['low', 'medium', 'high', 'auto'], description: 'Image models only: the quality this price covers.' }) @IsOptional() @IsIn(['low', 'medium', 'high', 'auto']) imageQuality?: string;
  @ApiPropertyOptional({ enum: ['token', 'image'], description: 'Image models only: how the provider bills, which must match the model.' }) @IsOptional() @IsIn(['token', 'image']) pricingUnit?: 'token' | 'image';
  @ApiPropertyOptional({ minimum: 1, maximum: 100000, description: 'Token unit: the most image output tokens one image may use. Usage above it halts paid calls.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  maxOutputTokens?: number;
  @ApiPropertyOptional({ minimum: 1, description: 'Image unit: millionths of the currency per generated image (USD 0.04 = 40000).' }) @IsOptional() @IsInt() @Min(1) @Max(100_000_000) perImageMicros?: number;
  @ApiPropertyOptional({ minimum: 1, description: 'Text or thinking output billed with an image, per million tokens (only for models that bill it).' }) @IsOptional() @IsInt() @Min(1) @Max(1_000_000_000) textOutputMicrosPerMTok?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 100000, description: 'The most text or thinking tokens one image may use.' }) @IsOptional() @IsInt() @Min(1) @Max(100_000) maxTextOutputTokens?: number;
  @ApiProperty({ maxLength: 500 }) @IsString() @Matches(/^https:\/\/[^\s]+$/) @MaxLength(500) sourceUrl!: string;
  @ApiProperty() @IsISO8601() effectiveFrom!: string;
}

export class GenerateImageDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ maxLength: 1000, description: 'A generic scene; names of places, businesses or events are refused. Defaults to the draft\'s image brief.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  prompt?: string;
}

export class ComparisonCandidateDto {
  @ApiProperty({ enum: ['openai', 'xai', 'google'] }) @IsIn(['openai', 'xai', 'google']) provider!: string;
  @ApiProperty({ description: 'A listed image model of the provider.' }) @IsString() @Matches(/^[a-z0-9][a-z0-9.-]{1,63}$/) model!: string;
  @ApiProperty({ enum: ['1k', '2k'] }) @IsIn(['1k', '2k']) resolution!: string;
  @ApiProperty({ enum: ['low', 'medium', 'high', 'auto'] }) @IsIn(['low', 'medium', 'high', 'auto']) quality!: string;
}

export class QuoteImageComparisonDto {
  @ApiPropertyOptional({ maxLength: 1000, description: "A generic scene; defaults to the draft's image brief. The same screened prompt goes to every provider." })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  prompt?: string;
  @ApiProperty({ enum: ['3:2', '16:9', '1:1', '2:3'] }) @IsIn(['3:2', '16:9', '1:1', '2:3']) aspectRatio!: string;
  @ApiProperty({ type: [ComparisonCandidateDto], minItems: 2, maxItems: 4 })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => ComparisonCandidateDto)
  candidates!: ComparisonCandidateDto[];
}

export class RequestImageComparisonDto extends QuoteImageComparisonDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty({ minimum: 1, description: 'The total maximum shown by the quote; refused if the prices changed since.' }) @IsInt() @Min(1) expectedTotalMicros!: number;
}

export class ApproveImageDto {
  @ApiProperty({ minimum: 1, description: 'The article version the reviewer is looking at.' }) @IsInt() @Min(1) expectedPostVersion!: number;
  @ApiProperty({ maxLength: 255, description: 'Alt text written from the generated image itself.' }) @IsString() @MinLength(1) @MaxLength(255) altText!: string;
  @ApiProperty({ description: 'The reviewer confirms the alt text describes the actual image.' }) @Equals(true) altWrittenFromImage!: true;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class RejectImageDto {
  @ApiProperty({ maxLength: 500 }) @IsString() @MinLength(5) @MaxLength(500) note!: string;
}

export class ReviewSlotDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty({ maxLength: 500, description: 'What was checked or decided about the missed slot.' }) @IsString() @MinLength(5) @MaxLength(500) note!: string;
}

export class ImageEvidenceQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['featured', 'comparison'] }) @IsOptional() @IsIn(['featured', 'comparison']) slot?: 'featured' | 'comparison';
  @ApiPropertyOptional({ description: 'One topic only.' }) @IsOptional() @Matches(ID) itemId?: string;
}
