import { readFileSync } from 'node:fs';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client.js';
import { parseMysqlUrl, type MysqlConnectionSettings } from './url.js';

/**
 * Translates the URL's `sslmode` into the driver's `ssl` option.
 *
 * The mariadb connector treats an `ssl` object as verifying by default
 * (`rejectUnauthorized !== false`), so `verify-ca` and `verify-identity` both
 * check the certificate — against the supplied authority when `sslca` names
 * one, otherwise against the system store. `required` explicitly opts out of
 * verification and is refused in production by the API's configuration check.
 */
export function sslOptionFor(settings: Pick<MysqlConnectionSettings, 'sslMode' | 'sslCaPath'>): boolean | { rejectUnauthorized: boolean; ca?: string } {
  switch (settings.sslMode) {
    case 'disabled':
      return false;
    case 'required':
      return { rejectUnauthorized: false };
    default: {
      const ca = settings.sslCaPath ? readFileSync(settings.sslCaPath, 'utf8') : undefined;
      return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
    }
  }
}

export type DatabaseClient = PrismaClient;

export interface CreateDatabaseClientOptions {
  /** mysql://user:password@host:port/database */
  url: string;
  /** Max pooled connections (driver default 10). Keep API + worker budgets in mind (SRS OPS 003). */
  connectionLimit?: number;
  /** Milliseconds to wait for a TCP connection before failing. */
  connectTimeoutMs?: number;
  /** Milliseconds to wait for a pooled connection to become available. */
  acquireTimeoutMs?: number;
  /**
   * MySQL 8 `caching_sha2_password` needs an RSA key exchange on non-TLS
   * connections until the server has cached the account (its cache is empty
   * after every server restart). The driver refuses to fetch the server's
   * public key over an unencrypted connection unless this is true. Enable it
   * for local development over loopback; in production use TLS instead, where
   * the exchange is protected and this flag is unnecessary.
   */
  allowPublicKeyRetrieval?: boolean;
}

/**
 * Creates a Prisma client backed by the mariadb driver adapter (required in
 * Prisma 7). Nothing connects here: the pool opens connections lazily on the
 * first query. Prefer `DatabaseConnection` for a managed lifecycle; use this
 * directly only for short-lived scripts. Callers must `$disconnect()`.
 */
export function createDatabaseClient(options: CreateDatabaseClientOptions): DatabaseClient {
  const settings = parseMysqlUrl(options.url);
  const adapter = new PrismaMariaDb({
    host: settings.host,
    port: settings.port,
    user: settings.user,
    password: settings.password,
    database: settings.database,
    connectionLimit: options.connectionLimit ?? 10,
    connectTimeout: options.connectTimeoutMs ?? 5_000,
    acquireTimeout: options.acquireTimeoutMs ?? 5_000,
    allowPublicKeyRetrieval: options.allowPublicKeyRetrieval ?? false,
    // TLS comes from the URL (`?sslmode=`), so one setting governs the API, the
    // worker, the CLI and Prisma Migrate alike.
    ssl: sslOptionFor(settings),
    // Match the server configuration (utf8mb4 / utf8mb4_0900_ai_ci).
    charset: 'utf8mb4',
    // Store and read DATETIME as UTC wall-clock; SRS DAT 001 keeps timestamps in UTC.
    timezone: 'Z',
  });
  return new PrismaClient({ adapter });
}
