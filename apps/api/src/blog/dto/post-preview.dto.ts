import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Unsaved article content to render for the editor's preview; nothing is stored. */
export class RenderPostPreviewDto {
  @ApiPropertyOptional({ maxLength: 180 }) @IsOptional() @IsString() @MaxLength(180) title?: string;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) excerpt?: string;
  @ApiPropertyOptional({ maxLength: 200_000 }) @IsOptional() @IsString() @MaxLength(200_000) bodyMarkdown?: string;
  @ApiPropertyOptional({ enum: ['markdown', 'html'], default: 'html' }) @IsOptional() @IsIn(['markdown', 'html']) bodyFormat?: 'markdown' | 'html';
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() @MaxLength(64) authorId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() @MaxLength(64) categoryId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() @MaxLength(64) coverMediaId?: string | null;
}

export class PreviewImageDto {
  @ApiProperty() url!: string;
  @ApiProperty() alt!: string;
}

export class RenderedPostPreviewDto {
  @ApiProperty() title!: string;
  @ApiProperty() excerpt!: string;
  @ApiProperty({ description: 'True when the summary was written from the opening text because none was typed' }) excerptGenerated!: boolean;
  @ApiProperty({ description: 'Sanitised HTML, exactly as a save would store it' }) sanitizedBody!: string;
  @ApiProperty({ type: String, nullable: true }) authorName!: string | null;
  @ApiProperty({ type: String, nullable: true }) categoryName!: string | null;
  @ApiProperty({ type: PreviewImageDto, nullable: true, description: 'Null until the chosen image has been processed' }) cover!: PreviewImageDto | null;
  @ApiProperty() readingMinutes!: number;
  @ApiProperty({ description: 'Always true: previews are never indexable (SRS BLOG 003)' }) noindex!: boolean;
}

export class PostPreviewLinkDto {
  @ApiProperty({ description: 'Path on the public site, e.g. /preview/article/<token>' }) path!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}
