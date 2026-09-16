import { describe, expect, it } from 'vitest';
import { POST_TRANSITIONS, deriveExcerpt, postPublicationBlockers, postPublicationChecklist, scheduleBlockers } from './posts.js';

const complete = { title: 'Adelaide laneway cafes', slug: 'adelaide-laneway-cafes', excerpt: 'A guide to the best laneway cafes.', plainBody: 'Some article body. '.repeat(20), authorActive: true, categoryActive: true };

describe('post publication rules (SRS BLOG 002)', () => {
  it('accepts a complete article', () => {
    expect(postPublicationBlockers(complete)).toEqual([]);
    expect(postPublicationChecklist(complete).every((requirement) => requirement.met)).toBe(true);
  });

  it('lists every unmet requirement in plain words, with counts so far', () => {
    expect(postPublicationBlockers({ title: 'Hi', slug: 'Not A Slug', excerpt: 'short', plainBody: 'tiny', authorActive: false, categoryActive: false })).toEqual([
      'Add a title of at least 3 characters',
      'Write at least 200 characters in the article — 4 characters so far',
      'Write a summary of at least 20 characters — 5 characters so far',
      'Choose a category',
      'Choose an author',
      'Fix the web address: use lowercase letters, numbers and single hyphens',
    ]);
  });

  it('names the field each requirement belongs to', () => {
    expect(postPublicationChecklist({ ...complete, excerpt: '' }).find((requirement) => !requirement.met)).toMatchObject({ code: 'excerpt', field: 'excerpt' });
  });

  it('counts the article text without its spacing', () => {
    expect(postPublicationChecklist({ ...complete, plainBody: `${'a'.repeat(199)}\n\n\n` }).find((r) => r.code === 'body')?.met).toBe(false);
  });

  it('requires a future schedule', () => {
    const now = new Date('2026-09-06T00:00:00Z');
    expect(scheduleBlockers(new Date('2026-09-07T00:00:00Z'), now)).toEqual([]);
    expect(scheduleBlockers(new Date('2026-09-05T00:00:00Z'), now)).toEqual(['Choose a time in the future']);
    expect(scheduleBlockers(null, now)).toEqual(['Choose a date and time to publish']);
    expect(scheduleBlockers(new Date('nonsense'), now)).toEqual(['The scheduled time is not a valid date']);
  });

  it('defines only the documented transitions', () => {
    expect(POST_TRANSITIONS.publish.from).toEqual(['draft', 'scheduled']);
    expect(POST_TRANSITIONS.unpublish.to).toBe('draft');
    expect(POST_TRANSITIONS.restore.from).toEqual(['archived']);
  });
});

describe('deriveExcerpt', () => {
  it('uses short text as it is and refuses text too short to summarise', () => {
    expect(deriveExcerpt('  A short but complete opening line.  ')).toBe('A short but complete opening line.');
    expect(deriveExcerpt('Too short')).toBe('');
  });

  it('ends at a sentence when one fits, otherwise at a word, never mid-word', () => {
    const sentences = `Norwood has more cafés than most suburbs. ${'Each one roasts its own beans and bakes its own pastries every single morning '.repeat(3)}`;
    expect(deriveExcerpt(sentences)).toBe('Norwood has more cafés than most suburbs.');
    const oneLongSentence = 'word '.repeat(60);
    const derived = deriveExcerpt(oneLongSentence);
    expect(derived.endsWith('word…')).toBe(true);
    expect(derived.length).toBeLessThanOrEqual(161);
  });
});
