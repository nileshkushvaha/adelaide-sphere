/**
 * Fills `posts.searchText` for articles saved before blog search existed
 * (SRS 1.10 BLOG 005).
 *
 * The API writes the plain text of an article's body whenever the body is
 * saved; articles stored earlier have none, and search finds them only by title
 * and summary until this runs. It uses the same `toPlainText` as a save, never
 * changes the body, the version or anything a reader sees, and writes only rows
 * whose text differs, so running it twice changes nothing.
 *
 *   pnpm --filter api blog:backfill-search-text            # write
 *   pnpm --filter api blog:backfill-search-text --dry-run  # report only
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { AuditService } from '../audit/audit.service.js';
import { toPlainText } from '../blog/sanitise.js';
import { DatabaseService } from '../database/database.service.js';

const BATCH = 100;

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'], abortOnError: false });
  try {
    const db = await app.get(DatabaseService).client();
    let scanned = 0;
    let changed = 0;
    let cursor: string | undefined;
    for (;;) {
      const rows = await db.post.findMany({ select: { id: true, sanitizedBody: true, searchText: true }, orderBy: { id: 'asc' }, take: BATCH, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}) });
      if (rows.length === 0) break;
      for (const row of rows) {
        scanned += 1;
        const text = toPlainText(row.sanitizedBody);
        if (text === row.searchText) continue;
        changed += 1;
        // `updatedAt` is left alone: the article itself has not changed.
        if (!dryRun) await db.$executeRaw`UPDATE posts SET searchText = ${text} WHERE id = ${row.id}`;
      }
      cursor = rows.at(-1)!.id;
    }
    console.log(`[blog:backfill-search-text] ${dryRun ? 'would update' : 'updated'} ${changed} of ${scanned} article(s)`);
    if (!dryRun && changed > 0) {
      await app.get(AuditService).recordOrThrow({ action: 'blog.search_text.backfill', targetType: 'post', targetId: 'all', metadata: { scanned, changed, source: 'blog:backfill-search-text' } });
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(`[blog:backfill-search-text] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
