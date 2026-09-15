/**
 * Worker logging (post-audit remediation, MON 002).
 *
 * Production emits one JSON object per line so a collector can index the
 * correlation fields — job id, job name, run id — without parsing prose.
 * Development keeps the readable line. Neither carries a recipient address, a
 * message body or a token: those belong in the record the admin screens read,
 * behind a permission, not in a log stream.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LogFields {
  jobId?: string;
  jobName?: string;
  runnerId?: string;
  taskCode?: string;
  attempt?: number;
  durationMs?: number;
  outcome?: string;
  /** Internal identifiers only; never an address or a body. */
  enquiryId?: string;
  error?: string;
}

export interface Logger {
  (level: LogLevel, message: string, fields?: LogFields): void;
  line: (text: string) => void;
}

export function createLogger(options: { json: boolean; level: LogLevel; service?: string }): Logger {
  const threshold = ORDER[options.level];
  const log = ((level: LogLevel, message: string, fields: LogFields = {}) => {
    if (ORDER[level] < threshold) return;
    const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
    if (options.json) {
      stream.write(`${JSON.stringify({ time: new Date().toISOString(), level, service: options.service ?? 'worker', message, ...fields })}\n`);
      return;
    }
    const extra = Object.entries(fields)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(' ');
    stream.write(`[${options.service ?? 'worker'}] ${message}${extra ? ` ${extra}` : ''}\n`);
  }) as Logger;
  // For the few places that already produce a finished line.
  log.line = (text: string) => log('info', text);
  return log;
}

export function logLevelFromEnv(value: string | undefined, fallback: LogLevel): LogLevel {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error' ? value : fallback;
}
