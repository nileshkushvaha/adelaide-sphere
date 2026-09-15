import { createDatabaseClient } from './client.js';

describe('createDatabaseClient', () => {
  it('creates a client without connecting and can be disconnected cleanly', async () => {
    // Port 1 on loopback: nothing listens there, so any eager connection would fail.
    const client = createDatabaseClient({ url: 'mysql://u:p@127.0.0.1:1/never_connected' });
    expect(typeof client.$queryRaw).toBe('function');
    await expect(client.$disconnect()).resolves.toBeUndefined();
  });

  it('fails fast with a safe message for an invalid URL', () => {
    expect(() => createDatabaseClient({ url: 'mysql://u:p@h' })).toThrow('database name');
  });

  it('surfaces a connection failure as a rejection, not a crash, and still disconnects', async () => {
    const client = createDatabaseClient({
      url: 'mysql://u:p@127.0.0.1:1/never_connected',
      connectTimeoutMs: 500,
      acquireTimeoutMs: 500,
    });
    await expect(client.$queryRaw`SELECT 1`).rejects.toBeInstanceOf(Error);
    await expect(client.$disconnect()).resolves.toBeUndefined();
  });
});
