import { CACHE_TAGS, htmlToPlainText, postPublicationBlockers } from '@adelaide-sphere/domain';
import type { DatabaseClient } from '../client.js';
import { aiPublicationDecision, syncAiItemWithPost } from './ai-publication.js';

export interface DueScheduledPost {
  id: string;
  slug: string;
  version: number;
  title: string;
  excerpt: string;
  sanitizedBody: string;
  firstPublishedAt: Date | null;
  author: { active: boolean };
  category: { active: boolean };
}

/** The columns `publishDueScheduledPost` needs, for the caller's due-article query. */
export const DUE_SCHEDULED_POST_SELECT = {
  id: true,
  slug: true,
  version: true,
  title: true,
  excerpt: true,
  sanitizedBody: true,
  firstPublishedAt: true,
  author: { select: { active: true } },
  category: { select: { active: true } },
} as const;

export type ScheduledPublicationOutcome = 'published' | 'returned' | 'skipped';

/**
 * Publishes one due scheduled article, or returns it to draft with the reason
 * (SRS BLOG 002). The worker's `content.publish-scheduled` task is the only
 * caller; it stays the scheduled entrypoint.
 *
 * One transaction per article, guarded by its version (another replica or an
 * editor's change wins and this does nothing). The publication requirements
 * and the AI eligibility policy — the same `aiPublicationDecision` the admin
 * publish command applies — are checked at the scheduled time, because a
 * byline, category or AI approval can change after scheduling. The status
 * change, its audit entry, the cache invalidation and the `post.published`
 * event (the same event the admin command writes) commit together.
 */
export async function publishDueScheduledPost(db: DatabaseClient, post: DueScheduledPost, now: Date): Promise<ScheduledPublicationOutcome> {
  const blockers = postPublicationBlockers({
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    plainBody: htmlToPlainText(post.sanitizedBody),
    authorActive: post.author.active,
    categoryActive: post.category.active,
  });
  return db.$transaction(async (tx) => {
    const ai = await aiPublicationDecision(tx, { postId: post.id, action: 'publish', path: 'scheduled' });
    const refusals = [...blockers, ...(ai.linked && !ai.eligible ? ai.reasons : [])];
    if (refusals.length > 0) {
      const updated = await tx.post.updateMany({
        where: { id: post.id, status: 'scheduled', version: post.version },
        data: { status: 'draft', scheduledAt: null, publishFailure: refusals.join(' ').slice(0, 500), version: { increment: 1 } },
      });
      if (updated.count === 0) return 'skipped';
      if (ai.linked) await syncAiItemWithPost(tx, ai.item, { postId: post.id, action: 'return_to_draft', fromPostStatus: 'scheduled', path: 'scheduled' }, { actorAdminId: null });
      await tx.auditLog.create({ data: { action: 'blog.post.schedule_blocked', targetType: 'post', targetId: post.id, metadata: { blockers: refusals, ...(ai.linked ? { aiItemId: ai.item.id } : {}) } } });
      return 'returned';
    }
    const updated = await tx.post.updateMany({
      where: { id: post.id, status: 'scheduled', version: post.version },
      data: { status: 'published', publishedAt: now, firstPublishedAt: post.firstPublishedAt ?? now, scheduledAt: null, publishFailure: null, version: { increment: 1 } },
    });
    // Another replica, or an editor's change, got there first.
    if (updated.count === 0) return 'skipped';
    if (ai.linked) await syncAiItemWithPost(tx, ai.item, { postId: post.id, action: 'publish', fromPostStatus: 'scheduled', path: 'scheduled' }, { actorAdminId: null });
    await tx.outboxEvent.create({
      data: {
        type: 'cache.invalidate',
        resourceType: 'post',
        resourceId: post.id,
        payload: { tags: [CACHE_TAGS.posts, CACHE_TAGS.post(post.slug), CACHE_TAGS.sitemap, CACHE_TAGS.taxonomy].join(',') },
      },
    });
    // The publication event both publishing paths record (AI plan §K): the
    // admin command writes the same type, resource and payload shape.
    await tx.outboxEvent.create({
      data: { type: 'post.published', resourceType: 'post', resourceId: post.id, resourceVersion: post.version + 1, payload: { postId: post.id, slug: post.slug, action: 'publish' } },
    });
    await tx.auditLog.create({ data: { action: 'blog.post.publish', targetType: 'post', targetId: post.id, metadata: { from: 'scheduled', to: 'published', scheduled: true } } });
    return 'published';
  });
}
