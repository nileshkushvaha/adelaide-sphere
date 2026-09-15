import { ConfigService } from '@nestjs/config';
import { DatabaseService } from './database.service.js';

function serviceFor(url: string): DatabaseService {
  const values: Record<string, unknown> = { DATABASE_URL: url, DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL: false };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService;
  return new DatabaseService(config as never);
}

describe('DatabaseService', () => {
  it('constructs without connecting', () => {
    const service = serviceFor('mysql://u:p@127.0.0.1:1/melbourne_sphere_test');
    expect(service.state).toBe('idle');
  });

  it('ping reports a failure result (not a throw) when the database is unreachable, then backs off', async () => {
    const service = serviceFor('mysql://u:p@127.0.0.1:1/melbourne_sphere_test');
    const first = await service.ping();
    expect(first).toEqual({ ok: false, reason: 'error' });
    const second = await service.ping();
    expect(second).toEqual({ ok: false, reason: 'backoff' });
    await service.onModuleDestroy();
    expect(service.state).toBe('closed');
  });

  it('client() rejects with a generic error when unreachable', async () => {
    const service = serviceFor('mysql://u:p@127.0.0.1:1/melbourne_sphere_test');
    await expect(service.client()).rejects.toMatchObject({ name: 'DatabaseUnavailableError' });
    await service.onModuleDestroy();
  });

  it('module destroy closes once and is idempotent', async () => {
    const service = serviceFor('mysql://u:p@127.0.0.1:1/melbourne_sphere_test');
    await service.onModuleDestroy();
    await service.onModuleDestroy();
    expect(await service.ping()).toEqual({ ok: false, reason: 'closed' });
  });
});
