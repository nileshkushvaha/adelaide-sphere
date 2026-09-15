import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface SiteMetrics {
  /** Published, publicly visible listings. */
  businesses: number | null;
  /** Active categories that actually hold a published listing. */
  categories: number | null;
  /** Active Adelaide local areas that actually hold a published listing. */
  areas: number | null;
  /** Published blog articles. */
  articles: number | null;
  /** When the counts were taken, so the page can say how current they are. */
  countedAt: string;
}

/**
 * Real counts for the public About page (SRS CFG 002, SCP 001).
 *
 * Every number is counted from published rows at request time — nothing is
 * configured, cached in content or written by hand — because a statistic on a
 * public page is a claim, and the only honest source for it is the data. A
 * count that cannot be taken is reported as `null` rather than 0: an empty
 * directory and an unavailable database mean different things, and "0
 * businesses" presented as an achievement is worse than saying nothing.
 */
@Injectable()
export class SiteMetricsService {
  private readonly logger = new Logger(SiteMetricsService.name);

  constructor(private readonly database: DatabaseService) {}

  async metrics(): Promise<SiteMetrics> {
    const countedAt = new Date().toISOString();
    try {
      const db = await this.database.client();
      const publishedBusiness = { status: 'published' as const };
      const [businesses, categories, areas, articles] = await Promise.all([
        db.business.count({ where: publishedBusiness }),
        // Categories a visitor can actually browse into, not every row an
        // administrator has created — counted through both relations, because a
        // listing's primary category is not a row in the join table.
        db.category.count({
          where: { active: true, OR: [{ primaryOf: { some: publishedBusiness } }, { businesses: { some: { business: publishedBusiness } } }] },
        }),
        db.localArea.count({ where: { active: true, businesses: { some: publishedBusiness } } }),
        db.post.count({ where: { status: 'published' } }),
      ]);
      return { businesses, categories, areas, articles, countedAt };
    } catch (error) {
      // A failed count must never take the page down with it; the About page
      // omits the snapshot instead.
      this.logger.warn(`site metrics unavailable (${(error as { code?: string })?.code ?? 'error'})`);
      return { businesses: null, categories: null, areas: null, articles: null, countedAt };
    }
  }
}
