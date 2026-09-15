import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, Min } from 'class-validator';

/** One declared setting as the admin interface consumes it (SRS 1.2 SET 002). Metadata only — never a stored value. */
export class SettingDeclarationDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: ['boolean', 'integer', 'string', 'enum', 'email', 'url'] }) type!: string;
  @ApiProperty({ type: Object, description: 'Validation bounds: min/max and permitted enum values.' })
  bounds!: Record<string, unknown>;
  @ApiPropertyOptional({
    nullable: true,
    enum: ['minutes', 'hours', 'days', 'sessions', 'characters', 'passwords', 'attempts'],
    description: 'What the number counts, shown beside the input so a bare number is never ambiguous.',
  })
  unit!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'The limit in plain language, for administrators; the requirement that fixes it stays internal.' })
  limitNote!: string | null;
  @ApiProperty({ description: 'Value used when nothing has been stored.' }) default!: boolean | number | string;
  @ApiProperty({ enum: ['public', 'private'] }) visibility!: string;
  @ApiProperty({ enum: ['runtime', 'restart_required'] }) effect!: string;
  @ApiProperty() viewPermission!: string;
  @ApiProperty() updatePermission!: string;
  @ApiProperty({ type: [String], description: 'Cache tags a change to this setting invalidates.' }) invalidates!: string[];
  @ApiPropertyOptional({ nullable: true, description: 'Consequence an operator must be warned about before confirming.' })
  consequence!: string | null;
}

/** One owned settings group (SRS 1.2 SET 001). */
export class SettingGroupDto {
  @ApiProperty({ enum: ['security', 'email', 'operations', 'website'] }) key!: string;
  @ApiProperty() label!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ description: 'Server module that owns reads, writes and invariants for this group.' }) owner!: string;
  @ApiProperty() viewPermission!: string;
  @ApiProperty() updatePermission!: string;
  @ApiPropertyOptional({ nullable: true }) note!: string | null;
  @ApiProperty({ type: [SettingDeclarationDto] }) settings!: SettingDeclarationDto[];
}

/** Stored values for one group, with its optimistic version (SRS 1.2 SET 003). */
export class SettingGroupValuesDto {
  @ApiProperty() group!: string;
  @ApiProperty({ type: Object, description: 'Declared settings only; a value for an undeclared key is never returned.' })
  values!: Record<string, boolean | number | string>;
  @ApiProperty({ description: '0 when nothing has been stored and the declared defaults are being served.' }) version!: number;
  @ApiProperty() updatedAt!: string;
  @ApiPropertyOptional({ nullable: true }) updatedByAdminId!: string | null;
}

export class UpdateSettingGroupDto {
  @ApiProperty({ description: 'Version last read. A concurrent change is refused with 409 STALE_VERSION.' })
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @ApiProperty({
    type: Object,
    description: 'Settings to change, by declared key. Omitted keys keep their stored value; an unknown key is rejected rather than ignored.',
  })
  @IsObject()
  values!: Record<string, unknown>;
}
