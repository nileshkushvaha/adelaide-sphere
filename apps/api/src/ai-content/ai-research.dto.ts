import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CLAIM_KINDS, REGISTRY_TIERS } from '@adelaide-sphere/domain';

const ID = /^[a-z0-9]{20,40}$/;

export class ResearchUrlDto {
  @ApiProperty({ maxLength: 2000, description: 'A public https page; retrieval re-validates it at connection time.' })
  @IsString() @MaxLength(2000) url!: string;
  @ApiPropertyOptional({ enum: REGISTRY_TIERS, nullable: true, description: 'Editor classification; otherwise the registry decides, else unclassified.' })
  @IsOptional() @IsIn(REGISTRY_TIERS) tier?: (typeof REGISTRY_TIERS)[number] | null;
}

export class TopicSourcesDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty({ type: [ResearchUrlDto], maxItems: 10 })
  @ValidateNested({ each: true }) @Type(() => ResearchUrlDto) @ArrayMaxSize(10) sources!: ResearchUrlDto[];
}

export class ResearchActionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty({ enum: ['approve', 'refresh'] }) @IsIn(['approve', 'refresh']) action!: 'approve' | 'refresh';
  @ApiPropertyOptional({ description: 'Approve a topic that overlaps existing content only as a follow-up of this article.' })
  @IsOptional() @IsString() @Matches(ID) followUpOfPostId?: string;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) followUpReason?: string;
}

export class ResolveClaimDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty({ enum: ['accept', 'exclude', 'reopen'] }) @IsIn(['accept', 'exclude', 'reopen']) action!: 'accept' | 'exclude' | 'reopen';
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class AddClaimDto {
  @ApiProperty() @IsString() @Matches(ID) evidenceId!: string;
  @ApiProperty({ enum: CLAIM_KINDS }) @IsIn(CLAIM_KINDS) kind!: (typeof CLAIM_KINDS)[number];
  @ApiProperty({ maxLength: 200 }) @IsString() @MinLength(1) @MaxLength(200) subject!: string;
  @ApiProperty({ maxLength: 1000 }) @IsString() @MinLength(1) @MaxLength(1000) value!: string;
  @ApiProperty({ maxLength: 1000, description: 'Copied from the retrieved source text; must state the value.' })
  @IsString() @MinLength(1) @MaxLength(1000) excerpt!: string;
  @ApiProperty() @IsBoolean() material!: boolean;
  @ApiPropertyOptional({ description: 'For an event: when it ends.' }) @IsOptional() @IsISO8601() validUntil?: string;
}

export class ResearchSourceInputDto {
  @ApiProperty({ maxLength: 253 }) @IsString() @MaxLength(253) host!: string;
  @ApiProperty({ maxLength: 120 }) @IsString() @MinLength(1) @MaxLength(120) label!: string;
  @ApiProperty({ enum: REGISTRY_TIERS }) @IsIn(REGISTRY_TIERS) tier!: (typeof REGISTRY_TIERS)[number];
  @ApiPropertyOptional({ maxLength: 500, nullable: true }) @IsOptional() @IsString() @MaxLength(500) feedUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateResearchSourceDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ maxLength: 120 }) @IsOptional() @IsString() @MinLength(1) @MaxLength(120) label?: string;
  @ApiPropertyOptional({ enum: REGISTRY_TIERS }) @IsOptional() @IsIn(REGISTRY_TIERS) tier?: (typeof REGISTRY_TIERS)[number];
  @ApiPropertyOptional({ maxLength: 500, nullable: true }) @IsOptional() @IsString() @MaxLength(500) feedUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
