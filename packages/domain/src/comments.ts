/**
 * Article comment threads (SRS 1.10 COM 001). Comments have two levels: a
 * comment and the replies to it. Replying to a reply adds to the same thread,
 * under the top-level comment, so a conversation never nests deeper and stays
 * readable on a phone.
 */

/** The public name on a reply written by the team from moderation. */
export const STAFF_COMMENT_NAME = 'Adelaide Sphere team';

/** The comment a new reply is stored under: the target itself, or the top-level comment of the thread the target belongs to. */
export function replyParentId(target: { id: string; parentId: string | null }): string {
  return target.parentId ?? target.id;
}
