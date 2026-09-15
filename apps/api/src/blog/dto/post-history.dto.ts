import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, MaxLength, Min } from 'class-validator';

/** Unsaved work sent by the editor while writing (SRS 1.10 BLOG 003). */
export class SavePostAutosaveDto {
  @ApiProperty({ maxLength: 180 }) @IsString() @MaxLength(180) title!: string;
  @ApiProperty({ maxLength: 500 }) @IsString() @MaxLength(500) excerpt!: string;
  @ApiProperty({ maxLength: 200_000 }) @IsString() @MaxLength(200_000) bodyMarkdown!: string;
  @ApiProperty({ enum: ['markdown', 'html'] }) @IsIn(['markdown', 'html']) bodyFormat!: 'markdown' | 'html';
  @ApiProperty({ description: 'The article version being edited' }) @IsInt() @Min(1) baseVersion!: number;
}

export class PostAutosaveDto {
  @ApiProperty() title!: string;
  @ApiProperty() excerpt!: string;
  @ApiProperty() bodyMarkdown!: string;
  @ApiProperty({ enum: ['markdown', 'html'] }) bodyFormat!: 'markdown' | 'html';
  @ApiProperty() baseVersion!: number;
  @ApiProperty({ format: 'date-time' }) savedAt!: string;
  @ApiProperty({ description: 'True when the article has been saved by anyone since this work began' }) stale!: boolean;
}

export class PostAutosaveReceiptDto {
  @ApiProperty({ format: 'date-time' }) savedAt!: string;
}

export class PostRevisionDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'The article version this snapshot was taken from' }) version!: number;
  @ApiProperty({ type: String, nullable: true }) title!: string | null;
  @ApiProperty({ type: String, nullable: true }) excerpt!: string | null;
  @ApiProperty({ description: 'The text as written; the sanitised HTML for revisions recorded before 1.10' }) bodySource!: string;
  @ApiProperty({ enum: ['markdown', 'html'] }) bodyFormat!: 'markdown' | 'html';
  @ApiProperty() sanitizedSnapshot!: string;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ type: String, nullable: true }) actorName!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class RestorePostRevisionDto {
  @ApiProperty({ description: 'The article version last read; a concurrent change is refused with 409' }) @IsInt() @Min(1) expectedVersion!: number;
}
