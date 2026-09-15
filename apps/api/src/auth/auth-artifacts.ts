import type { DatabaseClient } from '@adelaide-sphere/database';

/**
 * Authentication artifacts a test or a manual runtime check can leave behind:
 * single-use reset/set-up links that were mailed but never consumed, and
 * sessions that were opened and never signed out. Both are credentials.
 * `revokeAuthArtifacts` retires every one of them; `countAuthArtifacts` proves
 * nothing usable remains. Neither is ever wired to an HTTP route.
 */
export interface AuthArtifactCounts {
  /** Unused reset or set-up tokens that have not expired. */
  activeTokens: number;
  /** Sessions that are neither revoked nor past their absolute expiry. */
  liveSessions: number;
}

export interface RevocationResult {
  tokensRevoked: number;
  sessionsRevoked: number;
}

export const ARTIFACT_REVOCATION_REASON = 'test_artifact_cleanup';

/**
 * Refuses production and any database whose name does not mark it as a
 * development, test or e2e target — the same rule the e2e provisioning uses.
 */
export function assertRevocableTarget(nodeEnv: string | undefined, databaseUrl: string): void {
  if (nodeEnv === 'production') throw new Error('Refusing to revoke authentication artifacts with NODE_ENV=production');
  const database = new URL(databaseUrl).pathname.replace(/^\//, '').split('?')[0] ?? '';
  if (!/(_dev|_test|_e2e)$/.test(database)) {
    throw new Error(`Refusing to revoke authentication artifacts in "${database}": the database name must end in _dev, _test or _e2e`);
  }
}

export async function countAuthArtifacts(db: DatabaseClient, now: Date = new Date()): Promise<AuthArtifactCounts> {
  const [activeTokens, liveSessions] = await Promise.all([
    db.passwordResetToken.count({ where: { usedAt: null, expiresAt: { gt: now } } }),
    db.adminSession.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
  ]);
  return { activeTokens, liveSessions };
}

/**
 * Marks every unused token as used (the same field the reset flow sets, so the
 * flow refuses it with the ordinary "invalid or expired" answer) and revokes
 * every live session with a recorded reason. Token values are never read.
 */
export async function revokeAuthArtifacts(db: DatabaseClient, now: Date = new Date()): Promise<RevocationResult> {
  const [tokens, sessions] = await db.$transaction([
    db.passwordResetToken.updateMany({ where: { usedAt: null }, data: { usedAt: now } }),
    db.adminSession.updateMany({ where: { revokedAt: null }, data: { revokedAt: now, revokedReason: ARTIFACT_REVOCATION_REASON } }),
  ]);
  return { tokensRevoked: tokens.count, sessionsRevoked: sessions.count };
}
