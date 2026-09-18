import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { createDatabaseClient, type DatabaseClient } from '@adelaide-sphere/database';
import { createTestApp, type TestAppOptions } from '../create-test-app.js';
import { resolveTestDatabaseUrl } from './test-database-url.js';

/** Tables owned by the application (never `_prisma_migrations`). Extend as the schema grows. */
export const APPLICATION_TABLES = [
  // ai_automation_controls is deliberately kept: its one row is seeded by the
  // migration and the code reads it as deployment state, never test data.
  'ai_schedule_slots',
  'ai_image_jobs',
  'ai_budget_buckets',
  'ai_price_schedules',
  'ai_claim_sources',
  'ai_fact_claims',
  'ai_source_evidence',
  'ai_research_sources',
  'ai_approvals',
  'ai_operations',
  'ai_generation_runs',
  'ai_research_packets',
  'ai_content_items',
  'system_probes',
  'scheduled_task_runs',
  'scheduled_task_states',
  'featured_placements',
  'static_pages',
  'idempotency_records',
  'redirects',
  'comments',
  'content_revisions',
  'post_tags',
  'posts',
  'blog_tags',
  'blog_categories',
  'author_links',
  'authors',
  'provider_message_events',
  'outbox_events',
  'enquiries',
  'abuse_reports',
  'reviews',
  'business_media',
  'media_variants',
  'media_assets',
  'business_ratings',
  'business_links',
  'hours_exceptions',
  'opening_intervals',
  'business_services',
  'business_categories',
  'business_addresses',
  'businesses',
  'service_synonyms',
  'services',
  'categories',
  'local_areas',
  'settings',
  'faqs',
  'service_alerts',
  'testimonials',
  'partner_organisations',
  'content_media_references',
  'post_autosaves',
  'menu_items',
  'menu_locations',
  'menus',
  'email_delivery_events',
  'email_deliveries',
  'audit_logs',
  'admin_login_challenges',
  'admin_recovery_codes',
  'admin_password_history',
  'password_reset_tokens',
  'admin_sessions',
  'admin_roles',
  'admin_permissions',
  'role_permissions',
  'admin_users',
  'roles',
  'permissions',
] as const;

let client: DatabaseClient | undefined;

/** Direct database access for fixtures/assertions, separate from the app's own connection. */
export function testDatabase(): DatabaseClient {
  client ??= createDatabaseClient({ url: resolveTestDatabaseUrl(), connectionLimit: 2, allowPublicKeyRetrieval: true });
  return client;
}

/**
 * Empties application tables between tests (test database only, guarded by
 * name). Prisma's default interactive-transaction timeout is 5 s, which more
 * than fifty TRUNCATEs can exceed on a loaded machine; the transaction then
 * expires mid-loop and every following statement fails, taking the suite's
 * `beforeAll` with it. The budget is explicit and generous so a slow disk
 * delays the run instead of breaking it.
 */
export async function truncateApplicationTables(): Promise<void> {
  const db = testDatabase();
  // An interactive transaction pins one pooled connection, so the session-level
  // FOREIGN_KEY_CHECKS toggle applies to the TRUNCATE statements that follow.
  await db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
      try {
        for (const table of APPLICATION_TABLES) {
          await tx.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``);
        }
      } finally {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
      }
    },
    { timeout: 60_000, maxWait: 30_000 },
  );
}

export async function closeTestDatabase(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}

/**
 * Binds the app's HTTP server to one ephemeral loopback port for the lifetime
 * of the test file.
 *
 * Without this, supertest binds a **new** ephemeral port per request (it calls
 * `server.listen(0)` whenever `server.address()` is null, then closes it). Over
 * a full suite that is thousands of listen/close cycles, and a port still in
 * TIME_WAIT can be handed out again while the previous peer is still finishing:
 * the new client then reads bytes belonging to the previous connection. That is
 * the source of the two order-dependent failures seen on 2026-09-07 — a public
 * review POST answered `401` (a response to an earlier admin request) and
 * `Parse Error: Expected HTTP/, RTSP/ or ICE/` in the static-pages suite. One
 * stable port per file removes the churn entirely; `app.close()` releases it.
 */
export async function listenForTests(app: INestApplication): Promise<INestApplication> {
  const server = app.getHttpServer() as Server;
  if (server.address() === null) {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
  }
  return app;
}

/** The real application (same module and configureApp as main.ts) bound to the test database. */
export async function createIntegrationApp(options: TestAppOptions = {}): Promise<INestApplication> {
  return listenForTests(await createTestApp(options));
}
