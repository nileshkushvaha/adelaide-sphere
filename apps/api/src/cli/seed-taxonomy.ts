/** Explicit, idempotent baseline taxonomy seed (see taxonomy/seed-data.ts). */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { BASELINE_LOCAL_AREAS, STARTER_CATEGORIES, STARTER_SERVICES } from '../taxonomy/seed-data.js';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'], abortOnError: false });
  try {
    const db = await app.get(DatabaseService).client();
    let areas = 0;
    for (const [i, a] of BASELINE_LOCAL_AREAS.entries()) {
      const existing = await db.localArea.findUnique({ where: { slug: a.slug } });
      if (existing) continue;
      await db.localArea.create({ data: { name: a.name, slug: a.slug, sortOrder: i, eligibilitySource: a.note, eligibilityVerifiedAt: new Date() } });
      areas += 1;
    }
    let categories = 0;
    for (const [i, c] of STARTER_CATEGORIES.entries()) {
      let root = await db.category.findUnique({ where: { slug: c.slug } });
      if (!root) {
        root = await db.category.create({ data: { name: c.name, slug: c.slug, sortOrder: i } });
        categories += 1;
      }
      for (const [j, child] of (c.children ?? []).entries()) {
        if (await db.category.findUnique({ where: { slug: child.slug } })) continue;
        await db.category.create({ data: { name: child.name, slug: child.slug, parentId: root.id, sortOrder: j } });
        categories += 1;
      }
    }
    let services = 0;
    for (const s of STARTER_SERVICES) {
      if (await db.service.findUnique({ where: { slug: s.slug } })) continue;
      await db.service.create({ data: { name: s.name, slug: s.slug, synonyms: { create: s.synonyms.map((term) => ({ term })) } } });
      services += 1;
    }
    await app.get(AuditService).recordOrThrow({ action: 'taxonomy.seed', metadata: { areas, categories, services } });
    console.log(`[taxonomy:seed] created areas=${areas} categories=${categories} services=${services} (existing rows untouched)`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(`[taxonomy:seed] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
