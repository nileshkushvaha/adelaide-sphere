import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigModuleOptions } from '@nestjs/config';
import { API_ENV_FILE } from './env-file.js';
import { validateEnv } from './env.validation.js';

/**
 * Loading rules (deterministic regardless of working directory):
 *  1. Real process environment variables always win.
 *  2. apps/api/.env is read next, if present. It is never read when NODE_ENV=test
 *     so a developer's local file cannot influence the test suite.
 *  3. Defaults from EnvironmentVariables apply last (PORT 4001, NODE_ENV development).
 * `ConfigModule.forRoot` reads and validates the environment when it is called,
 * which for AppConfigModule is at import time; a validation failure throws and
 * aborts startup before any module is initialised.
 */
export function appConfigOptions(): ConfigModuleOptions {
  return {
    isGlobal: true,
    cache: true,
    envFilePath: API_ENV_FILE,
    ignoreEnvFile: process.env.NODE_ENV === 'test',
    validate: validateEnv,
  };
}

/**
 * forRoot is async in @nestjs/config 12 and is invoked here at import time.
 * Attaching a no-op rejection handler marks the promise as handled so an
 * invalid environment does not crash Node with an "unhandled rejection" and a
 * stack trace before bootstrap runs; Nest still awaits the same promise when
 * scanning imports and NestFactory.create rejects with the descriptive
 * message, which main.ts reports and exits on.
 */
const configModule = ConfigModule.forRoot(appConfigOptions());
configModule.catch(() => undefined);

@Module({
  imports: [configModule],
})
export class AppConfigModule {}
