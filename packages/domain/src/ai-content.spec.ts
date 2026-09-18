import { AI_ITEM_STATUSES, AI_ITEM_TRANSITIONS, aiItemPreProcessing, aiItemReservesTitle, canTransitionAiItem, type AiItemStatus } from './ai-content.js';

describe('AI item lifecycle (SRS AI-160–169, AI-194–200)', () => {
  it('names every SRS state exactly once and gives each a transition row', () => {
    expect(new Set(AI_ITEM_STATUSES).size).toBe(AI_ITEM_STATUSES.length);
    expect(Object.keys(AI_ITEM_TRANSITIONS).sort()).toEqual([...AI_ITEM_STATUSES].sort());
    for (const targets of Object.values(AI_ITEM_TRANSITIONS)) for (const to of targets) expect(AI_ITEM_STATUSES).toContain(to);
  });

  it('allows the SRS transition table', () => {
    const allowed: [AiItemStatus, AiItemStatus][] = [
      ['queued', 'researching'], ['queued', 'cancelled'],
      ['researching', 'generating'], ['researching', 'needs_fact_review'], ['researching', 'failed'],
      ['generating', 'ready_for_review'], ['generating', 'needs_fact_review'], ['generating', 'approved'], ['generating', 'failed'],
      ['ready_for_review', 'approved'], ['ready_for_review', 'rejected'], ['ready_for_review', 'generating'],
      ['approved', 'scheduled'], ['approved', 'published'], ['approved', 'ready_for_review'],
      ['scheduled', 'published'], ['scheduled', 'failed'], ['scheduled', 'cancelled'],
    ];
    for (const [from, to] of allowed) expect(canTransitionAiItem(from, to), `${from} → ${to}`).toBe(true);
  });

  it('refuses every prohibited move from the SRS table and the plan', () => {
    const forbidden: [AiItemStatus, AiItemStatus][] = [
      ['queued', 'published'], // AI-194
      ['researching', 'scheduled'], ['researching', 'published'], // AI-195
      ['generating', 'published'], // AI-196
      ['ready_for_review', 'published'], ['ready_for_review', 'scheduled'], // AI-197
      ['needs_fact_review', 'approved'], ['needs_fact_review', 'published'], // plan §D: fact review never auto-approves
      ['scheduled', 'generating'], // AI-199
      ['published', 'generating'], ['published', 'ready_for_review'], ['published', 'draft' as AiItemStatus], // AI-200, AI-212
      ['cancelled', 'queued'], ['rejected', 'queued'], ['cancelled', 'researching'], ['rejected', 'generating'], // no automatic retry of editorial stops
    ];
    for (const [from, to] of forbidden) expect(canTransitionAiItem(from, to), `${from} → ${to}`).toBe(false);
    for (const terminal of ['published', 'cancelled', 'rejected'] as const) expect(AI_ITEM_TRANSITIONS[terminal]).toEqual([]);
  });

  it('keeps a title reserved until an item is cancelled or rejected, and pause/priority to unstarted items', () => {
    expect(AI_ITEM_STATUSES.filter((s) => !aiItemReservesTitle(s))).toEqual(['cancelled', 'rejected']);
    expect(AI_ITEM_STATUSES.filter(aiItemPreProcessing)).toEqual(['queued', 'paused']);
  });
});
