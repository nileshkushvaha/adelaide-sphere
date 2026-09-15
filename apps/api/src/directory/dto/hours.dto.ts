import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { MAX_EXCEPTIONS, MAX_EXCEPTION_NOTE, MAX_INTERVALS_PER_DAY } from '../hours/hours-rules.js';

/** Wall-clock interval in Australia/Adelaide (SRS BUS 004, API 001). Not ISO instants. */
export class HoursIntervalDto {
  @ApiProperty({ example: '09:00', description: 'HH:MM local opening time' }) @IsString() @MaxLength(5) start!: string;
  @ApiProperty({ example: '17:30', description: 'HH:MM local closing time; 24:00 means end of day' }) @IsString() @MaxLength(5) end!: string;
  @ApiProperty({ description: 'The closing time falls on the following day (overnight trading)' }) @IsBoolean() endNextDay!: boolean;
}

export class DayHoursDto {
  @ApiProperty({ enum: ['closed', 'open24', 'intervals'] }) @IsIn(['closed', 'open24', 'intervals']) state!: 'closed' | 'open24' | 'intervals';
  @ApiPropertyOptional({ type: [HoursIntervalDto], description: `Required when state = intervals (1–${MAX_INTERVALS_PER_DAY})` })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_INTERVALS_PER_DAY)
  @ValidateNested({ each: true })
  @Type(() => HoursIntervalDto)
  intervals?: HoursIntervalDto[];
}

export class WeeklyHoursDto {
  @ApiProperty({ type: DayHoursDto }) @ValidateNested() @Type(() => DayHoursDto) monday!: DayHoursDto;
  @ApiProperty({ type: DayHoursDto }) @ValidateNested() @Type(() => DayHoursDto) tuesday!: DayHoursDto;
  @ApiProperty({ type: DayHoursDto }) @ValidateNested() @Type(() => DayHoursDto) wednesday!: DayHoursDto;
  @ApiProperty({ type: DayHoursDto }) @ValidateNested() @Type(() => DayHoursDto) thursday!: DayHoursDto;
  @ApiProperty({ type: DayHoursDto }) @ValidateNested() @Type(() => DayHoursDto) friday!: DayHoursDto;
  @ApiProperty({ type: DayHoursDto }) @ValidateNested() @Type(() => DayHoursDto) saturday!: DayHoursDto;
  @ApiProperty({ type: DayHoursDto }) @ValidateNested() @Type(() => DayHoursDto) sunday!: DayHoursDto;
}

export class HoursExceptionDto {
  @ApiProperty({ example: '2026-12-25', description: 'Local calendar date, YYYY-MM-DD' }) @IsString() @MaxLength(10) date!: string;
  @ApiProperty({ enum: ['closed', 'open24', 'custom'] }) @IsIn(['closed', 'open24', 'custom']) kind!: 'closed' | 'open24' | 'custom';
  @ApiPropertyOptional({ type: [HoursIntervalDto], description: 'Required when kind = custom' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_INTERVALS_PER_DAY)
  @ValidateNested({ each: true })
  @Type(() => HoursIntervalDto)
  intervals?: HoursIntervalDto[];
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_EXCEPTION_NOTE }) @IsOptional() @IsString() @MaxLength(MAX_EXCEPTION_NOTE) note?: string | null;
}

export class PutHoursDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty({ enum: ['unknown', 'scheduled'], description: 'unknown = no schedule recorded (never rendered as open or closed)' }) @IsIn(['unknown', 'scheduled']) mode!: 'unknown' | 'scheduled';
  @ApiPropertyOptional({ type: WeeklyHoursDto, description: 'Required when mode = scheduled' }) @IsOptional() @ValidateNested() @Type(() => WeeklyHoursDto) weekly?: WeeklyHoursDto;
  @ApiPropertyOptional({ type: [HoursExceptionDto] }) @IsOptional() @IsArray() @ArrayMaxSize(MAX_EXCEPTIONS) @ValidateNested({ each: true }) @Type(() => HoursExceptionDto) exceptions?: HoursExceptionDto[];
}

export class HoursStatusDto {
  @ApiProperty({ enum: ['unknown', 'open', 'closed'] }) state!: 'unknown' | 'open' | 'closed';
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Next change of state (instant), if known' }) until!: string | null;
  @ApiProperty({ enum: ['exception', 'weekly'], nullable: true }) source!: 'exception' | 'weekly' | null;
}

export class HoursDto {
  @ApiProperty({ enum: ['unknown', 'scheduled'] }) mode!: 'unknown' | 'scheduled';
  @ApiProperty({ type: WeeklyHoursDto }) weekly!: WeeklyHoursDto;
  @ApiProperty({ type: [HoursExceptionDto] }) exceptions!: HoursExceptionDto[];
  @ApiProperty({ type: HoursStatusDto, description: 'Evaluated at the time of the request (Australia/Adelaide)' }) status!: HoursStatusDto;
  @ApiProperty({ format: 'date-time', description: 'Instant the status was evaluated at' }) evaluatedAt!: string;
  @ApiProperty({ description: 'Business version; hours edits bump it (SRS API 005)' }) version!: number;
}
