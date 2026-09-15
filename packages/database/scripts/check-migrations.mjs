#!/usr/bin/env node
/**
 * Migration policy checks (SRS DAT 001/004/006, Phase 8 collation policy):
 *  - every CREATE TABLE declares utf8mb4 with utf8mb4_unicode_ci;
 *  - no other collation appears anywhere;
 *  - no destructive statements slip in unannotated (DROP TABLE / DROP DATABASE /
 *    TRUNCATE must carry a "-- reviewed:" comment on the preceding line).
 * Exits non-zero with a precise message; never touches the database.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'migrations');
const problems = [];
for (const entry of readdirSync(root)) {
  const dir = join(root, entry);
  if (!statSync(dir).isDirectory()) continue;
  const file = join(dir, 'migration.sql');
  const lines = readFileSync(file, 'utf8').split('\n');
  // Statement checks run on SQL with comments removed; the reviewed-comment
  // check below deliberately looks at the raw lines.
  const sql = lines.filter((line) => !/^\s*--/.test(line)).join('\n');
  for (const m of sql.matchAll(/COLLATE\s+([A-Za-z0-9_]+)/gi)) {
    if (m[1].toLowerCase() !== 'utf8mb4_unicode_ci') problems.push(`${entry}: collation ${m[1]} is not utf8mb4_unicode_ci`);
  }
  for (const m of sql.matchAll(/CHARACTER SET\s+([A-Za-z0-9_]+)/gi)) {
    if (m[1].toLowerCase() !== 'utf8mb4') problems.push(`${entry}: character set ${m[1]} is not utf8mb4`);
  }
  for (const m of sql.matchAll(/CREATE TABLE[^;]*;/gis)) {
    if (!/DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci/i.test(m[0])) {
      problems.push(`${entry}: a CREATE TABLE lacks "DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"`);
    }
  }
  lines.forEach((line, i) => {
    if (/^\s*(DROP\s+(TABLE|DATABASE)|TRUNCATE)\b/i.test(line) && !/--\s*reviewed:/i.test(lines[i - 1] ?? '')) {
      problems.push(`${entry}:${i + 1}: destructive statement without a preceding "-- reviewed: <reason>" comment`);
    }
  });
}
if (problems.length) {
  console.error('Migration policy violations:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log('Migration policy OK');
