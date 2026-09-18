/**
 * Backup freshness, published from the state files the scheduled backup writes
 * (SRS MON 001/002, BACK 001/002).
 *
 * The backup runs outside both application processes — it is a systemd oneshot,
 * so it has nowhere of its own to publish from, and this host has no push
 * gateway and no node_exporter. The worker does have a metrics endpoint whose
 * only purpose is metrics, runs on the same host as the backup, and is already a
 * scrape target, so it reads the state files at scrape time and publishes them.
 *
 * Everything here treats the files as untrusted input: they are parsed by
 * allowlist, never executed, and the tier a series can carry is fixed by this
 * file rather than by a filename, so nothing on disk can invent a series.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Gauge, type Registry } from 'prom-client';

/** The only tiers that may appear as a label. Not read from the filesystem. */
export const BACKUP_TIERS = ['daily', 'weekly'] as const;
export type BackupTier = (typeof BACKUP_TIERS)[number];

export interface BackupState {
  lastRunEpoch: number;
  lastRunSuccess: number;
  lastSuccessEpoch: number;
  sizeBytes: number;
  offsiteConfigured: number;
  offsiteLastSuccessEpoch: number;
  diskFreeBytes: number;
}

const FIELDS: Record<string, keyof BackupState> = {
  last_run_epoch: 'lastRunEpoch',
  last_run_success: 'lastRunSuccess',
  last_success_epoch: 'lastSuccessEpoch',
  size_bytes: 'sizeBytes',
  offsite_configured: 'offsiteConfigured',
  offsite_last_success_epoch: 'offsiteLastSuccessEpoch',
  disk_free_bytes: 'diskFreeBytes',
};

/**
 * `key=value` lines, allowlisted and numeric-only. A line that is not in FIELDS,
 * or whose value is not a non-negative integer, is dropped rather than trusted;
 * a truncated or corrupt file therefore yields no series rather than a wrong one.
 */
export function parseBackupState(text: string): BackupState | null {
  const found: Partial<BackupState> = {};
  for (const line of text.split('\n')) {
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const field = FIELDS[line.slice(0, index).trim()];
    if (field === undefined) continue;
    const value = Number(line.slice(index + 1).trim());
    if (!Number.isSafeInteger(value) || value < 0) continue;
    found[field] = value;
  }
  // A run that has never succeeded still records the other fields, so only the
  // two that every writer always emits are treated as mandatory.
  if (found.lastRunEpoch === undefined || found.lastSuccessEpoch === undefined) return null;
  return {
    lastRunEpoch: found.lastRunEpoch,
    lastRunSuccess: found.lastRunSuccess ?? 0,
    lastSuccessEpoch: found.lastSuccessEpoch,
    sizeBytes: found.sizeBytes ?? 0,
    offsiteConfigured: found.offsiteConfigured ?? 0,
    offsiteLastSuccessEpoch: found.offsiteLastSuccessEpoch ?? 0,
    diskFreeBytes: found.diskFreeBytes ?? 0,
  };
}

/** Reads one state file by name. The caller decides which names are allowed. */
function readState(stateDir: string, name: string): BackupState | null {
  try {
    return parseBackupState(readFileSync(join(stateDir, `${name}.state`), 'utf8'));
  } catch {
    // Missing or unreadable: the series is simply absent, which reads as "not
    // measured". Inventing a zero here would read as "measured, and fine".
    return null;
  }
}

export function readBackupState(stateDir: string, tier: BackupTier): BackupState | null {
  return readState(stateDir, tier);
}

/** The restore drill and the media mirror write files of the same shape. */
function readDrillTimestamp(stateDir: string): number | null {
  const state = readState(stateDir, 'restore-drill');
  return state === null ? null : state.lastSuccessEpoch;
}

/**
 * Registers the backup gauges against a registry, refreshed at scrape time.
 *
 * When no state directory is configured the gauges are not registered at all.
 * Publishing always-zero series would read as "nothing is failing" when the
 * truth is "nothing is measured", and the alert that matters here fires on
 * staleness, so a confidently wrong zero is worse than an absent series.
 */
export function registerBackupMetrics(registry: Registry, stateDir: string | null): void {
  if (stateDir === null) return;

  const lastSuccess = new Gauge({
    name: 'as_backup_last_success_timestamp_seconds',
    help: 'Unix time of the last successful database backup, by tier.',
    labelNames: ['tier'] as const,
    registers: [registry],
  });
  const lastRun = new Gauge({
    name: 'as_backup_last_run_timestamp_seconds',
    help: 'Unix time of the last database backup attempt, by tier.',
    labelNames: ['tier'] as const,
    registers: [registry],
  });
  const lastRunSuccess = new Gauge({
    name: 'as_backup_last_run_success',
    help: '1 when the last database backup attempt succeeded, 0 when it failed.',
    labelNames: ['tier'] as const,
    registers: [registry],
  });
  const sizeBytes = new Gauge({
    name: 'as_backup_size_bytes',
    help: 'Size of the most recent backup file, by tier. A sudden drop means a truncated dump.',
    labelNames: ['tier'] as const,
    registers: [registry],
  });
  const offsiteLastSuccess = new Gauge({
    name: 'as_backup_offsite_last_success_timestamp_seconds',
    help: 'Unix time of the last successful off-site copy, by tier (SRS BACK 002).',
    labelNames: ['tier'] as const,
    registers: [registry],
  });
  const offsiteConfigured = new Gauge({
    name: 'as_backup_offsite_configured',
    help: '1 when an off-site backup remote is configured on this host, 0 when it is not.',
    registers: [registry],
  });
  const drillLastSuccess = new Gauge({
    name: 'as_restore_drill_last_success_timestamp_seconds',
    help: 'Unix time of the last successful restore drill (SRS BACK 002, quarterly).',
    registers: [registry],
  });
  const diskFree = new Gauge({
    name: 'as_backup_disk_free_bytes',
    help: 'Free space on the filesystem holding the backups, as of the last run.',
    labelNames: ['tier'] as const,
    registers: [registry],
  });
  const mediaMirrorLastSuccess = new Gauge({
    name: 'as_media_mirror_last_success_timestamp_seconds',
    help: 'Unix time of the last successful off-site media mirror (SRS BACK 001, one-hour lag).',
    registers: [registry],
  });
  const mediaMirrorConfigured = new Gauge({
    name: 'as_media_mirror_configured',
    help: '1 when an off-site media target is configured on this host, 0 when it is not.',
    registers: [registry],
  });

  // prom-client calls collect() once per gauge; without this the files would be
  // re-read seven times for a single scrape.
  let lastRefresh = 0;
  const refresh = (): void => {
    const now = Date.now();
    if (now - lastRefresh < 1_000) return;
    lastRefresh = now;
    let anyConfigured = 0;
    for (const tier of BACKUP_TIERS) {
      const state = readBackupState(stateDir, tier);
      if (state === null) {
        // Remove rather than zero: an absent tier must not look like a fresh one.
        lastSuccess.remove({ tier });
        lastRun.remove({ tier });
        lastRunSuccess.remove({ tier });
        sizeBytes.remove({ tier });
        offsiteLastSuccess.remove({ tier });
        diskFree.remove({ tier });
        continue;
      }
      // A tier that has run but never succeeded reports 0, so that
      // `time() - metric` is enormous and the staleness alert fires.
      lastSuccess.set({ tier }, state.lastSuccessEpoch);
      lastRun.set({ tier }, state.lastRunEpoch);
      lastRunSuccess.set({ tier }, state.lastRunSuccess);
      sizeBytes.set({ tier }, state.sizeBytes);
      offsiteLastSuccess.set({ tier }, state.offsiteLastSuccessEpoch);
      // A state file written before this field existed reports 0, and a
      // published zero would read as "the disk is full" to any threshold rule.
      // Absent is the truthful reading for "this run did not report it".
      if (state.diskFreeBytes > 0) diskFree.set({ tier }, state.diskFreeBytes);
      else diskFree.remove({ tier });
      if (state.offsiteConfigured === 1) anyConfigured = 1;
    }
    offsiteConfigured.set(anyConfigured);
    const drill = readDrillTimestamp(stateDir);
    if (drill === null) drillLastSuccess.set(0);
    else drillLastSuccess.set(drill);
    // The media mirror is not a tier: it copies uploaded files, which no
    // database dump contains, and it runs hourly rather than nightly.
    const media = readState(stateDir, 'media-mirror');
    mediaMirrorLastSuccess.set(media === null ? 0 : media.lastSuccessEpoch);
    mediaMirrorConfigured.set(media === null ? 0 : media.offsiteConfigured);
  };

  // Refreshed when Prometheus scrapes, the same way the API's collector works,
  // so the numbers are never staler than the scrape that reported them.
  for (const gauge of [lastSuccess, lastRun, lastRunSuccess, sizeBytes, offsiteLastSuccess, offsiteConfigured, drillLastSuccess, diskFree, mediaMirrorLastSuccess, mediaMirrorConfigured]) {
    (gauge as unknown as { collect: () => void }).collect = refresh;
  }
}
