import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { AppModule } from './app.module.js';
import { APP_CREATE_OPTIONS, API_PREFIX, configureApp } from './app.setup.js';
import { buildOpenApiDocument } from './openapi.js';
import type { EnvironmentVariables } from './config/env.validation.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    ...APP_CREATE_OPTIONS,
  });
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  configureApp(app, { trustProxy: config.get('TRUST_PROXY', { infer: true }), metricsToken: config.get('METRICS_TOKEN', { infer: true }) });
  if (config.get('OPENAPI_ENABLED', { infer: true })) {
    // JSON only (no UI): keeps the strict API CSP and exposes nothing but the contract.
    const document = buildOpenApiDocument(app);
    app.getHttpAdapter().getInstance().get(`${API_PREFIX}/openapi.json`, (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      res.json(document);
    });
  }
  // Close the database, Redis and queue connections cleanly when systemd stops the service.
  app.enableShutdownHooks();
  const port = config.get('PORT', { infer: true });
  // Only the reverse proxy on this host should reach the API in production.
  const host = config.get('HOST', { infer: true }) ?? (config.get('NODE_ENV', { infer: true }) === 'production' ? '127.0.0.1' : undefined);
  await (host ? app.listen(port, host) : app.listen(port));
  console.log(`[api] listening on http://localhost:${port}${API_PREFIX}`);
}

try {
  await bootstrap();
} catch (error) {
  // Configuration errors are already descriptive and never include values.
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[api] startup failed: ${message}`);
  process.exit(1);
}
