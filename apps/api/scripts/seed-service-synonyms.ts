/**
 * Gives every service its search synonyms.
 *
 * Synonyms are what make search find a business when the customer's word is
 * not ours — "sparkie" for Electrical, "aircon" for a split system, "bond
 * clean" for an end-of-lease clean. They are matched with a LIKE against the
 * stored term, so what counts is a word the service name does not already
 * contain.
 *
 * Existing synonyms are kept: an editor's own word is better than a derived
 * one, and this only ever adds.
 *
 *   pnpm --filter api exec tsx --env-file=.env scripts/seed-service-synonyms.ts
 *   (--dry-run prints what it would add and writes nothing)
 */
import { databaseName, db } from './seed-commons.js';
import { synonymsFor } from './service-synonyms.js';

/** The API's own ceiling, so the seeder cannot write a set the editor cannot save. */
const MAX_SYNONYMS = 20;
const WANTED = 5;

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`${dryRun ? 'Checking' : 'Writing'} service synonyms in ${databaseName}\n`);

  const services = await db.service.findMany({ include: { synonyms: true }, orderBy: { name: 'asc' } });
  let changed = 0;
  const thin: string[] = [];

  for (const service of services) {
    const held = new Set(service.synonyms.map((row) => row.term.toLowerCase()));
    const wanted = synonymsFor(service.name).filter((term) => !held.has(term));
    const room = MAX_SYNONYMS - held.size;
    const adding = wanted.slice(0, Math.max(0, room));
    const total = held.size + adding.length;
    if (total < WANTED) thin.push(`${service.name} (${total})`);
    if (adding.length === 0) continue;

    if (!dryRun) {
      await db.serviceSynonym.createMany({ data: adding.map((term) => ({ serviceId: service.id, term })), skipDuplicates: true });
      await db.service.update({ where: { id: service.id }, data: { version: { increment: 1 } } });
    }
    changed += 1;
    console.log(`  ${service.name}: +${adding.length} → ${total}`);
  }

  console.log(`\n${changed} service(s) ${dryRun ? 'would gain' : 'gained'} synonyms.`);
  if (thin.length > 0) {
    // Reported rather than padded: a synonym that is not a word anyone types
    // makes search worse, and a list of them is the thing to fix by hand.
    console.log(`\n${thin.length} service(s) still under ${WANTED}; they need a written synonym each:\n  ${thin.join('\n  ')}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error('\n' + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
