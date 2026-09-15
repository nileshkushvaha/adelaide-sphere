import { Body, Controller, Get, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsString, Length, Max, Min, ValidateNested } from 'class-validator';

/** Test-only DTOs and routes. Registered by the e2e suite, never by AppModule. */
export class FixtureAddressDto {
  @IsString()
  @Length(2, 40)
  suburb!: string;
}

export class FixtureSubmissionDto {
  @IsString()
  @Length(2, 80)
  name!: string;

  @IsEmail()
  email!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ValidateNested()
  @Type(() => FixtureAddressDto)
  address!: FixtureAddressDto;
}

@Controller('__fixture')
export class ValidationFixtureController {
  @Post('submit')
  submit(@Body() body: FixtureSubmissionDto) {
    return { data: { received: body.name } };
  }

  @Get('boom')
  boom(): never {
    throw new Error('secret internal detail /var/app/private');
  }
}
