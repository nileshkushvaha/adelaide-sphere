/**
 * Worker liveness (post-audit remediation, SRS MON 001).
 *
 * The audit found a worker that exited at start-up in every deployment and
 * nothing noticed: the queue was healthy, Redis was healthy, jobs accumulated,
 * and no signal anywhere distinguished "no work to do" from "nothing is
 * running". A heartbeat is that signal.
 *
 * The shape is deliberately small and non-sensitive: an instance id, the code
 * version, when the process started, when it last checked in, and which queues
 * it consumes. No host name, no environment, no configuration, no credentials —
 * a monitoring surface is read by more people than the systems it describes.
 *
 * Keys expire, so a worker that dies stops being counted without anything
 * having to clean up after it, and several replicas simply write several keys.
 */
export const WORKER_HEARTBEAT_PREFIX = 'worker:heartbeat:';

/** How often a worker writes. Short enough to detect a stop quickly. */
export const WORKER_HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * How long a heartbeat survives without being renewed. Three intervals: one
 * missed write is a slow moment, three is a worker that is not there.
 */
export const WORKER_HEARTBEAT_TTL_SECONDS = 45;

export interface WorkerHeartbeat {
  /** Identifies the replica, not the machine: pid plus random, stable for the process. */
  instanceId: string;
  version: string;
  startedAt: string;
  lastBeatAt: string;
  queues: string[];
  /** Jobs this instance has finished since it started; a worker that is alive but stuck stops moving. */
  processed: number;
  failed: number;
}

export function workerHeartbeatKey(instanceId: string): string {
  return `${WORKER_HEARTBEAT_PREFIX}${instanceId}`;
}

/** True when the heartbeat is recent enough to mean the worker is alive. */
export function heartbeatIsFresh(beat: Pick<WorkerHeartbeat, 'lastBeatAt'>, now: Date = new Date()): boolean {
  const age = now.getTime() - new Date(beat.lastBeatAt).getTime();
  return Number.isFinite(age) && age >= 0 && age <= WORKER_HEARTBEAT_TTL_SECONDS * 1000;
}

export function heartbeatAgeSeconds(beat: Pick<WorkerHeartbeat, 'lastBeatAt'>, now: Date = new Date()): number {
  return Math.max(0, Math.round((now.getTime() - new Date(beat.lastBeatAt).getTime()) / 1000));
}

/**
 * Fields that may be published. A heartbeat is written by the worker and read
 * by an administrator, so it is parsed into a known shape rather than trusted:
 * anything else in the stored value is dropped.
 */
export function parseHeartbeat(raw: unknown): WorkerHeartbeat | null {
  if (typeof raw !== 'string') return null;
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const text = (key: string): string | null => (typeof value[key] === 'string' && (value[key] as string).length <= 200 ? (value[key] as string) : null);
  const instanceId = text('instanceId');
  const lastBeatAt = text('lastBeatAt');
  if (!instanceId || !lastBeatAt) return null;
  return {
    instanceId,
    version: text('version') ?? 'unknown',
    startedAt: text('startedAt') ?? lastBeatAt,
    lastBeatAt,
    queues: Array.isArray(value.queues) ? value.queues.filter((queue): queue is string => typeof queue === 'string').slice(0, 10) : [],
    processed: typeof value.processed === 'number' ? value.processed : 0,
    failed: typeof value.failed === 'number' ? value.failed : 0,
  };
}
