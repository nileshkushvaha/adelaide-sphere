import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@adelaide-sphere/database';
import { DatabaseService } from '../../database/database.service.js';
import { escapeLike, normaliseQuery } from './search-rules.js';

export type SuggestionKind = 'category' | 'service' | 'business';

export interface Suggestion {
  kind: SuggestionKind;
  label: string;
  /** Category/service slug, or the business slug for a direct link. */
  slug: string;
  /** Extra context shown after the label (local area for businesses, parent category, matched synonym). */
  hint: string | null;
}

export const MIN_SUGGESTION_LENGTH = 2;
export const MAX_SUGGESTIONS = 8;

/**
 * Typed search suggestions (SRS HERO 005): grouped categories, services and
 * businesses from active/published records only, name-prefix ranked, at most
 * eight in total. Nothing private is searched or returned.
 */
@Injectable()
export class SuggestionsService {
  private readonly logger = new Logger(SuggestionsService.name);

  constructor(private readonly database: DatabaseService) {}

  async suggest(rawQuery: string): Promise<{ categories: Suggestion[]; services: Suggestion[]; businesses: Suggestion[] }> {
    const q = normaliseQuery(rawQuery);
    const empty = { categories: [], services: [], businesses: [] };
    if (q.length < MIN_SUGGESTION_LENGTH) return empty;
    const db = await this.database.client();
    const like = `%${escapeLike(q)}%`;
    const prefix = `${escapeLike(q)}%`;
    const rank = (column: Prisma.Sql) => Prisma.sql`CASE WHEN ${column} = ${q} THEN 0 WHEN ${column} LIKE ${prefix} THEN 1 ELSE 2 END`;

    const [categories, services, businesses] = await Promise.all([
      db.$queryRaw<{ name: string; slug: string; parentName: string | null }[]>(
        Prisma.sql`SELECT c.name, c.slug, p.name AS parentName FROM categories c LEFT JOIN categories p ON p.id = c.parentId
          WHERE c.active = 1 AND c.name LIKE ${like}
          ORDER BY ${rank(Prisma.sql`c.name`)} ASC, c.name ASC, c.id ASC LIMIT ${MAX_SUGGESTIONS}`,
      ),
      db.$queryRaw<{ name: string; slug: string; synonym: string | null }[]>(
        Prisma.sql`SELECT s.name, s.slug, MIN(CASE WHEN ss.term LIKE ${like} AND s.name NOT LIKE ${like} THEN ss.term END) AS synonym
          FROM services s LEFT JOIN service_synonyms ss ON ss.serviceId = s.id
          WHERE s.active = 1 AND (s.name LIKE ${like} OR ss.term LIKE ${like})
          GROUP BY s.id, s.name, s.slug
          ORDER BY ${rank(Prisma.sql`s.name`)} ASC, s.name ASC, s.id ASC LIMIT ${MAX_SUGGESTIONS}`,
      ),
      db.$queryRaw<{ name: string; slug: string; areaName: string }[]>(
        Prisma.sql`SELECT b.name, b.slug, a.name AS areaName FROM businesses b JOIN local_areas a ON a.id = b.localAreaId
          WHERE b.status = 'published' AND b.name LIKE ${like}
          ORDER BY ${rank(Prisma.sql`b.name`)} ASC, b.name ASC, b.id ASC LIMIT ${MAX_SUGGESTIONS}`,
      ),
    ]);

    // Cap the total at eight while keeping every group represented (SRS HERO 005).
    const groups: Record<'categories' | 'services' | 'businesses', Suggestion[]> = {
      categories: categories.map((c) => ({ kind: 'category', label: c.name, slug: c.slug, hint: c.parentName })),
      services: services.map((s) => ({ kind: 'service', label: s.name, slug: s.slug, hint: s.synonym })),
      businesses: businesses.map((b) => ({ kind: 'business', label: b.name, slug: b.slug, hint: b.areaName })),
    };
    const order: (keyof typeof groups)[] = ['businesses', 'categories', 'services'];
    const kept: Record<keyof typeof groups, Suggestion[]> = { categories: [], services: [], businesses: [] };
    let total = 0;
    for (let round = 0; total < MAX_SUGGESTIONS; round += 1) {
      let added = false;
      for (const key of order) {
        const next = groups[key][round];
        if (!next || total >= MAX_SUGGESTIONS) continue;
        kept[key].push(next);
        total += 1;
        added = true;
      }
      if (!added) break;
    }
    return kept;
  }
}
