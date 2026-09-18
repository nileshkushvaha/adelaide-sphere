import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';

/**
 * Age of the most recent successful database backup, read from the state file
 * the scheduled backup writes (SRS BACK 001, MON 002).
 *
 * The backup is a systemd oneshot outside both application processes, so this is
 * the only way the API can report on it. It is kept apart from OperationsService
 * so that service stays what it is — a composition of database reads — rather
 * than growing a filesystem dependency inline.
 *
 * The file is parsed by allowlist and never executed. Anything unreadable,
 * corrupt or absent reports "unknown" rather than a reassuring number.
 */
@Injectable()
export class BackupStatusService {
  private readonly stateDir: string | null;

  constructor(stateDir: string | null = (process.env.BACKUP_STATE_DIR ?? '').trim() || null) {
    this.stateDir = stateDir;
  }

  /**
   * Whether this host publishes backup state at all. When it does not, the
   * signal is left out rather than reported as broken: an environment with no
   * backups configured is unmeasured, not failing, and a permanently degraded
   * status is one nobody reads. Production sets BACKUP_STATE_DIR.
   */
  get configured(): boolean {
    return this.stateDir !== null;
  }

  /** Seconds since the last successful backup of that tier, or null when unknown. */
  ageSeconds(tier: 'daily' | 'weekly', now = new Date()): number | null {
    if (this.stateDir === null) return null;
    let text: string;
    try {
      text = readFileSync(join(this.stateDir, `${tier}.state`), 'utf8');
    } catch {
      return null;
    }
    for (const line of text.split('\n')) {
      if (!line.startsWith('last_success_epoch=')) continue;
      const seconds = Number(line.slice('last_success_epoch='.length).trim());
      if (!Number.isSafeInteger(seconds) || seconds <= 0) return null;
      return Math.max(0, Math.round(now.getTime() / 1000) - seconds);
    }
    return null;
  }
}
