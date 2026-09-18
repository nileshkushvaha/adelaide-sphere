import type { PermissionKey } from '../identity/permissions.js';

/**
 * The activity event catalogue (SRS 1.2 ACT 001–002).
 *
 * There is one activity surface, not three: administrative actions,
 * authorization changes and operational events all land in `audit_logs`, and
 * this catalogue is what turns a stored action code into something an operator
 * can filter and read — a category, a human label and an outcome.
 *
 * Codes are `<domain>.<action>` and are declared here by domain rather than one
 * entry per code. That is deliberate: a per-code list of ~80 entries would have
 * to be edited in lockstep with every call site, would drift the first time it
 * was not, and would add nothing over the domain, which is what the interface
 * actually groups and filters by. What matters — that a caller cannot invent an
 * unregistered event — is enforced by `activity-catalogue.spec.ts`, which reads
 * every audit call in the source and fails on a domain that is not declared
 * here.
 */
export const ACTIVITY_CATEGORIES = ['authentication', 'access_control', 'content', 'moderation', 'communication', 'configuration', 'system'] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

/**
 * The permission that shows each area of the log (change log 1.14). Events from
 * an unregistered domain belong to `system`, so nothing is ever unreadable.
 */
export const ACTIVITY_VIEW_PERMISSION = {
  authentication: 'activity.authentication.view',
  access_control: 'activity.access_control.view',
  content: 'activity.content.view',
  moderation: 'activity.moderation.view',
  communication: 'activity.communication.view',
  configuration: 'activity.configuration.view',
  system: 'activity.system.view',
} as const satisfies Record<ActivityCategory, PermissionKey>;

/** The areas of the log a set of effective permissions may read. */
export function categoriesVisibleTo(permissions: readonly string[]): ActivityCategory[] {
  return ACTIVITY_CATEGORIES.filter((category) => permissions.includes(ACTIVITY_VIEW_PERMISSION[category]));
}

export interface ActivityDomain {
  category: ActivityCategory;
  /** What this domain covers, shown as the group name in the interface. */
  label: string;
}

export const ACTIVITY_DOMAINS = {
  ai_content: { category: 'content', label: 'AI topic administration' },
  auth: { category: 'authentication', label: 'Sign-in and account security' },
  admin: { category: 'access_control', label: 'Administrator accounts' },
  authz: { category: 'access_control', label: 'Roles and permissions' },
  listing: { category: 'content', label: 'Business listings' },
  taxonomy: { category: 'content', label: 'Categories, services and areas' },
  blog: { category: 'content', label: 'Editorial' },
  media: { category: 'content', label: 'Media' },
  settings: { category: 'configuration', label: 'Settings' },
  seo: { category: 'configuration', label: 'SEO and redirects' },
  review: { category: 'moderation', label: 'Reviews' },
  comment: { category: 'moderation', label: 'Comments' },
  report: { category: 'moderation', label: 'Abuse reports' },
  enquiry: { category: 'communication', label: 'Enquiries' },
  email: { category: 'communication', label: 'Transactional email' },
  website: { category: 'content', label: 'Website content' },
  system: { category: 'system', label: 'Operations' },
} as const satisfies Record<string, ActivityDomain>;

export type ActivityDomainKey = keyof typeof ACTIVITY_DOMAINS;

export function isActivityDomain(value: string): value is ActivityDomainKey {
  return Object.prototype.hasOwnProperty.call(ACTIVITY_DOMAINS, value);
}

/**
 * Outcome of an event (ACT 002). Derived from the code rather than stored,
 * because the codes already say it and a second stored field could disagree
 * with the first.
 */
export type ActivityOutcome = 'success' | 'failure';

/**
 * Suffixes that mark a refused or failed event. Exported so the database filter
 * and the derivation agree by construction rather than by being kept in step.
 */
export const ACTIVITY_FAILURE_SUFFIXES = ['failure', 'failed', 'refused', 'rejected', 'denied', 'challenge_failed'] as const;

const FAILURE_SUFFIX = new RegExp(`(?:^|\\.)(${ACTIVITY_FAILURE_SUFFIXES.join('|')})$`);

export interface ActivityDescription {
  domain: ActivityDomainKey | null;
  category: ActivityCategory | 'unknown';
  domainLabel: string;
  outcome: ActivityOutcome;
}

export function describeActivity(action: string): ActivityDescription {
  const domain = action.split('.')[0] ?? '';
  const outcome: ActivityOutcome = FAILURE_SUFFIX.test(action) ? 'failure' : 'success';
  if (!isActivityDomain(domain)) {
    // An unregistered domain is shown, never hidden: losing an event would be
    // worse than showing one the catalogue has not caught up with.
    return { domain: null, category: 'unknown', domainLabel: domain || 'unknown', outcome };
  }
  const declaration = ACTIVITY_DOMAINS[domain] as ActivityDomain;
  return { domain, category: declaration.category, domainLabel: declaration.label, outcome };
}

/** Action prefixes that belong to a category, used to filter without a stored column. */
export function domainsInCategory(category: ActivityCategory): ActivityDomainKey[] {
  return (Object.keys(ACTIVITY_DOMAINS) as ActivityDomainKey[]).filter((key) => (ACTIVITY_DOMAINS[key] as ActivityDomain).category === category);
}

/**
 * Retention for activity events (ACT 006, PRIV 001): 365 days from the event.
 * The scheduled job that applies it is registered with the scheduled tasks
 * module; the bound lives here so both agree.
 */
export const ACTIVITY_RETENTION_DAYS = 365;
