/**
 * Typed settings registry (SRS 1.2 SET 001–005).
 *
 * Configuration is divided into four *owned* groups — security, email,
 * operations and website — each with one owning module and its own permissions.
 * That ownership is what SET 001 requires, and it is expressed here in code:
 * the storage is one `settings` table keyed by (group, key), because four
 * tables with identical columns would add migrations and joins without adding
 * a guarantee this file does not already enforce.
 *
 * Every dynamic setting is declared here with the metadata SET 002 requires:
 * a stable key, a data type, its validation bounds, a default, public or
 * private visibility, whether a change takes effect at runtime or needs a
 * restart, whether the value is sensitive, the permissions to read and change
 * it, and the cache namespaces its change invalidates. A setting that is not
 * declared here cannot be read or written through the API, and administrators
 * never create keys through an interface.
 *
 * Two rules are enforced by `registry.spec.ts` rather than left to review:
 *
 *  - **No secret is ever a setting (SET 004).** Credentials, API keys and
 *    signing secrets live in environment-managed configuration. `sensitive`
 *    exists so that an attempt to declare one fails loudly with this reason
 *    attached, not so that sensitive values can be stored carefully.
 *  - **No stored-but-unenforced control (SET 005 / SECS 001).** Every
 *    declaration names the code that enforces it in `enforcedBy`. A setting
 *    ships with its enforcement or it does not ship.
 *
 * Groups may legitimately declare no settings yet: the group exists so its
 * store, permissions and ownership are fixed before the first setting lands.
 */
import { AI_CONTENT_SETTINGS } from './ai-content-settings.js';
import type { PermissionKey } from '../identity/permissions.js';

export const SETTING_GROUP_KEYS = ['security', 'email', 'operations', 'website', 'ai_content'] as const;
export type SettingGroupKey = (typeof SETTING_GROUP_KEYS)[number];

/** The website group's own key, used by `SettingsService` for its two documents. */
export const WEBSITE_GROUP: SettingGroupKey = 'website';

/**
 * Every group is stored in the one `settings` table, keyed by (group, key).
 * Ownership — who may read and write a group, how it validates, what its change
 * invalidates — is expressed by the declarations below and by the owning
 * service, not by giving each group an identical table of its own (SET 001).
 */
export const SETTINGS_TABLE = 'settings';

export type SettingType = 'boolean' | 'integer' | 'string' | 'enum' | 'email' | 'url';

/** What a number counts. Rendered as an input suffix, never as bare digits. */
export type SettingUnit = 'minutes' | 'hours' | 'days' | 'sessions' | 'characters' | 'passwords' | 'attempts';

export interface SettingBounds {
  /** Inclusive minimum for `integer`; minimum length for `string`. */
  min?: number;
  /** Inclusive maximum for `integer`; maximum length for `string`. */
  max?: number;
  /** Permitted values for `enum`. */
  values?: readonly string[];
  /**
   * The requirement that fixes the outer bound, quoted so a later widening is
   * a visible specification change rather than a number edit (SET 005).
   */
  boundedBy?: string;
}

export interface SettingDeclaration {
  /** Stable key, unique within its group; never created through an interface. */
  key: string;
  label: string;
  description: string;
  type: SettingType;
  bounds: SettingBounds;
  /** The value used when nothing has been stored. Validated against the declaration. */
  default: boolean | number | string;
  /** `public` values may appear in a public API response; `private` never leave the admin API. */
  visibility: 'public' | 'private';
  /** Whether a change takes effect on the next request or needs a process restart. */
  effect: 'runtime' | 'restart_required';
  /** Always false: a sensitive value belongs in environment configuration (SET 004). */
  sensitive: false;
  viewPermission: PermissionKey;
  updatePermission: PermissionKey;
  /** Cache tags or namespaces a change invalidates (SET 002/003); empty when a change caches nothing. */
  invalidates: readonly string[];
  /** Where the value is actually enforced. Required — see SET 005. */
  enforcedBy: string;
  /** Stated when the change has a consequence an operator must be warned about (SECS 006). */
  consequence?: string;
  /**
   * What the number counts, shown beside the input. An administrator must never
   * have to guess whether 30 means seconds, minutes or days.
   */
  unit?: SettingUnit;
  /**
   * The bound in words an administrator can act on. `boundedBy` records *which*
   * requirement fixes the bound and is deliberately internal: a specification
   * code on screen tells the reader nothing they can use.
   */
  limitNote?: string;
}

export interface SettingGroupDeclaration {
  key: SettingGroupKey;
  label: string;
  description: string;
  /** The server module that owns reads, writes and invariants for this group. */
  owner: string;
  /** Row key within the shared `settings` table; the group name is the other half of the key. */
  storeKey: string;
  viewPermission: PermissionKey;
  updatePermission: PermissionKey;
  settings: readonly SettingDeclaration[];
  /** Optional owned cross-field/domain validation, never serialized to clients. */
  validate?: (values: Record<string, boolean | number | string>) => Record<string, string>;
  /** Explains an intentionally empty group so "not yet" is never read as "forgotten". */
  note?: string;
}

export const SETTING_GROUPS: readonly SettingGroupDeclaration[] = [
  AI_CONTENT_SETTINGS,
  {
    key: 'security',
    label: 'Security',
    description: 'Authentication, password policy, login security and session settings.',
    owner: 'AuthModule (SecurityPolicyService)',
    storeKey: 'security',
    viewPermission: 'security.settings.view',
    updatePermission: 'security.settings.update',
    // Every bound below may narrow what AUTH 001/002 and SEC 002 specify and
    // can never widen it, which is why each carries `boundedBy`. Nothing here is
    // stored without being enforced (SECS 001): `enforcedBy` names the code.
    settings: [
      {
        key: 'sessionIdleMinutes',
        label: 'Sign out after inactivity',
        description: 'Administrators are signed out after this period without activity.',
        type: 'integer',
        bounds: { min: 5, max: 30, boundedBy: 'AUTH 002 (30 minute default; may be narrowed, never widened)' },
        unit: 'minutes',
        limitNote: 'For security, this cannot be longer than 30 minutes.',
        default: 30,
        visibility: 'private',
        effect: 'runtime',
        sensitive: false,
        viewPermission: 'security.settings.view',
        updatePermission: 'security.settings.update',
        invalidates: [],
        enforcedBy: 'auth/session.service.ts (validate)',
        consequence: 'Administrators idle for longer than the new limit are signed out on their next request.',
      },
      {
        key: 'sessionAbsoluteHours',
        label: 'Maximum session duration',
        description: 'A session ends after this total time, even when the administrator remains active.',
        type: 'integer',
        bounds: { min: 1, max: 12, boundedBy: 'AUTH 002 (12 hour default; may be narrowed, never widened)' },
        unit: 'hours',
        limitNote: 'For security, a session cannot last longer than 12 hours.',
        default: 12,
        visibility: 'private',
        effect: 'runtime',
        sensitive: false,
        viewPermission: 'security.settings.view',
        updatePermission: 'security.settings.update',
        invalidates: [],
        enforcedBy: 'auth/session.service.ts (validate)',
        consequence: 'Sessions already older than the new limit end on their next request.',
      },
      {
        key: 'maxConcurrentSessions',
        label: 'Concurrent sessions per administrator',
        description: 'When the limit is reached, the oldest active session is ended.',
        type: 'integer',
        bounds: { min: 1, max: 10 },
        unit: 'sessions',
        default: 10,
        visibility: 'private',
        effect: 'runtime',
        sensitive: false,
        viewPermission: 'security.settings.view',
        updatePermission: 'security.settings.update',
        invalidates: [],
        enforcedBy: 'auth/session.service.ts (create)',
        consequence: 'Administrators over the new limit have their oldest sessions ended immediately.',
      },
      {
        key: 'passwordResetMinutes',
        label: 'Password reset link expires after',
        description: 'Reset links can be used once and expire after this period.',
        type: 'integer',
        bounds: { min: 5, max: 30, boundedBy: 'AUTH 001 (30 minutes; single use; may be narrowed, never widened)' },
        unit: 'minutes',
        limitNote: 'For security, a reset link cannot last longer than 30 minutes.',
        default: 30,
        visibility: 'private',
        effect: 'runtime',
        sensitive: false,
        viewPermission: 'security.settings.view',
        updatePermission: 'security.settings.update',
        invalidates: [],
        enforcedBy: 'auth/auth.service.ts (forgotPassword)',
      },
      {
        key: 'passwordMinLength',
        label: 'Minimum password length',
        description: 'New passwords must contain at least this many characters.',
        type: 'integer',
        bounds: { min: 12, max: 64, boundedBy: 'AUTH 001 (12 characters; may be raised, never lowered)' },
        unit: 'characters',
        limitNote: 'For security, this cannot be lower than 12 characters.',
        default: 12,
        visibility: 'private',
        effect: 'runtime',
        sensitive: false,
        viewPermission: 'security.settings.view',
        updatePermission: 'security.settings.update',
        invalidates: [],
        enforcedBy: 'auth/password.service.ts (validateWithPolicy)',
        consequence: 'Applies at the next password change. Passwords already in use keep working.',
      },
      {
        key: 'passwordHistoryDepth',
        label: 'Earlier passwords that cannot be reused',
        description: 'The current password can never be chosen again; this many passwords before it are refused too. Zero refuses only the current password.',
        type: 'integer',
        bounds: { min: 0, max: 10 },
        unit: 'passwords',
        default: 3,
        visibility: 'private',
        effect: 'runtime',
        sensitive: false,
        viewPermission: 'security.settings.view',
        updatePermission: 'security.settings.update',
        invalidates: [],
        enforcedBy: 'auth/password-history.service.ts (assertNotReused)',
      },
      {
        key: 'loginMaxFailedAttempts',
        label: 'Failed sign-ins before temporary lock',
        description: 'Additional sign-in attempts are temporarily blocked after this number of failures.',
        type: 'integer',
        bounds: { min: 3, max: 5, boundedBy: 'SEC 002 (5 per 15 minutes; may be stricter, never looser, and never disabled)' },
        unit: 'attempts',
        limitNote: 'For security, sign-in protection cannot be switched off or set above 5 attempts.',
        default: 5,
        visibility: 'private',
        effect: 'runtime',
        sensitive: false,
        viewPermission: 'security.settings.view',
        updatePermission: 'security.settings.update',
        invalidates: [],
        enforcedBy: 'auth/login-throttle.service.ts (check/record)',
      },
      {
        key: 'loginBlockMinutes',
        label: 'Temporary lock duration',
        description: 'How long further sign-in attempts are refused once the limit is reached.',
        type: 'integer',
        bounds: { min: 15, max: 60, boundedBy: 'SEC 002 (15 minute window; may be longer, never shorter)' },
        unit: 'minutes',
        limitNote: 'For security, a lock cannot be shorter than 15 minutes.',
        default: 15,
        visibility: 'private',
        effect: 'runtime',
        sensitive: false,
        viewPermission: 'security.settings.view',
        updatePermission: 'security.settings.update',
        invalidates: [],
        enforcedBy: 'auth/login-throttle.service.ts (check/record)',
      },
    ],
    note: 'Two-factor authentication is available to administrators individually. Requiring it for everyone is not switched on, and no setting for it is shown here until the server can enforce it.',
  },
  {
    key: 'email',
    label: 'Email',
    description: 'Transactional email behaviour. The provider API key, signing secret and transport credentials are environment-managed and are not settings (SET 004).',
    owner: 'IntegrationsModule',
    storeKey: 'email',
    viewPermission: 'system.settings.view',
    updatePermission: 'system.settings.update',
    settings: [],
    note: 'Non-secret sender and delivery-record behaviour lands with the transactional email provider phase (MAIL 001–010).',
  },
  {
    key: 'operations',
    label: 'Operations',
    description: 'Cache, queue and scheduled task operational behaviour.',
    owner: 'OperationsModule',
    storeKey: 'operations',
    viewPermission: 'system.settings.view',
    updatePermission: 'system.settings.update',
    settings: [],
    note: 'Settings land with the cache manager, queue monitor and scheduled task phases (CMGR/QMON/TASK). Registries of namespaces, queues and tasks stay in code and are never settings.',
  },
  {
    key: 'website',
    label: 'Website',
    description: 'Public site identity, branding, contact details and home page content (CFG 001).',
    owner: 'SettingsModule',
    // The website group holds two documents (`home` and `general`), each with
    // its own richer validator in SettingsService; `general` is the one the
    // registry names. Both are written through the same shared store path.
    storeKey: 'general',
    viewPermission: 'settings.general.view',
    updatePermission: 'settings.general.update',
    settings: [],
    note: 'Validated by SettingsService (`home-settings.ts`, `general-settings.ts`), whose rules are richer than a declaration list can express; persistence, versioning, audit and cache invalidation are the shared settings path.',
  },
];

export function settingGroup(key: SettingGroupKey): SettingGroupDeclaration {
  const group = SETTING_GROUPS.find((candidate) => candidate.key === key);
  if (!group) throw new Error(`unknown setting group: ${key}`);
  return group;
}

export function isSettingGroupKey(value: string): value is SettingGroupKey {
  return (SETTING_GROUP_KEYS as readonly string[]).includes(value);
}

/** The declared defaults for a group, used when nothing has been stored (SET 002). */
export function groupDefaults(group: SettingGroupDeclaration): Record<string, boolean | number | string> {
  return Object.fromEntries(group.settings.map((setting) => [setting.key, setting.default]));
}

export interface ValidationOutcome {
  errors: Record<string, string>;
  value: Record<string, boolean | number | string>;
}

/**
 * Validates a submitted group payload against its declarations (SET 003).
 * Unknown keys are rejected rather than ignored, so a typo cannot silently
 * leave the intended setting unchanged; a missing key keeps the stored value.
 */
export function validateGroupPayload(
  group: SettingGroupDeclaration,
  input: Record<string, unknown>,
  current: Record<string, boolean | number | string>,
): ValidationOutcome {
  const errors: Record<string, string> = {};
  const value: Record<string, boolean | number | string> = { ...groupDefaults(group), ...current };

  for (const key of Object.keys(input)) {
    if (!group.settings.some((setting) => setting.key === key)) {
      errors[key] = 'Unknown setting';
    }
  }

  for (const setting of group.settings) {
    if (!Object.prototype.hasOwnProperty.call(input, setting.key)) continue;
    const raw = input[setting.key];
    const outcome = validateSettingValue(setting, raw);
    if (outcome.error) errors[setting.key] = outcome.error;
    else value[setting.key] = outcome.value as boolean | number | string;
  }

  Object.assign(errors, group.validate?.(value));
  return { errors, value };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSettingValue(setting: SettingDeclaration, raw: unknown): { value?: boolean | number | string; error?: string } {
  switch (setting.type) {
    case 'boolean':
      if (typeof raw !== 'boolean') return { error: 'Must be true or false' };
      return { value: raw };

    case 'integer': {
      if (typeof raw !== 'number' || !Number.isInteger(raw)) return { error: 'Must be a whole number' };
      const { min, max } = setting.bounds;
      if (min !== undefined && raw < min) return { error: `Must be ${min} or more` };
      if (max !== undefined && raw > max) return { error: `Must be ${max} or less` };
      return { value: raw };
    }

    case 'enum': {
      if (typeof raw !== 'string') return { error: 'Must be one of the permitted values' };
      if (!setting.bounds.values?.includes(raw)) return { error: 'Must be one of the permitted values' };
      return { value: raw };
    }

    case 'string':
    case 'email':
    case 'url': {
      if (typeof raw !== 'string') return { error: 'Must be text' };
      const trimmed = raw.trim();
      const { min, max } = setting.bounds;
      if (min !== undefined && trimmed.length < min) return { error: `Must be at least ${min} characters` };
      if (max !== undefined && trimmed.length > max) return { error: `Must be ${max} characters or fewer` };
      if (setting.type === 'email' && trimmed !== '' && !EMAIL_PATTERN.test(trimmed)) return { error: 'Must be a valid email address' };
      if (setting.type === 'url' && trimmed !== '') {
        let parsed: URL;
        try {
          parsed = new URL(trimmed);
        } catch {
          return { error: 'Must be a valid URL' };
        }
        // Scheme allowlist at write time, never a render-time string test (SEC 001).
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { error: 'Must be an http or https URL' };
      }
      return { value: trimmed };
    }

    default: {
      const exhaustive: never = setting.type;
      return { error: `Unsupported setting type: ${String(exhaustive)}` };
    }
  }
}

/**
 * The registry as the admin interface consumes it (SET 002). Metadata only:
 * it carries no stored value, so it can never disclose one, and it is the
 * contract the settings screens build their forms from.
 */
export interface SettingGroupMetadataDto {
  key: SettingGroupKey;
  label: string;
  description: string;
  owner: string;
  viewPermission: string;
  updatePermission: string;
  note: string | null;
  settings: {
    key: string;
    label: string;
    description: string;
    type: SettingType;
    /** `boundedBy` is stripped: it justifies the bound to us, it does not help an administrator. */
    bounds: Omit<SettingBounds, 'boundedBy'>;
    unit: SettingUnit | null;
    limitNote: string | null;
    default: boolean | number | string;
    visibility: 'public' | 'private';
    effect: 'runtime' | 'restart_required';
    viewPermission: string;
    updatePermission: string;
    invalidates: readonly string[];
    consequence: string | null;
  }[];
}

export function registryMetadata(): SettingGroupMetadataDto[] {
  return SETTING_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    description: group.description,
    owner: group.owner,
    viewPermission: group.viewPermission,
    updatePermission: group.updatePermission,
    note: group.note ?? null,
    settings: group.settings.map((setting) => ({
      key: setting.key,
      label: setting.label,
      description: setting.description,
      type: setting.type,
      bounds: { min: setting.bounds.min, max: setting.bounds.max, values: setting.bounds.values },
      unit: setting.unit ?? null,
      limitNote: setting.limitNote ?? null,
      default: setting.default,
      visibility: setting.visibility,
      effect: setting.effect,
      viewPermission: setting.viewPermission,
      updatePermission: setting.updatePermission,
      invalidates: setting.invalidates,
      consequence: setting.consequence ?? null,
    })),
  }));
}
