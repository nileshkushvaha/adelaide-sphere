import { DatabaseConnection, DatabaseUnavailableError, type MinimalClient } from './connection.js';

/** Deterministic fake client whose query behaviour is scripted per instance. */
class FakeClient implements MinimalClient {
  static created: FakeClient[] = [];
  queries = 0;
  disconnects = 0;
  constructor(public behaviour: () => Promise<unknown>) {
    FakeClient.created.push(this);
  }
  $queryRaw = ((..._args: unknown[]) => {
    this.queries += 1;
    return this.behaviour();
  }) as unknown as MinimalClient['$queryRaw'];
  $disconnect = async () => {
    this.disconnects += 1;
  };
}

const ok = () => Promise.resolve([{ '1': 1 }]);
const refused = () => Promise.reject(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
const hang = () => new Promise<never>(() => undefined);

function makeConnection(script: Array<() => Promise<unknown>>, extra: Partial<ConstructorParameters<typeof DatabaseConnection>[0]> = {}) {
  let clock = 1_000_000;
  const now = () => clock;
  const tick = (ms: number) => {
    clock += ms;
  };
  let i = 0;
  const conn = new DatabaseConnection({
    url: 'mysql://u:p@127.0.0.1:1/test_db',
    createClient: () => new FakeClient(script[Math.min(i++, script.length - 1)]),
    now,
    connectVerifyTimeoutMs: 50,
    pingTimeoutMs: 50,
    backoff: { initialMs: 1_000, maxMs: 8_000 },
    ...extra,
  });
  return { conn, tick };
}

beforeEach(() => {
  FakeClient.created = [];
});

describe('DatabaseConnection', () => {
  it('connects on first demand and reuses the same client without reconnecting per request', async () => {
    const { conn } = makeConnection([ok]);
    expect(conn.state).toBe('idle');
    const a = await conn.getClient();
    const b = await conn.getClient();
    expect(a).toBe(b);
    expect(conn.state).toBe('ready');
    expect(FakeClient.created).toHaveLength(1);
    expect(await conn.check()).toMatchObject({ ok: true });
    expect(await conn.check()).toMatchObject({ ok: true });
    expect(FakeClient.created).toHaveLength(1);
  });

  it('does not cache a failed initial connection and recovers on a later attempt after backoff', async () => {
    const { conn, tick } = makeConnection([refused, ok]);
    await expect(conn.getClient()).rejects.toBeInstanceOf(DatabaseUnavailableError);
    expect(conn.state).toBe('idle');
    expect(FakeClient.created[0]!.disconnects).toBe(1); // failed client closed
    // Inside the backoff window: fails fast without a new attempt.
    await expect(conn.getClient()).rejects.toMatchObject({ reason: 'backoff' });
    expect(FakeClient.created).toHaveLength(1);
    tick(1_000);
    const client = await conn.getClient();
    expect(client).toBe(FakeClient.created[1]);
    expect(conn.state).toBe('ready');
  });

  it('reports timeout when the verification query hangs, then applies backoff', async () => {
    const { conn } = makeConnection([hang]);
    await expect(conn.getClient()).rejects.toMatchObject({ reason: 'timeout' });
    expect(conn.retryInMs).toBe(1_000);
  });

  it('shares one in-flight attempt between concurrent callers', async () => {
    let resolveQuery!: (v: unknown) => void;
    let gated = false;
    // First query (connection verification) waits on the gate; later pings succeed.
    const gate = () => (gated ? ok() : ((gated = true), new Promise((r) => (resolveQuery = r))));
    const { conn } = makeConnection([gate]);
    const p1 = conn.getClient();
    const p2 = conn.getClient();
    const p3 = conn.check();
    expect(FakeClient.created).toHaveLength(1);
    resolveQuery([{ '1': 1 }]);
    const [c1, c2, r3] = await Promise.all([p1, p2, p3]);
    expect(c1).toBe(c2);
    expect(r3).toMatchObject({ ok: true });
    expect(FakeClient.created).toHaveLength(1);
  });

  it('replaces a client after consecutive check failures, closing the old one, and reconnects later', async () => {
    let healthy = true;
    const flaky = () => (healthy ? ok() : refused());
    const { conn, tick } = makeConnection([flaky, ok], { failuresBeforeReplace: 2 });
    await conn.getClient();
    healthy = false;
    expect(await conn.check()).toEqual({ ok: false, reason: 'error' });
    expect(conn.state).toBe('ready'); // one failure is tolerated
    expect(await conn.check()).toEqual({ ok: false, reason: 'error' });
    expect(conn.state).toBe('idle'); // second failure -> replaced
    await Promise.resolve();
    expect(FakeClient.created[0]!.disconnects).toBe(1);
    // During backoff the check fails fast without creating clients.
    expect(await conn.check()).toEqual({ ok: false, reason: 'backoff' });
    expect(FakeClient.created).toHaveLength(1);
    tick(1_000);
    expect(await conn.check()).toMatchObject({ ok: true });
    expect(FakeClient.created).toHaveLength(2);
    expect(conn.state).toBe('ready');
  });

  it('concurrent checks during an outage trigger at most one replacement attempt', async () => {
    const { conn, tick } = makeConnection([refused, refused, ok], { failuresBeforeReplace: 1 });
    await expect(conn.getClient()).rejects.toBeDefined();
    tick(1_000);
    const results = await Promise.all([conn.check(), conn.check(), conn.check(), conn.check()]);
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(FakeClient.created).toHaveLength(2); // exactly one new attempt for the burst
    tick(2_000); // backoff doubled after the second failure
    expect(await conn.check()).toMatchObject({ ok: true });
    expect(FakeClient.created).toHaveLength(3);
  });

  it('a failed replacement can be attempted again later with growing, capped backoff', async () => {
    const { conn, tick } = makeConnection([refused, refused, refused, refused, refused, ok]);
    for (const expected of [1_000, 2_000, 4_000, 8_000, 8_000]) {
      await expect(conn.getClient()).rejects.toBeDefined();
      expect(conn.retryInMs).toBe(expected);
      tick(expected);
    }
    await expect(conn.getClient()).resolves.toBeDefined();
    expect(conn.retryInMs).toBe(0);
  });

  it('close() disconnects once, tolerates partial initialisation and rejects later use', async () => {
    const { conn } = makeConnection([ok]);
    await conn.close(); // nothing was ever created
    await conn.close(); // idempotent
    expect(conn.state).toBe('closed');
    await expect(conn.getClient()).rejects.toMatchObject({ reason: 'closed' });
    expect(await conn.check()).toEqual({ ok: false, reason: 'closed' });
    expect(FakeClient.created).toHaveLength(0);

    const second = makeConnection([ok]).conn;
    await second.getClient();
    await second.close();
    await second.close();
    expect(FakeClient.created[0]!.disconnects).toBe(1);
  });

  it('close() during an in-flight attempt waits for it and never hands out the client', async () => {
    let resolveQuery!: (v: unknown) => void;
    const gate = () => new Promise((r) => (resolveQuery = r));
    const { conn } = makeConnection([gate]);
    const pending = conn.getClient();
    const closing = conn.close();
    resolveQuery([{ '1': 1 }]);
    await expect(pending).rejects.toMatchObject({ reason: 'closed' });
    await closing;
    expect(FakeClient.created[0]!.disconnects).toBe(1);
  });

  it('emits operational events without any connection details', async () => {
    const events: unknown[] = [];
    const { conn, tick } = makeConnection([refused, ok], { onEvent: (e) => events.push(e) });
    await expect(conn.getClient()).rejects.toBeDefined();
    tick(1_000);
    await conn.getClient();
    expect(events).toEqual([
      { type: 'connect-failed', attempt: 1, reason: 'error', code: 'ECONNREFUSED', nextAttemptInMs: 1_000 },
      { type: 'connected', attempt: 2 },
    ]);
    expect(JSON.stringify(events)).not.toContain('mysql://');
  });
});
