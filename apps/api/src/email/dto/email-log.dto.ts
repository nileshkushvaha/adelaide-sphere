import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** One delivery as the log shows it (SRS 1.2 MAIL 005/010): masked recipient, no body. */
export class EmailDeliveryDto {
  @ApiProperty() id!: string;
  @ApiProperty() provider!: string;
  @ApiPropertyOptional({ nullable: true }) providerMessageId!: string | null;
  @ApiProperty() templateKey!: string;
  @ApiProperty() category!: string;
  @ApiProperty({ description: 'Masked address, e.g. "v••••r@example.com". Revealing it needs a separate permission.' }) recipient!: string;
  @ApiPropertyOptional({ nullable: true, description: 'Kept only where the template permits it; withheld when it could carry a visitor’s words.' })
  subject!: string | null;
  @ApiPropertyOptional({ nullable: true }) relatedType!: string | null;
  @ApiPropertyOptional({ nullable: true }) relatedId!: string | null;
  @ApiProperty({ enum: ['queued', 'sent', 'delivered', 'delayed', 'failed', 'bounced', 'complained', 'suppressed'] }) status!: string;
  @ApiProperty() attempts!: number;
  @ApiPropertyOptional({ nullable: true, description: 'Bounded classification, never raw provider text.' }) failureCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) failureSummary!: string | null;
  @ApiPropertyOptional({ nullable: true }) requestId!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional({ nullable: true }) sentAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) deliveredAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) failedAt!: string | null;
}

export class EmailDeliveryEventDto {
  @ApiProperty() type!: string;
  @ApiProperty() occurredAt!: string;
  @ApiProperty() receivedAt!: string;
  @ApiPropertyOptional({ type: Object, nullable: true, description: 'Safe summary of the provider event; never a payload or a body.' })
  detail!: Record<string, unknown> | null;
}

export class EmailDeliveryDetailDto extends EmailDeliveryDto {
  @ApiPropertyOptional({ nullable: true, description: 'The delivery this one was created to replace.' }) resentFromId!: string | null;
  @ApiProperty({ type: [EmailDeliveryEventDto] }) events!: EmailDeliveryEventDto[];
}

export class EmailRecipientDto {
  @ApiProperty() recipient!: string;
}

export class ResendResultDto {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
  @ApiPropertyOptional({ nullable: true }) resentFromId!: string | null;
}
