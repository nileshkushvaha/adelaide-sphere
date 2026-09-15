import { describe, expect, it } from 'vitest';
import { activitySentence, activitySubject, dayHeading, adelaideDayKey, targetNoun, timeSpan, type ActivityItem } from './activity';

const item = (overrides: Partial<ActivityItem>): ActivityItem => ({ id: 'e1', action: 'listing.publish', actorName: 'Dev Admin', targetType: 'business', createdAt: '2026-09-15T04:53:00.000Z', ...overrides });

describe('activity sentences (change log 1.14)', () => {
  it('names the record where the server gave its name, linked to its screen', () => {
    expect(activitySentence(item({ targetId: 'b1', targetLabel: 'Laneway Café' }))).toEqual(['published business ', { strong: 'Laneway Café', href: '/businesses/b1' }]);
  });

  it('describes an unnamed record by its kind only', () => {
    expect(activitySentence(item({ action: 'review.approve', targetType: 'review', targetId: 'r1' }))).toEqual(['approved a review']);
  });

  it('reads a group as a count', () => {
    expect(activitySentence(item({ action: 'authz.permission.migrated', actorName: null, targetType: 'permission', count: 63 }))).toEqual(['gave existing holders ', { strong: '63 new permissions' }]);
    expect(activitySentence(item({ action: 'media.delete', targetType: 'media_asset', count: 3 }))).toEqual(['deleted ', { strong: '3 images' }]);
  });

  it('summarises permission changes from the recorded lists', () => {
    const parts = activitySentence(item({ action: 'authz.role.permissions', targetType: 'role', targetId: 'r1', targetLabel: 'Editor', metadata: { added: 'posts.view,posts.update', removed: 'none' } }));
    expect(parts).toEqual(['changed the permissions of role ', { strong: 'Editor', href: '/roles/r1' }, ' (2 added)']);
  });

  it('says who did it, without inventing an administrator', () => {
    expect(activitySubject(item({ actorName: null }))).toBe('The system');
    expect(activitySubject(item({ action: 'auth.login.failure', actorName: null, outcome: 'failure' }))).toBe('Someone');
  });

  it('pluralises target kinds', () => {
    expect(targetNoun('category', 2)).toBe('categories');
    expect(targetNoun('partner_organisation', 2)).toBe('clients or partners');
  });
});

describe('Adelaide days and times', () => {
  it('uses the Adelaide calendar day, not the reader’s', () => {
    // 16:00 UTC on 14 Sept is 01:30 on 15 Sept in Adelaide (ACST, +9:30).
    expect(adelaideDayKey('2026-09-14T16:00:00.000Z')).toBe('2026-09-15');
  });

  it('calls today and yesterday by name', () => {
    const now = new Date('2026-09-15T04:00:00.000Z');
    expect(dayHeading('2026-09-15', now)).toBe('Today');
    expect(dayHeading('2026-09-14', now)).toBe('Yesterday');
    expect(dayHeading('2026-09-10', now)).toMatch(/10 Sept 2026/);
  });

  it('shows a span only when a group covers more than a minute', () => {
    expect(timeSpan('2026-09-15T04:53:01.000Z', '2026-09-15T04:53:40.000Z')).toBeNull();
    expect(timeSpan('2026-09-15T04:53:00.000Z', '2026-09-15T04:58:00.000Z')).toMatch(/^from .* to .*/);
  });
});
