import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Registry } from 'prom-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseBackupState, registerBackupMetrics } from './backup-status.js';

const GOOD = [
  'schema=1',
  'tier=daily',
  'last_run_epoch=1700000100',
  'last_run_success=1',
  'last_success_epoch=1700000100',
  'size_bytes=4096',
  'offsite_configured=1',
  'offsite_last_success_epoch=1700000200',
  'disk_free_bytes=21386350592',
  '',
].join('\n');

describe('parseBackupState', () => {
  it('reads every field the backup writes', () => {
    expect(parseBackupState(GOOD)).toEqual({
      lastRunEpoch: 1_700_000_100,
      lastRunSuccess: 1,
      lastSuccessEpoch: 1_700_000_100,
      sizeBytes: 4096,
      offsiteConfigured: 1,
      offsiteLastSuccessEpoch: 1_700_000_200,
      diskFreeBytes: 21_386_350_592,
    });
  });

  it('returns null for a truncated file rather than a partial reading', () => {
    expect(parseBackupState('schema=1\ntier=daily\nlast_run_')).toBeNull();
  });

  it('ignores keys it does not know, so a state file cannot invent a field', () => {
    const state = parseBackupState(`${GOOD}evil=9\n__proto__=9\n`);
    expect(state).not.toBeNull();
    expect(Object.keys(state as object)).toHaveLength(7);
  });

  it('drops values that are not non-negative integers', () => {
    const state = parseBackupState(GOOD.replace('size_bytes=4096', 'size_bytes=-1'));
    expect(state?.sizeBytes).toBe(0);
  });

  it('does not treat a shell expression as a value', () => {
    const state = parseBackupState(GOOD.replace('size_bytes=4096', 'size_bytes=$(rm -rf /)'));
    expect(state?.sizeBytes).toBe(0);
  });
});

describe('registerBackupMetrics', () => {
  let dir: string;
  let registry: Registry;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'backup-state-'));
    registry = new Registry();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('registers nothing at all when no state directory is configured', async () => {
    registerBackupMetrics(registry, null);
    expect(await registry.metrics()).not.toContain('as_backup_last_success_timestamp_seconds');
  });

  it('publishes one series per tier present', async () => {
    writeFileSync(join(dir, 'daily.state'), GOOD);
    writeFileSync(join(dir, 'weekly.state'), GOOD.replace('tier=daily', 'tier=weekly'));
    registerBackupMetrics(registry, dir);
    const body = await registry.metrics();
    expect(body).toContain('as_backup_last_success_timestamp_seconds{tier="daily"} 1700000100');
    expect(body).toContain('as_backup_last_success_timestamp_seconds{tier="weekly"} 1700000100');
  });

  it('leaves a tier absent rather than reporting a fresh zero for it', async () => {
    writeFileSync(join(dir, 'daily.state'), GOOD);
    registerBackupMetrics(registry, dir);
    const body = await registry.metrics();
    expect(body).toContain('tier="daily"');
    expect(body).not.toContain('tier="weekly"');
  });

  it('reports zero for a tier that has run but never succeeded, so staleness alerts fire', async () => {
    writeFileSync(join(dir, 'daily.state'), GOOD.replace('last_success_epoch=1700000100', 'last_success_epoch=0').replace('last_run_success=1', 'last_run_success=0'));
    registerBackupMetrics(registry, dir);
    const body = await registry.metrics();
    expect(body).toContain('as_backup_last_success_timestamp_seconds{tier="daily"} 0');
    expect(body).toContain('as_backup_last_run_success{tier="daily"} 0');
  });

  it('survives a corrupt state file without throwing or publishing it', async () => {
    writeFileSync(join(dir, 'daily.state'), '\u0000\u0000not a state file at all');
    registerBackupMetrics(registry, dir);
    const body = await registry.metrics();
    expect(body).not.toContain('tier="daily"');
  });

  it('publishes the restore drill timestamp for the overdue alert', async () => {
    writeFileSync(join(dir, 'restore-drill.state'), GOOD.replace('tier=daily', 'tier=restore-drill'));
    registerBackupMetrics(registry, dir);
    expect(await registry.metrics()).toContain('as_restore_drill_last_success_timestamp_seconds 1700000100');
  });

  it('publishes free disk space so a full disk is visible before it stops MySQL', async () => {
    writeFileSync(join(dir, 'daily.state'), GOOD);
    registerBackupMetrics(registry, dir);
    expect(await registry.metrics()).toContain('as_backup_disk_free_bytes{tier="daily"} 21386350592');
  });

  it('leaves disk space absent rather than publishing a zero that reads as a full disk', async () => {
    writeFileSync(join(dir, 'daily.state'), GOOD.replace('disk_free_bytes=21386350592', 'disk_free_bytes=0'));
    registerBackupMetrics(registry, dir);
    expect(await registry.metrics()).not.toContain('as_backup_disk_free_bytes{tier="daily"}');
  });

  it('publishes the media mirror separately from the database tiers', async () => {
    writeFileSync(join(dir, 'media-mirror.state'), GOOD.replace('tier=daily', 'tier=media-mirror'));
    registerBackupMetrics(registry, dir);
    const body = await registry.metrics();
    expect(body).toContain('as_media_mirror_last_success_timestamp_seconds 1700000100');
    expect(body).toContain('as_media_mirror_configured 1');
    // The mirror is not a tier: it must never appear as one.
    expect(body).not.toContain('tier="media-mirror"');
  });

  it('reports the media mirror as unconfigured when no state exists', async () => {
    registerBackupMetrics(registry, dir);
    expect(await registry.metrics()).toContain('as_media_mirror_configured 0');
  });

  it('publishes the binlog archive, which the one-hour RPO depends on', async () => {
    writeFileSync(join(dir, 'binlog-archive.state'), GOOD.replace('tier=daily', 'tier=binlog-archive'));
    registerBackupMetrics(registry, dir);
    const body = await registry.metrics();
    expect(body).toContain('as_binlog_archive_last_success_timestamp_seconds 1700000100');
    expect(body).toContain('as_binlog_archive_configured 1');
    expect(body).not.toContain('tier="binlog-archive"');
  });

  it('reports off-site as unconfigured when no tier has a remote', async () => {
    writeFileSync(join(dir, 'daily.state'), GOOD.replace('offsite_configured=1', 'offsite_configured=0'));
    registerBackupMetrics(registry, dir);
    expect(await registry.metrics()).toContain('as_backup_offsite_configured 0');
  });
});
