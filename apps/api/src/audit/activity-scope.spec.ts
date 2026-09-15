import { ACTIVITY_CATEGORIES, ACTIVITY_VIEW_PERMISSION, categoriesVisibleTo } from './activity-catalogue.js';
import { activityScope, decodeGroupKey, encodeGroupKey, groupWhere } from './activity-scope.js';
import { isActivePermissionKey } from '../identity/permissions.js';

describe('activity log scope (change log 1.14)', () => {
  it('has an active view permission for every area', () => {
    for (const category of ACTIVITY_CATEGORIES) expect(isActivePermissionKey(ACTIVITY_VIEW_PERMISSION[category]), category).toBe(true);
  });

  it('shows only the areas whose permission is held', () => {
    expect(categoriesVisibleTo(['activity.content.view', 'posts.view'])).toEqual(['content']);
    expect(categoriesVisibleTo([])).toEqual([]);
  });

  it('adds no restriction for an administrator who sees every area, and limits everyone else', () => {
    expect(activityScope([...ACTIVITY_CATEGORIES])).toEqual({});
    const scope = JSON.stringify(activityScope(['content']));
    expect(scope).toContain('listing.');
    expect(scope).not.toContain('"auth.');
    // Only system visibility reaches events from an unregistered domain.
    expect(JSON.stringify(activityScope(['system']))).toContain('NOT');
  });

  it('round-trips a group key and refuses anything else', () => {
    const key = { action: 'authz.permission.migrated', actorAdminId: null, bucket: { kind: 'minute' as const, value: '2026-09-15 04:53' } };
    expect(decodeGroupKey(encodeGroupKey(key))).toEqual(key);
    expect(decodeGroupKey('not-a-key')).toBeNull();
    expect(decodeGroupKey(Buffer.from(JSON.stringify(['x', null, 'm', 'yesterday'])).toString('base64url'))).toBeNull();
    expect(decodeGroupKey(Buffer.from(JSON.stringify(["auth.login'; DROP", null, 'r', 'abc'])).toString('base64url'))).toBeNull();
  });

  it('turns a minute bucket into a one-minute window for events without a request', () => {
    const where = groupWhere({ action: 'auth.logout', actorAdminId: 'a1', bucket: { kind: 'minute', value: '2026-09-15 04:53' } });
    expect(where).toMatchObject({ action: 'auth.logout', actorAdminId: 'a1', requestId: null, createdAt: { gte: new Date('2026-09-15T04:53:00.000Z'), lt: new Date('2026-09-15T04:54:00.000Z') } });
  });
});
