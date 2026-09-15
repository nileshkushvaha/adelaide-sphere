import { ALL_PERMISSION_KEYS, ACTIVE_PERMISSION_KEYS, isActivePermissionKey, isPermissionKey, PERMISSION_MODULES, PERMISSIONS, permissionDefinition } from './permissions.js';

describe('permission catalogue (SRS RBAC 002)', () => {
  it('uses the documented resource.action convention', () => {
    for (const key of ALL_PERMISSION_KEYS) {
      expect(key, key).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
    }
  });

  it('gives every entry a label, a description and a known module for the admin matrix', () => {
    for (const key of ALL_PERMISSION_KEYS) {
      const definition = permissionDefinition(key);
      expect(definition.label.length, key).toBeGreaterThan(2);
      expect(definition.description.length, key).toBeGreaterThan(5);
      expect(PERMISSION_MODULES, key).toContain(definition.module);
    }
  });

  it('recognises only registered codes, and only active ones grant access', () => {
    expect(isPermissionKey('listings.read')).toBe(true);
    expect(isPermissionKey('listings.everything')).toBe(false);
    expect(isActivePermissionKey('roles.update')).toBe(true);
    expect(isActivePermissionKey('nonsense')).toBe(false);
    expect(ACTIVE_PERMISSION_KEYS.every((key) => (PERMISSIONS[key] as { active?: false }).active !== false)).toBe(true);
  });

  it('names the menu item and action of every code, so the matrix reads like the sidebar (change log 1.13)', () => {
    for (const key of ALL_PERMISSION_KEYS) {
      const definition = permissionDefinition(key);
      expect(definition.menuItem.length, key).toBeGreaterThan(2);
      expect(definition.action.length, key).toBeGreaterThan(2);
    }
    // One screen, separate codes: the three settings screens can be given to different people.
    expect(permissionDefinition('settings.seo.view').menuItem).toBe('SEO settings');
    expect(permissionDefinition('settings.home.view').menuItem).toBe('Home page settings');
    expect(permissionDefinition('settings.general.view').menuItem).toBe('General settings');
  });

  it('carries grants over only from registered codes, never from itself', () => {
    for (const key of ALL_PERMISSION_KEYS) {
      for (const source of permissionDefinition(key).migratesFrom ?? []) {
        expect(isPermissionKey(source), `${key} ← ${source}`).toBe(true);
        expect(source, key).not.toBe(key);
      }
    }
    expect(isActivePermissionKey('settings.manage')).toBe(false);
    expect(permissionDefinition('settings.seo.update').migratesFrom).toContain('settings.manage');
  });

  it('covers access control itself, so role editing is not reachable without a grant', () => {
    for (const key of ['roles.view', 'roles.create', 'roles.update', 'roles.delete', 'permissions.view', 'admins.access.manage'] as const) {
      expect(ALL_PERMISSION_KEYS).toContain(key);
    }
  });
});
