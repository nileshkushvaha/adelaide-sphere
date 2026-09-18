import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.js';
import {
  TOPIC_ACTIONS,
  TOPIC_STATUSES,
  type TopicAction,
  type TopicStatus,
} from './topic-rules.js';

export class CreateTopicDto {
  @ApiProperty({ maxLength: 180 })
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  title!: string;
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  brief?: string;
  @ApiPropertyOptional({ minimum: 0, maximum: 1000, default: 0 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(1000)
  priority = 0;
}
export class TopicQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TOPIC_STATUSES })
  @IsOptional()
  @IsIn(TOPIC_STATUSES)
  status?: TopicStatus;
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
  // Queue order is always priority descending, then creation time/id ascending.
}
export class TopicVersionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
}
export class TopicActionDto extends TopicVersionDto {
  @ApiProperty({ enum: TOPIC_ACTIONS })
  @IsIn(TOPIC_ACTIONS)
  action!: TopicAction;
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
export class TopicPriorityDto extends TopicVersionDto {
  @ApiProperty({ minimum: 0, maximum: 1000 })
  @IsInt()
  @Min(0)
  @Max(1000)
  priority!: number;
}
export class ReorderEntryDto extends TopicPriorityDto {
  @ApiProperty() @IsString() @Matches(/^[a-z0-9]{20,40}$/) id!: string;
}
export class ReorderTopicsDto {
  @ApiProperty({ type: [ReorderEntryDto], minItems: 1, maxItems: 50 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique((item: ReorderEntryDto) => item.id)
  @ValidateNested({ each: true })
  @Type(() => ReorderEntryDto)
  items!: ReorderEntryDto[];
}
export class TopicDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ nullable: true }) brief!: string | null;
  @ApiProperty() priority!: number;
  @ApiProperty({ enum: ['manual', 'discovery'] }) source!: string;
  @ApiProperty({ enum: TOPIC_STATUSES }) status!: TopicStatus;
  @ApiPropertyOptional({ nullable: true }) reason!: string | null;
  @ApiPropertyOptional({ nullable: true }) createdByAdminId!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty() version!: number;
  @ApiPropertyOptional({ nullable: true, description: 'The one canonical article for this item, once a draft exists.' }) postId!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'First human change to the linked article; automation never applies over it.' }) humanModifiedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, enum: ['research', 'generation', 'image', 'application', 'publication'] }) failureStage!: string | null;
  @ApiPropertyOptional({ nullable: true }) failureCode!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Why the topic was selected: manual entry or the public signal discovery found.' }) selectionReason!: string | null;
  @ApiProperty({ enum: ['unchecked', 'clear', 'review', 'duplicate'] }) noveltyStatus!: string;
  @ApiPropertyOptional({ nullable: true }) noveltyCheckedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, description: 'Up to 10 local inventory matches: kind, id, title, status, score, reason, verdict.' }) noveltyDetail!: unknown;
  @ApiPropertyOptional({ nullable: true, description: 'Up to 10 https source pages with an optional tier.' }) researchUrls!: unknown;
  @ApiPropertyOptional({ nullable: true }) topicApprovedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) topicApprovedByAdminId!: string | null;
  @ApiPropertyOptional({ nullable: true }) followUpOfPostId!: string | null;
  @ApiPropertyOptional({ nullable: true }) followUpReason!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Existing category the generated article uses.' }) categoryId!: string | null;
  @ApiPropertyOptional({ enum: ['manual', 'hybrid'], nullable: true, description: 'Per-article image mode; null follows AI Settings.' }) imageMode!: 'manual' | 'hybrid' | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, description: 'When a person approved the topic for the daily slot; null once a slot took it.' }) awaitingSlotSince!: Date | null;
}
