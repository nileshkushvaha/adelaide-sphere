/** Writes the OpenAPI document to packages/contracts/openapi/api.json (SRS API 001). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../app.module.js';
import { APP_CREATE_OPTIONS, configureApp } from '../app.setup.js';
import { buildOpenApiDocument } from '../openapi.js';

async function main(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { ...APP_CREATE_OPTIONS, logger: ['error'] });
  configureApp(app);
  await app.init();
  const document = buildOpenApiDocument(app);
  // OPENAPI_OUT lets `contracts:check` write to a temporary path for comparison.
  const out = process.env.OPENAPI_OUT ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/contracts/openapi/api.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(document, null, 2) + '\n');
  console.log(`[openapi] wrote ${out} (${Object.keys(document.paths).length} paths)`);
  await app.close();
}

main().catch((error: unknown) => {
  console.error(`[openapi] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
