import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BACKUP_STATE_DIR, BackupStatusService, backupStateDirProvider } from './backup-status.service.js';

const NOW = new Date('2026-09-18T00:00:00Z');
const at = (epoch: number): string => `schema=1\ntier=daily\nlast_run_epoch=${epoch}\nlast_run_success=1\nlast_success_epoch=${epoch}\n`;

describe('BackupStatusService', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'api-backup-state-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('is not configured when no state directory is set', () => {
    expect(new BackupStatusService(null).configured).toBe(false);
    expect(new BackupStatusService(null).ageSeconds('daily', NOW)).toBeNull();
  });

  it('reports the age of the last successful backup', () => {
    writeFileSync(join(dir, 'daily.state'), at(Math.round(NOW.getTime() / 1000) - 3600));
    expect(new BackupStatusService(dir).ageSeconds('daily', NOW)).toBe(3600);
  });

  it('reports unknown when the tier has never succeeded', () => {
    writeFileSync(join(dir, 'daily.state'), at(0));
    expect(new BackupStatusService(dir).ageSeconds('daily', NOW)).toBeNull();
  });

  it('reports unknown for a missing or corrupt file rather than a reassuring number', () => {
    expect(new BackupStatusService(dir).ageSeconds('daily', NOW)).toBeNull();
    writeFileSync(join(dir, 'daily.state'), 'last_success_epoch=not-a-number\n');
    expect(new BackupStatusService(dir).ageSeconds('daily', NOW)).toBeNull();
  });

  it('never returns a negative age when the clock moves backwards', () => {
    writeFileSync(join(dir, 'daily.state'), at(Math.round(NOW.getTime() / 1000) + 600));
    expect(new BackupStatusService(dir).ageSeconds('daily', NOW)).toBe(0);
  });
});

// Constructing the class directly, as every test above does, bypasses the
// dependency container, which is exactly how an unresolvable constructor
// parameter once reached a build that could not start. These resolve it the
// way the application does.
describe('BackupStatusService through the Nest container', () => {
  const saved = process.env.BACKUP_STATE_DIR;
  afterEach(() => {
    if (saved === undefined) delete process.env.BACKUP_STATE_DIR;
    else process.env.BACKUP_STATE_DIR = saved;
  });

  it('resolves with the providers the operations module registers', async () => {
    process.env.BACKUP_STATE_DIR = '/srv/adelaide-sphere/backups/state';
    const moduleRef = await Test.createTestingModule({ providers: [BackupStatusService, backupStateDirProvider] }).compile();
    expect(moduleRef.get(BackupStatusService).configured).toBe(true);
    expect(moduleRef.get(BACKUP_STATE_DIR)).toBe('/srv/adelaide-sphere/backups/state');
  });

  it('resolves as unconfigured when the variable is unset', async () => {
    delete process.env.BACKUP_STATE_DIR;
    const moduleRef = await Test.createTestingModule({ providers: [BackupStatusService, backupStateDirProvider] }).compile();
    expect(moduleRef.get(BackupStatusService).configured).toBe(false);
  });
});
