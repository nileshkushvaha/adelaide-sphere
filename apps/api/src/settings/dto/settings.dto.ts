import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MAX_CAPTION_LENGTH, MAX_HEADLINE_LENGTH, MAX_HERO_SLIDES, MAX_PHRASE_LENGTH, MAX_PHRASES, MIN_PHRASES } from '../home-settings.js';

/** One hero banner slide (SRS HERO 001). */
export class HeroSlideDto {
  @ApiProperty({ description: 'Ready media asset used as the background image' }) @IsString() @MaxLength(64) mediaId!: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_CAPTION_LENGTH }) @IsOptional() @IsString() @MaxLength(MAX_CAPTION_LENGTH) caption?: string | null;
  @ApiPropertyOptional({ minimum: 0, maximum: 1, default: 0.5 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1) focalX?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 1, default: 0.5 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1) focalY?: number;
}

export class PublicHeroSlideDto {
  @ApiProperty({ description: 'Hero rendition URL' }) url!: string;
  @ApiProperty({ description: 'Card rendition, used as the low-width source' }) previewUrl!: string;
  @ApiProperty() alt!: string;
  @ApiProperty({ type: String, nullable: true }) caption!: string | null;
  @ApiProperty() focalX!: number;
  @ApiProperty() focalY!: number;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
}

export class HomeSettingsDto {
  @ApiProperty({ maxLength: MAX_HEADLINE_LENGTH, description: 'Stable accessible headline (SRS HERO 002)' }) @IsString() @MaxLength(MAX_HEADLINE_LENGTH) heroHeadline!: string;
  @ApiProperty({ type: [String], minItems: MIN_PHRASES, maxItems: MAX_PHRASES, description: 'Rotating phrases; the headline meaning must not depend on them' })
  @IsArray()
  @ArrayMinSize(MIN_PHRASES)
  @ArrayMaxSize(MAX_PHRASES)
  @IsString({ each: true })
  @MaxLength(MAX_PHRASE_LENGTH, { each: true })
  heroPhrases!: string[];
  @ApiPropertyOptional({ type: [HeroSlideDto], maxItems: MAX_HERO_SLIDES, description: 'Background slides; none means the solid navy fallback (SRS HERO 001)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_HERO_SLIDES)
  @ValidateNested({ each: true })
  @Type(() => HeroSlideDto)
  heroSlides?: HeroSlideDto[];
  @ApiProperty({ description: 'Show published-record counters (SRS HERO 007)' }) @IsBoolean() countersEnabled!: boolean;
}

export class UpdateHomeSettingsDto extends HomeSettingsDto {
  @ApiProperty({ minimum: 0, description: 'Version returned by GET; 0 when no settings row has been saved yet' }) @IsInt() @Min(0) expectedVersion!: number;
}

export class HomeSettingsRecordDto extends HomeSettingsDto {
  @ApiProperty({ type: [PublicHeroSlideDto], description: 'Resolved slide renditions for the editor preview' }) heroSlidePreviews!: PublicHeroSlideDto[];
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: String, nullable: true }) updatedByAdminId!: string | null;
}

export class HomeCountersDto {
  @ApiProperty({ description: 'Published businesses' }) businesses!: number;
  @ApiProperty({ description: 'Active categories with at least one published business' }) categories!: number;
  @ApiProperty({ description: 'Approved local areas with at least one published business' }) areas!: number;
}

export class PublicHomeDto {
  @ApiProperty() heroHeadline!: string;
  @ApiProperty({ type: [String] }) heroPhrases!: string[];
  @ApiProperty({ type: [PublicHeroSlideDto], description: 'Background slides in order; empty means the solid fallback' }) heroSlides!: PublicHeroSlideDto[];
  @ApiPropertyOptional({ type: HomeCountersDto, description: 'Present only when counters are enabled and the data is available (SRS HERO 007)' }) counters?: HomeCountersDto;
}
