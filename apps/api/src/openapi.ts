import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

/** Builds the OpenAPI 3 document for every registered route (SRS API 001). */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Adelaide Sphere API')
    .setDescription('REST API for the Adelaide Sphere directory and blog. Admin routes require the ms_admin_session cookie.')
    .setVersion('1.0')
    .addCookieAuth('ms_admin_session', { type: 'apiKey', in: 'cookie', name: 'ms_admin_session' }, 'adminSession')
    .build();
  return SwaggerModule.createDocument(app, config, { ignoreGlobalPrefix: false });
}
