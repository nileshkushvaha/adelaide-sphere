/**
 * Idempotent baseline content for the pages the product ships with (SRS
 * CFG 002): the privacy, terms and review-guidelines policies.
 *
 * Safe to run against any environment, including production, because it only
 * ever *adds*:
 *
 *  * a page that already exists is left exactly as it is — status, wording and
 *    version — so an editor's changes, and an editor's decision to unpublish,
 *    survive every re-run;
 *  * what it does write is held to the same publication gate as an editor's own
 *    save, so it cannot put a page live that the admin would have refused;
 *  * the copy is the shipped wording in `page-seed-content.ts`, which describes
 *    what this system actually does. The privacy and terms pages state
 *    obligations and should be read by a lawyer before launch
 *    (`docs/content/policy-pages.md`);
 *  * every page it creates is recorded in the audit log and invalidated through
 *    the same cache pipeline an editor's publish uses.
 *
 *   pnpm --filter api pages:seed
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { CACHE_TAGS } from '@adelaide-sphere/domain';
import { AuditService } from '../audit/audit.service.js';
import { CacheService } from '../cache/cache.service.js';
import { DatabaseService } from '../database/database.service.js';
import { renderSanitisedBody, toPlainText } from '../blog/sanitise.js';
import { PAGE_SEEDS } from '../settings/page-seed-content.js';
import { staticPageBlockers } from '../settings/static-pages.js';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'], abortOnError: false });
  try {
    const db = await app.get(DatabaseService).client();
    const cache = app.get(CacheService);
    const audit = app.get(AuditService);
    let created = 0;

    for (const page of PAGE_SEEDS) {
      const existing = await db.staticPage.findUnique({ where: { slug: page.slug }, select: { status: true, version: true } });
      if (existing) {
        console.log(`[pages:seed] ${page.slug}: already exists (status=${existing.status}, version=${existing.version}); nothing written`);
        continue;
      }

      const sanitizedBody = renderSanitisedBody(page.body, page.format);
      const blockers = staticPageBlockers({ title: page.title, plainBody: toPlainText(sanitizedBody) });
      if (blockers.length > 0) {
        // The seed is held to the same publication gate as an editor.
        console.error(`[pages:seed] ${page.slug}: refusing to seed — ${blockers.join('; ')}`);
        process.exitCode = 1;
        continue;
      }

      const row = await db.$transaction(async (tx) => {
        const inserted = await tx.staticPage.create({
          data: {
            slug: page.slug,
            title: page.title,
            bodySource: page.body,
            bodyFormat: page.format,
            sanitizedBody,
            seoTitle: page.seoTitle ?? null,
            seoDescription: page.seoDescription ?? null,
            layout: page.layout,
            status: 'published',
            publishedAt: new Date(),
          },
        });
        // Publishing through the same invalidation pipeline an editor uses, so
        // the web tier drops its cached navigation instead of hiding the new
        // page for the rest of its revalidation window (SRS CACHE 001).
        await cache.recordInvalidation(tx, { resourceType: 'static_page', resourceId: inserted.id, tags: [CACHE_TAGS.pages, CACHE_TAGS.page(page.slug)] });
        return inserted;
      });
      await cache.bumpNamespace();
      await audit.recordOrThrow({ action: 'settings.page.publish', targetType: 'static_page', targetId: row.id, metadata: { slug: page.slug, source: 'pages:seed' } });
      created += 1;
      console.log(`[pages:seed] ${page.slug}: created and published with the shipped baseline copy`);
    }

    console.log(`[pages:seed] ${created} page(s) created, ${PAGE_SEEDS.length - created} left as they were`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(`[pages:seed] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
