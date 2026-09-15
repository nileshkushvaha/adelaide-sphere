import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { appConfigOptions } from './app-config.module.js';

/**
 * These tests build the ConfigModule with the exact options AppConfigModule
 * uses, after setting only the two variables it reads; the originals are
 * restored afterwards so nothing leaks between tests or into other suites.
 */
describe('AppConfigModule options', () => {
  const KEYS = ['PORT', 'NODE_ENV'] as const;
  const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('exposes validated, typed values from the process environment', async () => {
    process.env.PORT = '4321';
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot(appConfigOptions())],
    }).compile();
    const config = moduleRef.get(ConfigService);
    expect(config.get('PORT')).toBe(4321);
    expect(config.get('NODE_ENV')).toBe('test');
    await moduleRef.close();
  });

  it('ignores the .env file under NODE_ENV=test', () => {
    process.env.NODE_ENV = 'test';
    expect(appConfigOptions().ignoreEnvFile).toBe(true);
  });

  it('rejects on an invalid PORT with a message naming the key, not the value', async () => {
    process.env.PORT = '99999';
    process.env.NODE_ENV = 'test';
    // forRoot is async in @nestjs/config 12, so validation failures surface as a rejection.
    let message = '';
    try {
      await ConfigModule.forRoot(appConfigOptions());
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/Invalid environment configuration/);
    expect(message).toMatch(/PORT: .*65535/);
    expect(message).not.toContain('99999');
  });
});
