/**
 * How the connection is protected in transit.
 *
 * - `disabled` — no TLS. Loopback development only: the MySQL 8 handshake would
 *   otherwise expose the account password to anyone on the path (this is the
 *   precondition for the mariadb/mysql2 auth-downgrade advisories).
 * - `required` — encrypted, certificate **not** verified. Better than nothing,
 *   still defeated by an active attacker, so production refuses it.
 * - `verify-ca` — encrypted and the server certificate is verified.
 * - `verify-identity` — as above; the driver also matches the host name.
 */
export type MysqlSslMode = 'disabled' | 'required' | 'verify-ca' | 'verify-identity';

export const MYSQL_SSL_MODES: MysqlSslMode[] = ['disabled', 'required', 'verify-ca', 'verify-identity'];

/** Modes that verify the server's certificate; anything else is unauthenticated transport. */
export const VERIFIED_SSL_MODES: MysqlSslMode[] = ['verify-ca', 'verify-identity'];

/** Connection settings derived from a mysql:// URL. Never log this object. */
export interface MysqlConnectionSettings {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /** From `?sslmode=`; `disabled` when absent, so a URL cannot silently downgrade. */
  sslMode: MysqlSslMode;
  /** From `?sslca=`; a PEM path for a private certificate authority. */
  sslCaPath: string | null;
}

/**
 * Parses `mysql://user:password@host:port/database` (Prisma's MySQL URL form).
 * User, password and database are percent-decoded, so credentials containing
 * reserved characters must be URL-encoded in the environment. Errors never
 * include the URL or any of its parts.
 */
export function parseMysqlUrl(url: string): MysqlConnectionSettings {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL');
  }
  if (parsed.protocol !== 'mysql:') {
    throw new Error('DATABASE_URL must use the mysql:// scheme');
  }
  if (!parsed.hostname) {
    throw new Error('DATABASE_URL must include a host');
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!database || database.includes('/')) {
    throw new Error('DATABASE_URL must end with a single database name');
  }
  const port = parsed.port ? Number(parsed.port) : 3306;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DATABASE_URL port must be an integer between 1 and 65535');
  }
  const sslModeParam = parsed.searchParams.get('sslmode');
  if (sslModeParam !== null && !MYSQL_SSL_MODES.includes(sslModeParam as MysqlSslMode)) {
    throw new Error(`DATABASE_URL sslmode must be one of ${MYSQL_SSL_MODES.join(', ')}`);
  }
  const sslCaPath = parsed.searchParams.get('sslca');
  if (sslCaPath !== null && sslCaPath.trim() === '') {
    throw new Error('DATABASE_URL sslca must be a path to a PEM certificate authority file');
  }

  return {
    host: parsed.hostname,
    port,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
    sslMode: (sslModeParam as MysqlSslMode | null) ?? 'disabled',
    sslCaPath: sslCaPath === null ? null : decodeURIComponent(sslCaPath),
  };
}

/** True when this URL verifies the server it connects to (SRS SEC 004, DAT 002). */
export function hasVerifiedTls(url: string): boolean {
  return VERIFIED_SSL_MODES.includes(parseMysqlUrl(url).sslMode);
}
