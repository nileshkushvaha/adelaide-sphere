import { ACTIVE_PERMISSION_KEYS } from '../identity/permissions.js';
import {
  SETTING_GROUPS,
  SETTING_GROUP_KEYS,
  groupDefaults,
  isSettingGroupKey,
  registryMetadata,
  settingGroup,
  validateGroupPayload,
  validateSettingValue,
  type SettingDeclaration,
  type SettingGroupDeclaration,
} from './registry.js';

const allSettings = (): { group: SettingGroupDeclaration; setting: SettingDeclaration }[] =>
  SETTING_GROUPS.flatMap((group) => group.settings.map((setting) => ({ group, setting })));

describe('settings registry (SRS 1.2 SET 001–005)', () => {
  it('declares every group exactly once, with an owning module and its own row key', () => {
    expect(SETTING_GROUPS.map((group) => group.key).sort()).toEqual([...SETTING_GROUP_KEYS].sort());
    for (const group of SETTING_GROUPS) {
      expect(group.owner.length, group.key).toBeGreaterThan(3);
      expect(group.storeKey, group.key).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('declares a group permission pair that exists in the code catalogue', () => {
    for (const group of SETTING_GROUPS) {
      expect(ACTIVE_PERMISSION_KEYS, group.key).toContain(group.viewPermission);
      expect(ACTIVE_PERMISSION_KEYS, group.key).toContain(group.updatePermission);
    }
  });

  it('explains any group that declares no settings yet, so "not yet" is never read as "forgotten"', () => {
    for (const group of SETTING_GROUPS) {
      if (group.settings.length === 0) expect(group.note, group.key).toBeTruthy();
    }
  });

  it('never declares a sensitive value as a stored setting (SET 004)', () => {
    // A setting whose name *ends* in a credential noun holds a credential;
    // `passwordMinLength` is a policy number, `smtpPassword` is a secret. The
    // check is on the last word for that reason.
    const holdsACredential = /(^|[a-z])(key|secret|token|password|credential)s?$/i;
    for (const { group, setting } of allSettings()) {
      // Credentials, API keys and signing secrets belong in environment-managed
      // configuration. If this fails, the fix is to move the value out of the
      // registry — not to relax the assertion.
      expect(setting.sensitive, `${group.key}.${setting.key}`).toBe(false);
      expect(holdsACredential.test(setting.key), `${group.key}.${setting.key}`).toBe(false);
    }
  });

  it('the credential-name check catches a real secret and lets a policy number through', () => {
    const holdsACredential = /(^|[a-z])(key|secret|token|password|credential)s?$/i;
    for (const unsafe of ['smtpPassword', 'apiKey', 'webhookSecret', 'accessToken', 'providerCredentials']) {
      expect(holdsACredential.test(unsafe), unsafe).toBe(true);
    }
    for (const safe of ['passwordMinLength', 'passwordResetMinutes', 'passwordHistoryDepth', 'sessionIdleMinutes']) {
      expect(holdsACredential.test(safe), safe).toBe(false);
    }
  });

  it('names the code that enforces every declared setting (SET 005 / SECS 001)', () => {
    for (const { group, setting } of allSettings()) {
      expect(setting.enforcedBy?.length ?? 0, `${group.key}.${setting.key}`).toBeGreaterThan(3);
    }
  });

  it('gives every declaration the metadata SET 002 requires', () => {
    for (const { group, setting } of allSettings()) {
      const id = `${group.key}.${setting.key}`;
      expect(setting.label.length, id).toBeGreaterThan(2);
      expect(setting.description.length, id).toBeGreaterThan(5);
      expect(['public', 'private'], id).toContain(setting.visibility);
      expect(['runtime', 'restart_required'], id).toContain(setting.effect);
      expect(ACTIVE_PERMISSION_KEYS, id).toContain(setting.viewPermission);
      expect(ACTIVE_PERMISSION_KEYS, id).toContain(setting.updatePermission);
      expect(Array.isArray(setting.invalidates), id).toBe(true);
      // A numeric or text setting without bounds is an unbounded input.
      if (setting.type === 'integer' || setting.type === 'string') {
        expect(setting.bounds.min !== undefined || setting.bounds.max !== undefined, id).toBe(true);
      }
      if (setting.type === 'enum') expect((setting.bounds.values ?? []).length, id).toBeGreaterThan(1);
      // The default must satisfy the declaration it belongs to.
      expect(validateSettingValue(setting, setting.default).error, id).toBeUndefined();
    }
  });

  it('keys are unique within a group and follow one convention', () => {
    for (const group of SETTING_GROUPS) {
      const keys = group.settings.map((setting) => setting.key);
      expect(new Set(keys).size, group.key).toBe(keys.length);
      for (const key of keys) expect(key, `${group.key}.${key}`).toMatch(/^[a-z][a-zA-Z0-9]*$/);
    }
  });

  it('resolves known group keys and refuses unknown ones', () => {
    expect(isSettingGroupKey('security')).toBe(true);
    expect(isSettingGroupKey('everything')).toBe(false);
    expect(settingGroup('email').storeKey).toBe('email');
    expect(() => settingGroup('nope' as never)).toThrow(/unknown setting group/);
  });

  it('publishes metadata only — never a stored value (SET 002)', () => {
    const serialised = JSON.stringify(registryMetadata());
    expect(serialised).not.toMatch(/"value"\s*:/);
    for (const group of registryMetadata()) {
      expect(Object.keys(group)).toEqual(['key', 'label', 'description', 'owner', 'viewPermission', 'updatePermission', 'note', 'settings']);
    }
  });
});

describe('settings payload validation (SRS 1.2 SET 003)', () => {
  // A fixture group exercises the generic validator without inventing a
  // production setting: nothing here ships, and every real declaration is held
  // to the invariants above.
  const fixture: SettingGroupDeclaration = {
    key: 'operations',
    label: 'Fixture',
    description: 'Validation fixture',
    owner: 'Test',
    storeKey: 'fixture',
    viewPermission: 'system.settings.view',
    updatePermission: 'system.settings.update',
    settings: [
      {
        key: 'enabled',
        label: 'Enabled',
        description: 'A boolean fixture',
        type: 'boolean',
        bounds: {},
        default: false,
        visibility: 'private',
        effect: 'runtime',
        sensitive: false,
        viewPermission: 'system.settings.view',
        updatePermission: 'system.settings.update',
        invalidates: [],
        enforcedBy: 'registry.spec.ts fixture',
      },
      {
        key: 'retentionDays',
        label: 'Retention days',
        description: 'A bounded integer fixture',
        type: 'integer',
        bounds: { min: 1, max: 30, boundedBy: 'fixture' },
        default: 7,
        visibility: 'private',
        effect: 'runtime',
        sensitive: false,
        viewPermission: 'system.settings.view',
        updatePermission: 'system.settings.update',
        invalidates: [],
        enforcedBy: 'registry.spec.ts fixture',
      },
      {
        key: 'contact',
        label: 'Contact',
        description: 'An email fixture',
        type: 'email',
        bounds: { max: 254 },
        default: '',
        visibility: 'private',
        effect: 'runtime',
        sensitive: false,
        viewPermission: 'system.settings.view',
        updatePermission: 'system.settings.update',
        invalidates: [],
        enforcedBy: 'registry.spec.ts fixture',
      },
      {
        key: 'moreInfoUrl',
        label: 'More information',
        description: 'A URL fixture',
        type: 'url',
        bounds: { max: 255 },
        default: '',
        visibility: 'private',
        effect: 'runtime',
        sensitive: false,
        viewPermission: 'system.settings.view',
        updatePermission: 'system.settings.update',
        invalidates: [],
        enforcedBy: 'registry.spec.ts fixture',
      },
      {
        key: 'mode',
        label: 'Mode',
        description: 'An enum fixture',
        type: 'enum',
        bounds: { values: ['off', 'warn', 'strict'] },
        default: 'warn',
        visibility: 'private',
        effect: 'restart_required',
        sensitive: false,
        viewPermission: 'system.settings.view',
        updatePermission: 'system.settings.update',
        invalidates: [],
        enforcedBy: 'registry.spec.ts fixture',
      },
    ],
  };

  const current = groupDefaults(fixture);

  it('accepts declared values and keeps omitted settings unchanged', () => {
    const { errors, value } = validateGroupPayload(fixture, { retentionDays: 14 }, { ...current, mode: 'strict' });
    expect(errors).toEqual({});
    expect(value.retentionDays).toBe(14);
    expect(value.mode).toBe('strict');
    expect(value.enabled).toBe(false);
  });

  it('rejects an unknown key rather than ignoring it, so a typo cannot silently do nothing', () => {
    const { errors } = validateGroupPayload(fixture, { retentionDay: 14 }, current);
    expect(errors.retentionDay).toBe('Unknown setting');
  });

  it('enforces the declared bounds', () => {
    expect(validateGroupPayload(fixture, { retentionDays: 0 }, current).errors.retentionDays).toBe('Must be 1 or more');
    expect(validateGroupPayload(fixture, { retentionDays: 31 }, current).errors.retentionDays).toBe('Must be 30 or less');
    expect(validateGroupPayload(fixture, { retentionDays: 7.5 }, current).errors.retentionDays).toBe('Must be a whole number');
    expect(validateGroupPayload(fixture, { enabled: 'yes' }, current).errors.enabled).toBe('Must be true or false');
    expect(validateGroupPayload(fixture, { mode: 'lenient' }, current).errors.mode).toBe('Must be one of the permitted values');
    expect(validateGroupPayload(fixture, { contact: 'not-an-address' }, current).errors.contact).toBe('Must be a valid email address');
  });

  it('validates URLs at write time with a scheme allowlist, not at render time (SEC 001)', () => {
    for (const unsafe of ['javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', '//evil.example/x', 'file:///etc/passwd']) {
      const { errors } = validateGroupPayload(fixture, { moreInfoUrl: unsafe }, current);
      expect(errors.moreInfoUrl, unsafe).toBeTruthy();
    }
    expect(validateGroupPayload(fixture, { moreInfoUrl: 'https://adelaidesphere.com/help' }, current).errors).toEqual({});
  });

  it('trims text values so a stored setting never carries stray whitespace', () => {
    const { value } = validateGroupPayload(fixture, { contact: '  hello@example.com  ' }, current);
    expect(value.contact).toBe('hello@example.com');
  });
});
