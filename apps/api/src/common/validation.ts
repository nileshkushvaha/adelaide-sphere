import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

export type FieldErrors = Record<string, string[]>;

/** Flattens class-validator errors into { "path.to.field": ["message", ...] }. */
export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
  out: FieldErrors = {},
): FieldErrors {
  for (const error of errors) {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;
    if (error.constraints) {
      out[path] = [...(out[path] ?? []), ...Object.values(error.constraints)];
    }
    if (error.children?.length) {
      flattenValidationErrors(error.children, path, out);
    }
  }
  return out;
}

export class RequestValidationException extends BadRequestException {
  constructor(public readonly fields: FieldErrors) {
    super({ code: 'VALIDATION_ERROR', message: 'Request validation failed' });
  }
}

/** Global pipe: unknown fields are rejected (SRS API 004); payloads become DTO instances. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    stopAtFirstError: false,
    exceptionFactory: (errors) => new RequestValidationException(flattenValidationErrors(errors)),
  });
}
