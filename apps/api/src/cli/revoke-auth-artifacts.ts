/**
 * Retires authentication artifacts left by tests or a manual runtime check
 * (unused password reset / set-up links, open sessions) and proves none remain.
 *
 *   pnpm --filter api auth:revoke-test-artifacts          # revoke, then report
 *   pnpm --filter api auth:artifacts:check                # report only; exit 1 if any remain
 *
 * Refuses production and any database not named *_dev, *_test or *_e2e. Prints
 * counts only — never a token, a session id or an email address.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service.js';
import { assertRevocableTarget, countAuthArtifacts, revokeAuthArtifacts } from '../auth/auth-artifacts.js';

async function main(): Promise<void> {
  const checkOnly = process.argv.includes('--check');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'], abortOnError: false });
  try {
    const config = app.get(ConfigService);
    assertRevocableTarget(config.get<string>('NODE_ENV'), config.get<string>('DATABASE_URL') ?? '');
    const db = await app.get(DatabaseService).client();
    if (!checkOnly) {
      const result = await revokeAuthArtifacts(db);
      console.log(`[auth-artifacts] revoked ${result.tokensRevoked} unused token(s) and ${result.sessionsRevoked} live session(s)`);
    }
    const remaining = await countAuthArtifacts(db);
    console.log(`[auth-artifacts] remaining: ${remaining.activeTokens} active token(s), ${remaining.liveSessions} live session(s)`);
    if (remaining.activeTokens > 0 || remaining.liveSessions > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(`[auth-artifacts] ${(error as Error).message}`);
  process.exit(1);
});
