import { postPublicationBlockers as sharedBlockers } from '@adelaide-sphere/domain';
import { toPlainText } from './sanitise.js';

/**
 * The publication rules live in `@adelaide-sphere/domain/posts`, shared with
 * the admin's live checklist so both apply the same requirements in the same
 * words (SRS BLOG 002). This module adapts them to stored rows.
 */
export { MIN_BODY_CHARACTERS, POST_STATES, POST_TRANSITIONS, deriveExcerpt, scheduleBlockers, type PostAction, type PostStatus } from '@adelaide-sphere/domain';

export interface PublicationInput {
  title: string;
  slug: string;
  excerpt: string;
  sanitizedBody: string;
  authorActive: boolean;
  categoryActive: boolean;
}

/** Everything BLOG 002 requires before a post may be published or scheduled. */
export function postPublicationBlockers(input: PublicationInput): string[] {
  return sharedBlockers({ ...input, plainBody: toPlainText(input.sanitizedBody) });
}

/** Related-article ordering (SRS BLOG 004): same category first, then shared tags, stable by id. */
export function relatedScore(candidate: { categoryId: string; tagIds: string[] }, source: { categoryId: string; tagIds: string[] }): number {
  const sameCategory = candidate.categoryId === source.categoryId ? 100 : 0;
  const sharedTags = candidate.tagIds.filter((tag) => source.tagIds.includes(tag)).length;
  return sameCategory + sharedTags;
}
