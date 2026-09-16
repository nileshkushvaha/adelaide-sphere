import { postPublicationBlockers, relatedScore, scheduleBlockers, POST_TRANSITIONS } from './post-rules.js';
import { renderSanitisedBody } from './sanitise.js';

const body = renderSanitisedBody('Some article body. '.repeat(20));

describe('post publication rules (SRS BLOG 002)', () => {
  it('accepts a complete post', () => {
    expect(postPublicationBlockers({ title: 'Adelaide laneway cafes', slug: 'adelaide-laneway-cafes', excerpt: 'A guide to the best laneway cafes.', sanitizedBody: body, authorActive: true, categoryActive: true })).toEqual([]);
  });

  it('lists every unmet requirement', () => {
    expect(
      postPublicationBlockers({ title: 'Hi', slug: 'Not A Slug', excerpt: 'short', sanitizedBody: renderSanitisedBody('tiny'), authorActive: false, categoryActive: false }),
    ).toEqual([
      'Add a title of at least 3 characters',
      'Write at least 200 characters in the article — 4 characters so far',
      'Write a summary of at least 20 characters — 5 characters so far',
      'Choose a category',
      'Choose an author',
      'Fix the web address: use lowercase letters, numbers and single hyphens',
    ]);
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

  it('ranks related articles by category first, then shared tags', () => {
    const source = { categoryId: 'c1', tagIds: ['t1', 't2'] };
    expect(relatedScore({ categoryId: 'c1', tagIds: ['t1'] }, source)).toBe(101);
    expect(relatedScore({ categoryId: 'c1', tagIds: [] }, source)).toBe(100);
    expect(relatedScore({ categoryId: 'c2', tagIds: ['t1', 't2'] }, source)).toBe(2);
    expect(relatedScore({ categoryId: 'c2', tagIds: [] }, source)).toBe(0);
  });
});
