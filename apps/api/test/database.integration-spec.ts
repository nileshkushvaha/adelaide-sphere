import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

describe('API against the test database (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp();
  });

  afterAll(async () => {
    await app.close();
    await closeTestDatabase();
  });

  it('readiness reports the database and Redis as ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(res.body).toEqual({ data: { status: 'ready', checks: { database: 'ok', redis: 'ok' } } });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('migrations are applied and the collation policy holds', async () => {
    const db = testDatabase();
    const migrations = await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    expect(Number(migrations[0]?.n)).toBeGreaterThanOrEqual(2);
    const tables = await db.$queryRaw<{ TABLE_NAME: string; TABLE_COLLATION: string }[]>`
      SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`;
    for (const t of tables) expect(t.TABLE_COLLATION).toBe('utf8mb4_unicode_ci');
    const schema = await db.$queryRaw<{ DEFAULT_COLLATION_NAME: string }[]>`
      SELECT DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE()`;
    expect(schema[0]?.DEFAULT_COLLATION_NAME).toBe('utf8mb4_unicode_ci');
  });

  it('the harness truncates only application tables in the guarded test database', async () => {
    const db = testDatabase();
    await db.systemProbe.create({ data: { key: 'integration:harness', value: 'x' } });
    await truncateApplicationTables();
    expect(await db.systemProbe.count()).toBe(0);
    const name = await db.$queryRaw<{ db: string }[]>`SELECT DATABASE() AS db`;
    expect(name[0]?.db).toMatch(/_test$/);
  });
});
