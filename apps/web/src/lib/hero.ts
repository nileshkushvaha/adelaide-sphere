/** Hero rotation timing (SRS HERO 002): 4 s dwell, 300 ms transition, reserved height. */
export const PHRASE_DWELL_MS = 4000;
export const PHRASE_TRANSITION_MS = 300;

/**
 * One accessible headline whatever the rotation does (SRS HERO 002/003): the
 * visible phrase is decorative, so screen readers get a single stable sentence
 * and never an announcement per phrase.
 */
export function accessibleHeadline(headline: string, phrases: string[]): string {
  const list = phrases.filter((p) => p.trim().length > 0);
  if (list.length === 0) return headline;
  const joined = list.length === 1 ? list[0]! : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
  return `${headline}: ${joined}`;
}

export function nextPhraseIndex(current: number, total: number): number {
  return total <= 0 ? 0 : (current + 1) % total;
}

/** Hero phrases are optional content; keep at most five and drop blanks (HERO 002). */
export function usablePhrases(phrases: string[] | undefined): string[] {
  return (phrases ?? []).map((p) => p.trim()).filter((p) => p.length > 0).slice(0, 5);
}
