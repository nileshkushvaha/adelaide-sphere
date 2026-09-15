/**
 * Records the images already inside stored rich text (SRS MED 004, DAT 003).
 *
 * Until `content_media_references` existed, an image placed inside an article,
 * a page, an author bio, an FAQ answer or a blog landing text was referenced
 * only by its URL. The media library therefore allowed deleting it and the
 * worker's retention task treated it as unused. This command reads every stored
 * body and records the images it shows, so both stop.
 *
 * Idempotent and additive: it only replaces the reference rows for each record
 * with what the stored HTML actually contains. It also reports images a body
 * points at that no longer exist — those were lost before this fix, and the
 * report is the list of pictures to restore from backup or replace.
 *
 *   pnpm --filter api media:backfill-content            # write
 *   pnpm --filter api media:backfill-content --dry-run  # report only
 */
import { NestFactory } from '@nestjs/core';
import { extractMediaIds, type ContentMediaResource } from '@adelaide-sphere/domain';
import { AppModule } from '../app.module.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { syncContentMedia } from '../media/content-media.js';

type Row = { id: string; label: string; html: (string | null)[] };

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'], abortOnError: false });
  try {
    const db = await app.get(DatabaseService).client();
    const sources: [ContentMediaResource, () => Promise<Row[]>][] = [
      ['post', async () => (await db.post.findMany({ select: { id: true, slug: true, sanitizedBody: true } })).map((r) => ({ id: r.id, label: `article /blog/${r.slug}`, html: [r.sanitizedBody] }))],
      ['static_page', async () => (await db.staticPage.findMany({ select: { id: true, slug: true, sanitizedBody: true } })).map((r) => ({ id: r.id, label: `page /${r.slug}`, html: [r.sanitizedBody] }))],
      ['author', async () => (await db.author.findMany({ select: { id: true, slug: true, bio: true } })).map((r) => ({ id: r.id, label: `author ${r.slug}`, html: [r.bio] }))],
      ['faq', async () => (await db.faq.findMany({ select: { id: true, question: true, answerHtml: true } })).map((r) => ({ id: r.id, label: `FAQ "${r.question.slice(0, 60)}"`, html: [r.answerHtml] }))],
      ['blog_category', async () => (await db.blogCategory.findMany({ select: { id: true, slug: true, landingContent: true } })).map((r) => ({ id: r.id, label: `blog category ${r.slug}`, html: [r.landingContent] }))],
      ['blog_tag', async () => (await db.blogTag.findMany({ select: { id: true, slug: true, landingContent: true } })).map((r) => ({ id: r.id, label: `blog tag ${r.slug}`, html: [r.landingContent] }))],
    ];

    let records = 0;
    let references = 0;
    const lost: string[] = [];
    for (const [resourceType, load] of sources) {
      for (const row of await load()) {
        const ids = extractMediaIds(...row.html);
        if (ids.length === 0 && dryRun) continue;
        if (dryRun) {
          const existing = new Set((await db.mediaAsset.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((asset) => asset.id));
          references += ids.filter((id) => existing.has(id)).length;
          for (const id of ids.filter((candidate) => !existing.has(candidate))) lost.push(`${row.label}: image ${id}`);
          records += 1;
          continue;
        }
        const result = await db.$transaction((tx) => syncContentMedia(tx, resourceType, row.id, ...row.html));
        if (ids.length > 0) records += 1;
        references += result.referenced.length;
        for (const id of result.missing) lost.push(`${row.label}: image ${id}`);
      }
    }

    console.log(`[media:backfill-content] ${dryRun ? 'would record' : 'recorded'} ${references} image reference(s) across ${records} record(s) with images`);
    if (lost.length > 0) {
      console.warn(`[media:backfill-content] ${lost.length} image(s) referenced by stored content no longer exist (lost before this fix):`);
      for (const line of lost) console.warn(`  - ${line}`);
    } else {
      console.log('[media:backfill-content] no stored content points at a missing image');
    }
    if (!dryRun) {
      await app.get(AuditService).recordOrThrow({ action: 'media.content_references.backfill', targetType: 'media_asset', targetId: 'content', metadata: { references, records, lost: lost.length, source: 'media:backfill-content' } });
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(`[media:backfill-content] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
