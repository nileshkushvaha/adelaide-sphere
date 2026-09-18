import {
  nextTopicStatus,
  normalizeTopic,
  retryTransaction,
  topicPayloadHash,
  topicRequestKey,
} from './topic-rules.js';
import {
  groupDefaults,
  settingGroup,
  validateGroupPayload,
} from '../settings/registry.js';

describe('Phase 1A topic invariants', () => {
  it('normalizes compatibility Unicode, case, whitespace and punctuation without inventing semantic equivalence', () => {
    expect(normalizeTopic('  Ｃａｆｅ — GUIDES!! ')).toBe('cafe guides');
    expect(normalizeTopic('Cafe guides')).toBe(
      normalizeTopic('CAFE   guides!'),
    );
    expect(normalizeTopic('Restaurants in Adelaide')).not.toBe(
      normalizeTopic('Adelaide dining'),
    );
    expect(normalizeTopic('!!!')).toBe('');
  });
  it('permits only the Phase 1A lifecycle and terminal history is immutable', () => {
    expect(nextTopicStatus('queued', 'pause')).toBe('paused');
    expect(nextTopicStatus('paused', 'resume')).toBe('queued');
    for (const s of ['queued', 'paused'] as const) {
      expect(nextTopicStatus(s, 'cancel')).toBe('cancelled');
      expect(nextTopicStatus(s, 'reject')).toBe('rejected');
    }
    for (const s of ['cancelled', 'rejected'] as const)
      for (const a of ['pause', 'resume', 'cancel', 'reject'] as const)
        expect(nextTopicStatus(s, a)).toBeNull();
    expect(nextTopicStatus('queued', 'resume')).toBeNull();
  });
  it('extends administrator actions to the SRS lifecycle without bypassing it (Phase 1B)', () => {
    // Cancelling fences in-progress work; rejection is an editorial decision on reviewable items.
    for (const s of ['researching', 'generating', 'failed'] as const)
      expect(nextTopicStatus(s, 'cancel')).toBe('cancelled');
    for (const s of ['ready_for_review', 'needs_fact_review'] as const)
      expect(nextTopicStatus(s, 'reject')).toBe('rejected');
    // A scheduled item is unscheduled through its article, never cancelled from under it.
    expect(nextTopicStatus('scheduled', 'cancel')).toBeNull();
    // Published is final for the create workflow (AI-200, AI-212).
    for (const a of ['pause', 'resume', 'cancel', 'reject'] as const)
      expect(nextTopicStatus('published', a)).toBeNull();
    // Pause/resume stay limited to unstarted topics.
    for (const s of ['researching', 'generating', 'ready_for_review', 'approved'] as const) {
      expect(nextTopicStatus(s, 'pause')).toBeNull();
      expect(nextTopicStatus(s, 'resume')).toBeNull();
    }
  });
  it('binds request identity to actor and fingerprints all input rather than normalized duplicate title alone', () => {
    const a = { title: 'Topic', priority: 0, brief: 'brief' };
    expect(topicPayloadHash(a)).toBe(
      topicPayloadHash({ brief: 'brief', priority: 0, title: 'Topic' }),
    );
    expect(topicPayloadHash(a)).not.toBe(
      topicPayloadHash({ ...a, brief: 'changed' }),
    );
    expect(topicPayloadHash(a)).not.toBe(
      topicPayloadHash({ ...a, title: 'TOPIC' }),
    );
    expect(topicPayloadHash(a)).not.toBe(
      topicPayloadHash({ ...a, priority: 1 }),
    );
    expect(topicRequestKey('admin1', 'request')).not.toBe(
      topicRequestKey('admin2', 'request'),
    );
  });
  it('has disabled execution-related defaults, validates all modes and rejects unknown/secrets/unbounded settings', () => {
    const group = settingGroup('ai_content');
    const defaults = groupDefaults(group);
    expect(defaults).toMatchObject({
      enabled: false,
      postingEnabled: false,
      titleMode: 'manual',
      publicationMode: 'review_required',
      // Owner image decisions (Phase 1E): hybrid, prompt-only unless a person asks; no image budget until one is set.
      imageMode: 'hybrid',
      featuredImageRequired: true,
      imageDailyLimitMinor: 0,
      imageMonthlyLimitMinor: 0,
      imageDisclosureText: 'Illustrative image created with AI.',
      timezone: 'Australia/Adelaide',
      // Owner budget decision of 18 September 2026 (Phase 1D): USD, 0.50/day, 10.00/month, 0.25/article, warn at 70%.
      budgetCurrency: 'USD',
      hardDailyLimitMinor: 50,
      hardMonthlyLimitMinor: 1000,
      maxWorkflowCostMinor: 25,
      warningThreshold: 70,
      // No byline until the owner chooses an existing author: generation stays blocked.
      articleAuthorId: '',
      disclosureText: 'AI-assisted content: This article was prepared with AI assistance and reviewed against source information before publication.',
    });
    expect(
      validateGroupPayload(
        group,
        {
          titleMode: 'hybrid',
          imageMode: 'manual',
          publicationMode: 'auto_publish',
        },
        defaults,
      ).errors,
    ).toEqual({});
    // Automatic image generation is not approved: saving it is refused, not stored for later.
    expect(validateGroupPayload(group, { imageMode: 'automatic' }, defaults).errors).toEqual({ imageMode: expect.stringMatching(/not approved/) });
    const errors = validateGroupPayload(
      group,
      {
        titleMode: 'magic',
        secret: 'not allowed',
        warningThreshold: 101,
        hardMonthlyLimitMinor: -1,
        location: '',
        editorialStrategy: 'x'.repeat(2001),
        timezone: 'Mars',
      },
      defaults,
    ).errors;
    expect(Object.keys(errors).sort()).toEqual(
      [
        'editorialStrategy',
        'hardMonthlyLimitMinor',
        'location',
        'secret',
        'timezone',
        'titleMode',
        'warningThreshold',
      ].sort(),
    );
  });
  it('retries only known rollback deadlocks and caps retry attempts', async () => {
    const work = vi
      .fn()
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockResolvedValue('done');
    expect(await retryTransaction(work)).toBe('done');
    expect(work).toHaveBeenCalledTimes(2);
    const fail = vi.fn().mockRejectedValue({ code: 'P2034' });
    await expect(retryTransaction(fail)).rejects.toEqual({ code: 'P2034' });
    expect(fail).toHaveBeenCalledTimes(3);
    const uncertain = vi.fn().mockRejectedValue(new Error('response lost'));
    await expect(retryTransaction(uncertain)).rejects.toThrow('response lost');
    expect(uncertain).toHaveBeenCalledTimes(1);
  });
});
