import { createDatabaseClient, type CreateDatabaseClientOptions, type DatabaseClient } from './client.js';

export type DatabaseConnectionState = 'idle' | 'connecting' | 'ready' | 'closed';

export type DatabaseCheckResult =
  | { ok: true; latencyMs: number }
  | { ok: false; reason: 'error' | 'timeout' | 'backoff' | 'closed' };

/** Thrown by getClient(); the message is generic and never carries connection details. */
export class DatabaseUnavailableError extends Error {
  constructor(
    public readonly reason: 'error' | 'timeout' | 'backoff' | 'closed',
    cause?: unknown,
  ) {
    super(`database unavailable (${reason})`, cause === undefined ? undefined : { cause });
    this.name = 'DatabaseUnavailableError';
  }
}

/** The subset of the Prisma client the lifecycle needs; lets tests use fakes. */
export type MinimalClient = Pick<DatabaseClient, '$queryRaw' | '$disconnect'>;

export interface DatabaseConnectionOptions extends CreateDatabaseClientOptions {
  /** Upper bound for the verification query when (re)connecting. Default 3000 ms. */
  connectVerifyTimeoutMs?: number;
  /** Upper bound for check() pings. Default 2500 ms. */
  pingTimeoutMs?: number;
  /** Consecutive failed checks before the current client is discarded and replaced. Default 2. */
  failuresBeforeReplace?: number;
  /** Backoff between connection attempts: starts at `initialMs`, doubles, capped at `maxMs`. */
  backoff?: { initialMs: number; maxMs: number };
  /** Test hook: factory for the underlying client. Defaults to createDatabaseClient. */
  createClient?: (options: CreateDatabaseClientOptions) => MinimalClient;
  /** Test hook: clock. */
  now?: () => number;
  /** Optional sink for operational events (never receives credentials). */
  onEvent?: (event: DatabaseConnectionEvent) => void;
}

export type DatabaseConnectionEvent =
  | { type: 'connected'; attempt: number }
  | { type: 'connect-failed'; attempt: number; reason: 'error' | 'timeout'; code?: string; nextAttemptInMs: number }
  | { type: 'check-failed'; reason: 'error' | 'timeout'; code?: string; consecutiveFailures: number }
  | { type: 'replaced'; consecutiveFailures: number }
  | { type: 'closed' };

/**
 * One managed database resource per process (API or worker).
 *
 * State machine: idle -> connecting -> ready -> (unusable) -> idle ... -> closed.
 *  - getClient() creates the client on demand and verifies it with a bounded
 *    query. Callers arriving while a connection attempt is in flight share
 *    that attempt (no stampede). A failed attempt is never cached: the next
 *    call after the backoff window tries again.
 *  - check() runs a bounded ping. After `failuresBeforeReplace` consecutive
 *    failures the current client is discarded (disconnected in the background)
 *    and a fresh one is created on the next demand, subject to backoff, so a
 *    stuck pool cannot wedge the process while an outage still fails fast.
 *  - close() is idempotent, waits for an in-flight attempt, and disconnects
 *    the current and any superseded clients exactly once.
 */
export class DatabaseConnection {
  #state: DatabaseConnectionState = 'idle';
  #client: MinimalClient | undefined;
  #connecting: Promise<MinimalClient> | undefined;
  #attempt = 0;
  #nextAttemptAt = 0;
  #consecutiveFailures = 0;
  #superseded: Promise<void>[] = [];
  readonly #opts: Required<Pick<DatabaseConnectionOptions, 'connectVerifyTimeoutMs' | 'pingTimeoutMs' | 'failuresBeforeReplace' | 'backoff' | 'createClient' | 'now'>> &
    DatabaseConnectionOptions;

  constructor(options: DatabaseConnectionOptions) {
    this.#opts = {
      connectVerifyTimeoutMs: 3_000,
      pingTimeoutMs: 2_500,
      failuresBeforeReplace: 2,
      backoff: { initialMs: 1_000, maxMs: 30_000 },
      createClient: createDatabaseClient,
      now: Date.now,
      ...options,
    };
  }

  get state(): DatabaseConnectionState {
    return this.#state;
  }

  /** Milliseconds until the next connection attempt is allowed (0 when allowed now). */
  get retryInMs(): number {
    return Math.max(0, this.#nextAttemptAt - this.#opts.now());
  }

  async getClient(): Promise<DatabaseClient> {
    if (this.#state === 'closed') throw new DatabaseUnavailableError('closed');
    if (this.#state === 'ready' && this.#client) return this.#client as DatabaseClient;
    if (this.#connecting) return (await this.#connecting) as DatabaseClient;
    if (this.#opts.now() < this.#nextAttemptAt) throw new DatabaseUnavailableError('backoff');
    this.#connecting = this.#connect().finally(() => {
      this.#connecting = undefined;
    });
    return (await this.#connecting) as DatabaseClient;
  }

  async check(): Promise<DatabaseCheckResult> {
    if (this.#state === 'closed') return { ok: false, reason: 'closed' };
    let client: MinimalClient;
    try {
      client = await this.getClient();
    } catch (error) {
      const reason = error instanceof DatabaseUnavailableError ? error.reason : 'error';
      return { ok: false, reason };
    }
    const started = this.#opts.now();
    const outcome = await raceWithTimeout(client.$queryRaw`SELECT 1`, this.#opts.pingTimeoutMs);
    if (outcome.status === 'ok') {
      this.#consecutiveFailures = 0;
      return { ok: true, latencyMs: this.#opts.now() - started };
    }
    // The client may be closed or replaced meanwhile; only count failures against the same one.
    if (this.#client === client && this.#state === 'ready') {
      this.#consecutiveFailures += 1;
      this.#opts.onEvent?.({
        type: 'check-failed',
        reason: outcome.status,
        code: outcome.code,
        consecutiveFailures: this.#consecutiveFailures,
      });
      if (this.#consecutiveFailures >= this.#opts.failuresBeforeReplace) this.#replace();
    }
    return { ok: false, reason: outcome.status };
  }

  async close(): Promise<void> {
    if (this.#state === 'closed') return;
    this.#state = 'closed';
    if (this.#connecting) await this.#connecting.catch(() => undefined);
    const current = this.#client;
    this.#client = undefined;
    const pending = [...this.#superseded];
    this.#superseded = [];
    if (current) pending.push(disconnectQuietly(current));
    await Promise.all(pending);
    this.#opts.onEvent?.({ type: 'closed' });
  }

  async #connect(): Promise<MinimalClient> {
    this.#state = 'connecting';
    this.#attempt += 1;
    const attempt = this.#attempt;
    const client = this.#opts.createClient(this.#opts);
    const outcome = await raceWithTimeout(client.$queryRaw`SELECT 1`, this.#opts.connectVerifyTimeoutMs);
    if ((this.#state as DatabaseConnectionState) === 'closed') {
      // close() raced with us: never hand out a client after shutdown.
      await disconnectQuietly(client);
      throw new DatabaseUnavailableError('closed');
    }
    if (outcome.status !== 'ok') {
      this.#superseded.push(disconnectQuietly(client));
      this.#state = 'idle';
      const delay = backoffMs(attempt, this.#opts.backoff);
      this.#nextAttemptAt = this.#opts.now() + delay;
      this.#opts.onEvent?.({ type: 'connect-failed', attempt, reason: outcome.status, code: outcome.code, nextAttemptInMs: delay });
      throw new DatabaseUnavailableError(outcome.status, outcome.error);
    }
    this.#client = client;
    this.#state = 'ready';
    this.#attempt = 0;
    this.#consecutiveFailures = 0;
    this.#nextAttemptAt = 0;
    this.#opts.onEvent?.({ type: 'connected', attempt });
    return client;
  }

  #replace(): void {
    const old = this.#client;
    const failures = this.#consecutiveFailures;
    this.#client = undefined;
    this.#consecutiveFailures = 0;
    this.#state = 'idle';
    // Treat the replacement like a failed attempt so a dead database still fails fast.
    this.#attempt += 1;
    this.#nextAttemptAt = this.#opts.now() + backoffMs(this.#attempt, this.#opts.backoff);
    if (old) this.#superseded.push(disconnectQuietly(old));
    this.#opts.onEvent?.({ type: 'replaced', consecutiveFailures: failures });
  }
}

function backoffMs(attempt: number, backoff: { initialMs: number; maxMs: number }): number {
  return Math.min(backoff.maxMs, backoff.initialMs * 2 ** Math.max(0, attempt - 1));
}

async function disconnectQuietly(client: MinimalClient): Promise<void> {
  try {
    await client.$disconnect();
  } catch {
    // Disconnect failures during replacement/shutdown are not actionable.
  }
}

type RaceOutcome = { status: 'ok'; code?: undefined; error?: undefined } | { status: 'timeout' | 'error'; code?: string; error?: unknown };

async function raceWithTimeout(work: Promise<unknown>, timeoutMs: number): Promise<RaceOutcome> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<RaceOutcome>((resolve) => {
    timer = setTimeout(() => resolve({ status: 'timeout' }), timeoutMs);
  });
  try {
    return await Promise.race([
      work.then(
        (): RaceOutcome => ({ status: 'ok' }),
        (error: unknown): RaceOutcome => ({
          status: 'error',
          code: typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : undefined,
          error,
        }),
      ),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
