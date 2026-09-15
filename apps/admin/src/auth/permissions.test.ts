// Read as text through Vite rather than imported: the API is a separate app with
// its own build, and this test only needs the catalogue's keys.
import apiCatalogueSource from '../../../api/src/identity/permissions.ts?raw';
import { ALL_PERMISSION_CODES, permissionsForPath, ROUTE_PERMISSIONS } from './permissions';

/**
 * The admin's typed codes must stay in step with the API's catalogue. This reads
 * the API source rather than importing it (the two apps do not share a package),
 * so adding a permission on the server fails here until the admin knows about it
 * — the alternative is a screen silently gated on a code that no longer exists.
 *
 * Retired entries (`active: false`) are excluded: they grant nothing and are not
 * offered for assignment (SRS RBAC 002), so the admin must not carry them.
 */
function apiCatalogueKeys(): string[] {
  const source = apiCatalogueSource;
  const block = source.slice(source.indexOf('export const PERMISSIONS = {'), source.indexOf('} as const satisfies'));
  return [...block.matchAll(/^\s{2}'([a-z][a-z0-9_.]+)':\s*\{([^}]*)\}/gm)]
    .filter((match) => !/active:\s*false/.test(match[2] ?? ''))
    .map((match) => match[1]);
}

describe('admin permission codes', () => {
  it('matches the API catalogue exactly', () => {
    expect([...ALL_PERMISSION_CODES].sort()).toEqual(apiCatalogueKeys().sort());
  });

  it('gates every permission-bearing route through the one canonical mapping', () => {
    for (const entry of ROUTE_PERMISSIONS) {
      expect(entry.permissions.length, entry.path).toBeGreaterThan(0);
      for (const code of entry.permissions) expect(ALL_PERMISSION_CODES, entry.path).toContain(code);
      expect(permissionsForPath(entry.path)).toEqual(entry.permissions);
    }
  });

  it('does not leave the access-control screens ungated', () => {
    expect(permissionsForPath('/roles')).toEqual(['roles.view']);
    expect(permissionsForPath('/permissions')).toEqual(['permissions.view']);
    expect(permissionsForPath('/admins')).toEqual(['admins.view']);
    expect(permissionsForPath('/audit')).toContain('activity.access_control.view');
  });
});

describe('route patterns with parameters', () => {
  it('gives an editor route its own permission rather than the list’s', () => {
    expect(permissionsForPath('/website/faqs')).toEqual(['website.faqs.view']);
    expect(permissionsForPath('/website/faqs/new')).toEqual(['website.faqs.create']);
    expect(permissionsForPath('/website/faqs/cmt123abc')).toEqual(['website.faqs.update']);
  });

  it('still falls back to the longest matching prefix for nested routes', () => {
    // `/businesses/:id/anything` has no pattern of its own; the list's mapping covers it.
    expect(permissionsForPath('/businesses/abc/edit')).toEqual(['listings.read']);
  });

  it('grants nothing for a path nobody mapped', () => {
    expect(permissionsForPath('/not-a-route')).toEqual([]);
  });
});
