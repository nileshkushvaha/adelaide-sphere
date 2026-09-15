import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../password.service.js';

export class LoginDto {
  @ApiProperty({ example: 'admin@example.com', maxLength: 254 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 1, maxLength: PASSWORD_MAX_LENGTH, writeOnly: true })
  @IsString({ message: 'Password is required' })
  @MinLength(1, { message: 'Password is required' })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}
