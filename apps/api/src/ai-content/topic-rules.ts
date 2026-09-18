import { createHash } from 'node:crypto';
import {
  AI_ITEM_STATUSES,
  aiItemPreProcessing,
  aiItemReservesTitle,
  canTransitionAiItem,
  type AiItemStatus,
} from '@adelaide-sphere/domain';

/** The SRS lifecycle (AI-160–169); the transition table is shared through the domain package. */
export const TOPIC_STATUSES = AI_ITEM_STATUSES;
export type TopicStatus = AiItemStatus;
export const TOPIC_ACTIONS = ['pause', 'resume', 'cancel', 'reject'] as const;
export type TopicAction = (typeof TOPIC_ACTIONS)[number];
/** Every non-terminal (and published) item reserves its normalized title. */
export const activeTopic = aiItemReservesTitle;
/** Only queued or paused topics can be paused, resumed or reprioritized. */
export const preProcessingTopic = aiItemPreProcessing;
export function nextTopicStatus(
  status: TopicStatus,
  action: TopicAction,
): TopicStatus | null {
  if (action === 'pause' && status === 'queued') return 'paused';
  if (action === 'resume' && status === 'paused') return 'queued';
  // A scheduled item has a scheduled article: it is unscheduled through the
  // article first, never cancelled from under it.
  if (action === 'cancel' && status !== 'scheduled' && canTransitionAiItem(status, 'cancelled')) return 'cancelled';
  if (action === 'reject' && canTransitionAiItem(status, 'rejected')) return 'rejected';
  return null;
}
export function normalizeTopic(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const topicRequestKey = (adminId: string, key: string) =>
  digest(JSON.stringify([adminId, key]));
export const topicPayloadHash = (input: {
  title: string;
  brief?: string | null;
  priority: number;
}) =>
  digest(JSON.stringify([input.title, input.brief ?? null, input.priority]));
export { databaseCode, retryTransaction } from '../common/database-retry.js';
