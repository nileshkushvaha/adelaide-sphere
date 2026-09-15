import { toneOf } from './statusTone';

/**
 * The row class for a record's state, for tables where the reader is triaging.
 *
 * Deliberately not applied to every list: a business list where every row is
 * tinted teaches the reader to ignore the colour, which is the opposite of what
 * it is for. Use it on queues — moderation, enquiries, jobs — where the state is
 * the reason the row is being looked at.
 */
export function statusRowClass(status: string | null | undefined): string {
  if (!status) return '';
  const tone = toneOf(status);
  // A settled row needs no emphasis; it is the ones still waiting or broken that
  // have to stand out.
  return tone === 'neutral' || tone === 'positive' ? '' : `ms-row-${tone}`;
}
