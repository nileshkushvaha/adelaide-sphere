import { Test } from '@nestjs/testing';
import type { INestApplication, ModuleMetadata } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module.js';
import { APP_CREATE_OPTIONS, configureApp } from '../src/app.setup.js';

export interface TestAppOptions extends Pick<ModuleMetadata, 'controllers' | 'providers'> {
  /** Replaces real infrastructure adapters (SRS MOD 002), e.g. the captcha verifier. */
  overrides?: { token: unknown; useValue: unknown }[];
}

/**
 * Builds an application exactly as main.ts does (same module, same
 * configureApp), optionally adding test-only controllers or replacing
 * infrastructure adapters.
 */
export async function createTestApp(extra: TestAppOptions = {}): Promise<INestApplication> {
  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: extra.controllers ?? [],
    providers: extra.providers ?? [],
  });
  for (const override of extra.overrides ?? []) {
    builder = builder.overrideProvider(override.token).useValue(override.useValue);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    ...APP_CREATE_OPTIONS,
    logger: false,
  });
  configureApp(app);
  await app.init();
  return app;
}
