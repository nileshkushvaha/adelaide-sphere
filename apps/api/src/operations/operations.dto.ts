import { ApiProperty } from '@nestjs/swagger';

export class OperationsSignalDto {
  @ApiProperty({ description: 'Stable key an alert rule can match on' }) key!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ description: 'Measured value; a count, or an age in seconds' }) value!: number;
  @ApiProperty({ enum: ['count', 'seconds'] }) unit!: 'count' | 'seconds';
  @ApiProperty({ description: 'Threshold from the alerting policy (SRS MON 002); 0 means "any value alerts"' }) threshold!: number;
  @ApiProperty({ description: 'True when the measured value is at or above the threshold' }) breached!: boolean;
  @ApiProperty({ description: 'What an operator should do about it' }) action!: string;
}

export class OperationsStatusDto {
  @ApiProperty({ enum: ['ok', 'degraded'] }) state!: 'ok' | 'degraded';
  @ApiProperty({ type: [OperationsSignalDto] }) signals!: OperationsSignalDto[];
  @ApiProperty({ format: 'date-time' }) generatedAt!: string;
}
