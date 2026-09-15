import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseConnection, type DatabaseCheckResult, type DatabaseClient } from '@adelaide-sphere/database';
import type { EnvironmentVariables } from '../config/env.validation.js';

/**
 * Owns the single managed database connection for this process. Nothing
 * connects at construction; the first query or readiness check does. Domain
 * modules obtain the Prisma client through `client()` and never import the
 * generated client themselves. `onModuleDestroy` closes the connection so
 * `app.close()` / SIGTERM release pooled connections exactly once.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly connection: DatabaseConnection;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.connection = new DatabaseConnection({
      url: config.get('DATABASE_URL', { infer: true }),
      allowPublicKeyRetrieval: config.get('DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL', { infer: true }),
      connectionLimit: config.get('DATABASE_CONNECTION_LIMIT', { infer: true }),
      // A refused connection surfaces after roughly twice the acquire timeout
      // (measured ~1.6 s at 800 ms), inside the verification/ping budgets below.
      connectTimeoutMs: 1_000,
      acquireTimeoutMs: 800,
      connectVerifyTimeoutMs: 3_000,
      pingTimeoutMs: 2_500,
      failuresBeforeReplace: 2,
      backoff: { initialMs: 1_000, maxMs: 15_000 },
      onEvent: (event) => {
        // Events carry reasons/codes only, never connection details.
        if (event.type === 'connected') this.logger.log(`database connected (attempt ${event.attempt})`);
        else if (event.type === 'closed') this.logger.log('database connection closed');
        else this.logger.warn(`database ${event.type}: ${JSON.stringify(event)}`);
      },
    });
  }

  /** Resolves the Prisma client, connecting on demand. Rejects with DatabaseUnavailableError. */
  client(): Promise<DatabaseClient> {
    return this.connection.getClient();
  }

  /** Bounded connectivity check for readiness. Never throws. */
  ping(): Promise<DatabaseCheckResult> {
    return this.connection.check();
  }

  get state() {
    return this.connection.state;
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection.close();
  }
}
