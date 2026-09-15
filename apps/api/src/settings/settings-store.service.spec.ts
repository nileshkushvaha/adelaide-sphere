import { ConflictException, HttpException } from '@nestjs/common';
import type { AuditService } from '../audit/audit.service.js';
import type { CacheService } from '../cache/cache.service.js';
import type { DatabaseService } from '../database/database.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import type { SettingGroupDeclaration, SettingGroupKey } from './registry.js';
import { SettingsStoreService } from './settings-store.service.js';

/**
 * The change contract of SET 003, proven against a fixture declaration so no
 * fixture setting has to exist in the production registry. Everything except
 * group resolution is the real code path; the fixture group names the
 * `operations` key so the real table selection runs too.
 */
const fixture: SettingGroupDeclaration = {
  key: 'operations',
  label: 'Fixture',
  description: 'Fixture group',
  owner: 'Test',
  storeKey: 'fixture',
  viewPermission: 'system.settings.view',
  updatePermission: 'system.settings.update',
  settings: [
    {
      key: 'retentionDays',
      label: 'Retention days',
      description: 'Bounded integer',
      type: 'integer',
      bounds: { min: 1, max: 30 },
      default: 7,
      visibility: 'private',
      effect: 'runtime',
      sensitive: false,
      viewPermission: 'system.settings.view',
      updatePermission: 'system.settings.update',
      invalidates: ['settings'],
      enforcedBy: 'spec fixture',
    },
    {
      key: 'label',
      label: 'Label',
      description: 'Bounded text with no cache consequence',
      type: 'string',
      bounds: { max: 40 },
      default: 'default',
      visibility: 'private',
      effect: 'runtime',
      sensitive: false,
      viewPermission: 'system.settings.view',
      updatePermission: 'system.settings.update',
      invalidates: [],
      enforcedBy: 'spec fixture',
    },
  ],
};

class FixtureStore extends SettingsStoreService {
  protected override resolveGroup(_key: SettingGroupKey): SettingGroupDeclaration {
    return fixture;
  }
}

type Row = { key: string; data: unknown; version: number; updatedByAdminId: string | null; updatedAt: Date };

function build(row: Row | null) {
  let stored = row;
  const auditWrites: { action: string; metadata: Record<string, unknown> }[] = [];
  const invalidations: { tags: string[] }[] = [];
  let namespaceBumps = 0;

  const table = {
    findUnique: vi.fn(async () => stored),
    update: vi.fn(async ({ data }: { data: { data: unknown; version: { increment: number } } }) => {
      stored = { key: 'fixture', data: data.data, version: (stored?.version ?? 0) + data.version.increment, updatedByAdminId: 'admin-1', updatedAt: new Date('2026-09-07T10:00:00Z') };
      return stored;
    }),
    create: vi.fn(async ({ data }: { data: { data: unknown; version: number } }) => {
      stored = { key: 'fixture', data: data.data, version: data.version, updatedByAdminId: 'admin-1', updatedAt: new Date('2026-09-07T10:00:00Z') };
      return stored;
    }),
  };

  const client = {
    setting: table,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ setting: table }),
  };

  const database = { client: async () => client } as unknown as DatabaseService;
  const audit = {
    recordWith: vi.fn(async (_client: unknown, entry: { action: string; metadata: Record<string, unknown> }) => {
      auditWrites.push({ action: entry.action, metadata: entry.metadata });
    }),
  } as unknown as AuditService;
  const cache = {
    recordInvalidation: vi.fn(async (_tx: unknown, input: { tags: string[] }) => {
      invalidations.push({ tags: input.tags });
    }),
    bumpNamespace: vi.fn(async () => {
      namespaceBumps += 1;
    }),
  } as unknown as CacheService;

  return { store: new FixtureStore(database, audit, cache), table, auditWrites, invalidations, bumps: () => namespaceBumps, current: () => stored };
}

const actor = { id: 'admin-1', permissions: [] } as unknown as AdminPrincipal;
const ctx = { ip: '127.0.0.1', userAgent: 'vitest', requestId: 'req-1' };

describe('SettingsStoreService (SRS 1.2 SET 003)', () => {
  it('serves the declared defaults at version 0 when nothing is stored', async () => {
    const { store } = build(null);
    const record = await store.read('operations');
    expect(record.values).toEqual({ retentionDays: 7, label: 'default' });
    expect(record.version).toBe(0);
    expect(record.updatedByAdminId).toBeNull();
  });

  it('serves only declared keys, so a value left by a retired declaration never reaches a response', async () => {
    const { store } = build({ key: 'fixture', data: { retentionDays: 14, removedSetting: 'stale' }, version: 3, updatedByAdminId: 'admin-9', updatedAt: new Date() });
    const record = await store.read('operations');
    expect(record.values).toEqual({ retentionDays: 14, label: 'default' });
    expect(record.values).not.toHaveProperty('removedSetting');
  });

  it('rejects an invalid value with field errors and writes nothing', async () => {
    const { store, table } = build(null);
    await expect(store.update('operations', { retentionDays: 99 }, 0, actor, ctx)).rejects.toMatchObject({
      response: { code: 'VALIDATION_ERROR', fields: { retentionDays: ['Must be 30 or less'] } },
    });
    expect(table.create).not.toHaveBeenCalled();
    expect(table.update).not.toHaveBeenCalled();
  });

  it('rejects an unknown key rather than ignoring it', async () => {
    const { store } = build(null);
    await expect(store.update('operations', { retentionDay: 5 }, 0, actor, ctx)).rejects.toBeInstanceOf(HttpException);
  });

  it('refuses a concurrent change with 409 STALE_VERSION and writes nothing', async () => {
    const { store, table } = build({ key: 'fixture', data: { retentionDays: 7 }, version: 4, updatedByAdminId: null, updatedAt: new Date() });
    await expect(store.update('operations', { retentionDays: 9 }, 3, actor, ctx)).rejects.toBeInstanceOf(ConflictException);
    expect(table.update).not.toHaveBeenCalled();
  });

  it('validates before it version-checks, so a stale form still reports its field errors', async () => {
    const { store } = build({ key: 'fixture', data: {}, version: 4, updatedByAdminId: null, updatedAt: new Date() });
    await expect(store.update('operations', { retentionDays: 0 }, 1, actor, ctx)).rejects.toMatchObject({
      response: { code: 'VALIDATION_ERROR' },
    });
  });

  it('commits the change, its audit record and its cache invalidation together', async () => {
    const { store, auditWrites, invalidations, bumps } = build(null);
    const record = await store.update('operations', { retentionDays: 14 }, 0, actor, ctx);

    expect(record.values.retentionDays).toBe(14);
    expect(record.version).toBe(1);
    expect(auditWrites).toHaveLength(1);
    expect(auditWrites[0].action).toBe('settings.operations.update');
    expect(auditWrites[0].metadata).toMatchObject({ changed: 'retentionDays', 'before.retentionDays': 7, 'after.retentionDays': 14 });
    expect(invalidations).toEqual([{ tags: ['settings'] }]);
    expect(bumps()).toBe(1);
  });

  it('records a before/after summary for the changed settings only', async () => {
    const { store, auditWrites } = build({ key: 'fixture', data: { retentionDays: 7, label: 'keep' }, version: 2, updatedByAdminId: null, updatedAt: new Date() });
    await store.update('operations', { retentionDays: 9, label: 'keep' }, 2, actor, ctx);
    expect(auditWrites[0].metadata).toEqual({ changed: 'retentionDays', 'before.retentionDays': 7, 'after.retentionDays': 9 });
  });

  it('treats an unchanged save as a successful no-op: no write, no version bump, no audit event', async () => {
    const stored = { key: 'fixture', data: { retentionDays: 7, label: 'default' }, version: 5, updatedByAdminId: null, updatedAt: new Date() };
    const { store, table, auditWrites, invalidations, bumps } = build(stored);
    const record = await store.update('operations', { retentionDays: 7, label: 'default' }, 5, actor, ctx);
    expect(record.version).toBe(5);
    expect(table.update).not.toHaveBeenCalled();
    expect(table.create).not.toHaveBeenCalled();
    expect(auditWrites).toEqual([]);
    expect(invalidations).toEqual([]);
    expect(bumps()).toBe(0);
  });

  it('repeating the same change is idempotent', async () => {
    const { store, table } = build(null);
    const first = await store.update('operations', { retentionDays: 14 }, 0, actor, ctx);
    const second = await store.update('operations', { retentionDays: 14 }, first.version, actor, ctx);
    expect(second.version).toBe(first.version);
    expect(table.update).not.toHaveBeenCalled();
  });

  it('invalidates only what the changed settings declare', async () => {
    const { store, invalidations, bumps } = build({ key: 'fixture', data: { retentionDays: 7, label: 'default' }, version: 1, updatedByAdminId: null, updatedAt: new Date() });
    await store.update('operations', { label: 'changed' }, 1, actor, ctx);
    // `label` declares no cache consequence, so nothing is purged.
    expect(invalidations).toEqual([]);
    expect(bumps()).toBe(0);
  });

});
