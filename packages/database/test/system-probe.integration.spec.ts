import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseConnection, createDatabaseClient, parseMysqlUrl, type DatabaseClient } from '../src/index.js';

/**
 * Runs against the local Compose MySQL. Safety guards:
 *  - DATABASE_URL comes from the environment or packages/database/.env;
 *  - the database name MUST end in `_dev` or `_test`, otherwise the suite
 *    refuses to run (never mutate anything that could be production);
 *  - all rows it writes use the key prefix `integration-test:` and are removed
 *    in afterAll, including leftovers from a previous aborted run.
 */
const here = dirname(fileURLToPath(import.meta.url));
const localEnv = resolve(here, '../.env');
if (!process.env.DATABASE_URL && existsSync(localEnv)) process.loadEnvFile(localEnv);

const url = process.env.DATABASE_URL;
const KEY_PREFIX = 'integration-test:';

describe('SystemProbe integration (local MySQL)', () => {
  let db: DatabaseClient;
  const runKey = `${KEY_PREFIX}${randomUUID()}`;

  beforeAll(async () => {
    if (!url) throw new Error('DATABASE_URL is required for integration tests');
    const { database } = parseMysqlUrl(url);
    if (!/(_dev|_test)$/.test(database)) {
      throw new Error('Refusing to run integration tests: database name must end with _dev or _test');
    }
    db = createDatabaseClient({ url, connectionLimit: 2, allowPublicKeyRetrieval: true });
    await db.systemProbe.deleteMany({ where: { key: { startsWith: KEY_PREFIX } } });
  });

  afterAll(async () => {
    if (!db) return;
    await db.systemProbe.deleteMany({ where: { key: { startsWith: KEY_PREFIX } } });
    await db.$disconnect();
  });

  it('answers a raw connectivity query', async () => {
    const rows = await db.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
    // The mariadb driver returns integer literals as BigInt.
    expect(Number(rows[0]?.ok)).toBe(1);
  });

  it('creates, reads, updates and deletes a probe row with utf8mb4 content', async () => {
    const created = await db.systemProbe.create({ data: { key: runKey, value: 'created 🦘' } });
    expect(created.id).toMatch(/^c[a-z0-9]{20,}$/);
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt.getTime()).toBeGreaterThanOrEqual(created.createdAt.getTime());

    const read = await db.systemProbe.findUnique({ where: { key: runKey } });
    expect(read?.value).toBe('created 🦘');

    const updated = await db.systemProbe.update({ where: { key: runKey }, data: { value: 'updated' } });
    expect(updated.value).toBe('updated');
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());

    await db.systemProbe.delete({ where: { key: runKey } });
    expect(await db.systemProbe.findUnique({ where: { key: runKey } })).toBeNull();
  });

  it('enforces the unique key constraint', async () => {
    await db.systemProbe.create({ data: { key: runKey, value: 'first' } });
    await expect(db.systemProbe.create({ data: { key: runKey, value: 'second' } })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('reports the table as utf8mb4', async () => {
    const rows = await db.$queryRaw<{ TABLE_COLLATION: string }[]>`
      SELECT TABLE_COLLATION FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_probes'`;
    expect(rows[0]?.TABLE_COLLATION).toMatch(/^utf8mb4_/);
  });

  it('DatabaseConnection connects, checks and closes against the real database', async () => {
    const conn = new DatabaseConnection({ url: url!, connectionLimit: 1, allowPublicKeyRetrieval: true });
    expect(conn.state).toBe('idle');
    const first = await conn.check();
    expect(first).toMatchObject({ ok: true });
    expect(conn.state).toBe('ready');
    const client = await conn.getClient();
    expect(await client.systemProbe.count()).toBeGreaterThanOrEqual(0);
    await conn.close();
    expect(conn.state).toBe('closed');
    expect(await conn.check()).toEqual({ ok: false, reason: 'closed' });
  });
});
