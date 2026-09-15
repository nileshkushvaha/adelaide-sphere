/**
 * How a stored activity code reads on screen.
 *
 * Two screens show the same events — the dashboard's recent-activity list and
 * the activity log — and each had grown its own way of turning `auth.login.
 * success` into English. Two renderings of one code is a small thing that reads
 * as a bug the first time someone compares them, so both now call this.
 *
 * Nothing here invents meaning: a code with no entry falls back to its own
 * words, which is stilted but always true to what was recorded.
 */

/** Codes whose plain reading is not derivable from their words. */
const EXACT: Record<string, string> = {
  'auth.login.success': 'Signed in',
  'auth.login.failure': 'Failed sign-in',
  'auth.logout': 'Signed out',
  'auth.password_reset.requested': 'Password reset requested',
  'auth.password_reset.completed': 'Password reset completed',
  'system.queue.pause': 'Queue paused',
  'system.queue.retry': 'Job retried',
  'system.queue.cancel': 'Job removed',
  'system.cache.invalidate': 'Cache cleared',
  'website.menu.location.assign': 'Menu location changed',
};

/** The trailing word of a code, in the tense an operator would use for it. */
const VERBS: Record<string, string> = {
  create: 'Created',
  created: 'Created',
  update: 'Updated',
  updated: 'Updated',
  delete: 'Deleted',
  deleted: 'Deleted',
  approve: 'Approved',
  reject: 'Rejected',
  publish: 'Published',
  unpublish: 'Unpublished',
  submitted: 'Submitted',
  accepted: 'Accepted',
  retry: 'Retried',
  redact: 'Redacted',
  reveal: 'Read in full',
  investigate: 'Investigating',
  resolve: 'Resolved',
  disable: 'Disabled',
  enable: 'Enabled',
  failed: 'Failed',
  denied: 'Refused',
};

function sentence(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * @param action the stored code, e.g. `enquiry.contact.reveal`.
 * @param withDomain whether the first segment belongs in the words. The activity
 *   log shows the area in its own column and would otherwise say it twice; the
 *   dashboard's one-line list has nowhere else to put it.
 */
export function readableAction(action: string, { withDomain = false }: { withDomain?: boolean } = {}): string {
  const exact = EXACT[action];
  if (exact) return exact;
  const parts = action.split('.');
  const rest = withDomain ? parts : parts.slice(1);
  if (rest.length === 0) return sentence(action.replace(/[._]/g, ' '));
  const last = rest[rest.length - 1]!;
  const verb = VERBS[last];
  if (!verb) return sentence(rest.join(' ').replace(/_/g, ' '));
  const subject = rest.slice(0, -1).join(' ').replace(/_/g, ' ');
  return subject ? `${sentence(subject)} — ${verb.toLowerCase()}` : verb;
}

/** A stored type name as a reader would say it: `abuse_report` → "Abuse report". */
export function readableTargetType(value: string): string {
  return sentence(value.replace(/[._]/g, ' '));
}

// ---- The activity timeline (change log 1.14) -------------------------------

/** Short area names for chips and row captions; the server's `domainLabel` is the longer form. */
export const ACTIVITY_AREA_LABELS: Record<string, string> = {
  authentication: 'Sign-in',
  access_control: 'Access',
  content: 'Content',
  moderation: 'Moderation',
  communication: 'Communication',
  configuration: 'Configuration',
  system: 'System',
  unknown: 'Other',
};

/**
 * One event, or one group of repeated events, in the shape the timeline draws.
 * The activity log and the dashboard both map into it, so a row reads the same
 * on both screens.
 */
export interface ActivityItem {
  id: string;
  action: string;
  category?: string | null;
  domainLabel?: string | null;
  outcome?: 'success' | 'failure' | null;
  actorName: string | null;
  actorEmail?: string | null;
  targetType: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  metadata?: Record<string, unknown> | null;
  reason?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  count?: number;
  firstAt?: string;
  lastAt?: string;
  groupKey?: string | null;
}

const NOUNS: Record<string, [string, string]> = {
  admin_user: ['administrator', 'administrators'],
  admin_session: ['session', 'sessions'],
  abuse_report: ['abuse report', 'abuse reports'],
  blog_category: ['blog category', 'blog categories'],
  blog_tag: ['blog tag', 'blog tags'],
  business: ['business', 'businesses'],
  cache_namespace: ['cache', 'caches'],
  cache_tag: ['cache tag', 'cache tags'],
  category: ['category', 'categories'],
  email_delivery: ['email', 'emails'],
  faq: ['FAQ', 'FAQs'],
  local_area: ['local area', 'local areas'],
  media_asset: ['image', 'images'],
  menu_location: ['menu location', 'menu locations'],
  partner_organisation: ['client or partner', 'clients or partners'],
  scheduled_task: ['scheduled task', 'scheduled tasks'],
  security_settings: ['security settings', 'security settings'],
  service_alert: ['service alert', 'service alerts'],
  setting: ['setting', 'settings'],
  static_page: ['page', 'pages'],
};

/** What a stored target type is called in a sentence: `media_asset` → "image". */
export function targetNoun(type: string, count = 1): string {
  const known = NOUNS[type];
  if (known) return count === 1 ? known[0] : known[1];
  const base = type.replace(/[._]/g, ' ').toLowerCase();
  if (count === 1) return base;
  return base.endsWith('y') ? `${base.slice(0, -1)}ies` : base.endsWith('s') ? base : `${base}s`;
}

const HREFS: Record<string, (id: string) => string> = {
  admin_user: (id) => `/admins/${id}`,
  author: (id) => `/authors/${id}`,
  blog_category: (id) => `/blog-categories/${id}`,
  blog_tag: (id) => `/blog-tags/${id}`,
  business: (id) => `/businesses/${id}`,
  category: (id) => `/categories/${id}`,
  faq: (id) => `/website/faqs/${id}`,
  local_area: (id) => `/areas/${id}`,
  media_asset: (id) => `/media/${id}`,
  partner_organisation: (id) => `/website/partners/${id}`,
  permission: () => '/permissions',
  post: (id) => `/posts/${id}`,
  role: (id) => `/roles/${id}`,
  service: (id) => `/services/${id}`,
  service_alert: (id) => `/website/service-alerts/${id}`,
  testimonial: (id) => `/website/testimonials/${id}`,
};

/** Where the record an event was done to can be opened, if it has a screen of its own. */
export function activityTargetHref(type: string | null | undefined, id: string | null | undefined): string | null {
  return type && id && HREFS[type] ? HREFS[type](encodeURIComponent(id)) : null;
}

/** A piece of an event's sentence: plain words, or the record's name (linked where it has a screen). */
export type SentencePart = string | { strong: string; href?: string | null };

/** Who did it, as the sentence starts. */
export function activitySubject(entry: ActivityItem): string {
  if (entry.actorName) return entry.actorName;
  return entry.outcome === 'failure' && entry.action.startsWith('auth.') ? 'Someone' : 'The system';
}

/** Verbs as they read after a name: "Dev Admin published …". */
const PAST: Record<string, string> = {
  activate: 'activated',
  approve: 'approved',
  archive: 'archived',
  assign: 'assigned',
  authorise: 'authorised',
  cancel: 'cancelled',
  clean: 'cleaned up',
  clear: 'cleared',
  complete: 'completed',
  completed: 'completed',
  create: 'created',
  created: 'created',
  deactivate: 'deactivated',
  delete: 'deleted',
  deleted: 'deleted',
  disable: 'disabled',
  enable: 'enabled',
  feature: 'featured',
  invalidate: 'cleared',
  investigate: 'started investigating',
  pause: 'paused',
  publish: 'published',
  redact: 'edited the published text of',
  reject: 'rejected',
  remove: 'removed',
  reorder: 'reordered',
  reply: 'replied to',
  resend: 'resent',
  resolve: 'resolved',
  restore: 'restored',
  resume: 'resumed',
  retry: 'retried',
  reveal: 'viewed the contact details of',
  revoke: 'revoked',
  run: 'ran',
  schedule: 'scheduled',
  slug: 'changed the address of',
  spam: 'marked as spam',
  unfeature: 'unfeatured',
  unpublish: 'unpublished',
  update: 'updated',
  updated: 'updated',
  upload: 'uploaded',
};

const article = (noun: string) => (/^[aeiou]/i.test(noun) && !/^FAQ/.test(noun) ? `an ${noun}` : `a ${noun}`);

function listCount(value: unknown): number {
  if (typeof value !== 'string' || value === '' || value === 'none') return 0;
  return value.split(',').filter(Boolean).length;
}

/** " (2 added, 1 removed)" from the added/removed lists authorization events record. */
function changeNote(metadata: Record<string, unknown>): string {
  const added = listCount(metadata.added);
  const removed = listCount(metadata.removed);
  const parts = [added ? `${added} added` : null, removed ? `${removed} removed` : null].filter(Boolean);
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

/**
 * An event as a sentence without its subject: "published business **Laneway
 * Café**". The record's name comes from the server and only where it is not
 * private; otherwise the sentence names the kind of record and nothing more.
 */
export function activitySentence(entry: ActivityItem): SentencePart[] {
  const count = entry.count ?? 1;
  const metadata = entry.metadata ?? {};
  const href = activityTargetHref(entry.targetType, entry.targetId);
  const named: SentencePart | null = entry.targetLabel ? { strong: entry.targetLabel, href } : null;
  const times = (words: string) => (count > 1 ? `${words} ${count} times` : words);
  const about = (words: string, fallbackNoun: string, suffix = ''): SentencePart[] =>
    named ? [`${words} `, named, suffix] : [`${words} ${article(fallbackNoun)}${suffix}`];

  switch (entry.action) {
    case 'auth.login.success':
      return [times('signed in')];
    case 'auth.login.failure':
      return [times('failed to sign in')];
    case 'auth.logout':
      return [times('signed out')];
    case 'auth.password_reset.requested':
      return ['asked for a password reset'];
    case 'auth.password_reset.completed':
      return ['reset their password'];
    case 'authz.permission.migrated':
      return count > 1 ? ['gave existing holders ', { strong: `${count} new permissions` }] : about('gave existing holders the new permission', 'permission');
    case 'authz.role.permissions':
      return about('changed the permissions of role', 'role', changeNote(metadata));
    case 'authz.role.create':
      return about('created role', 'role');
    case 'authz.role.update':
      return about('edited role', 'role');
    case 'authz.role.delete':
      return typeof metadata.name === 'string' ? ['deleted role ', { strong: metadata.name }] : ['deleted a role'];
    case 'authz.admin.roles':
      return about('changed the roles of', 'administrator', changeNote(metadata));
    case 'authz.admin.permissions':
      return about('changed the direct permissions of', 'administrator', changeNote(metadata));
  }

  const segments = entry.action.split('.');
  const last = segments[segments.length - 1] ?? '';
  const verb = PAST[last];
  const noun = entry.targetType ? targetNoun(entry.targetType) : segments.slice(1, -1).join(' ').replace(/_/g, ' ');
  if (!verb) {
    const recorded = `recorded “${readableAction(entry.action, { withDomain: true })}”`;
    return named ? [`${recorded} for `, named] : [count > 1 ? `${recorded} ${count} times` : recorded];
  }
  if (count > 1) return [`${verb} `, { strong: `${count} ${entry.targetType ? targetNoun(entry.targetType, count) : `${noun} records`}` }];
  if (named) return [`${verb} ${noun} `, named];
  return [noun ? `${verb} ${article(noun)}` : verb];
}

const METADATA_LABELS: Record<string, string> = {
  added: 'Added',
  afterActive: 'Active after',
  afterName: 'Name after',
  beforeActive: 'Active before',
  beforeName: 'Name before',
  count: 'Total now',
  directGrants: 'Administrators given it directly',
  from: 'Copied from',
  key: 'Code',
  name: 'Name',
  permissionCount: 'Permissions',
  permissions: 'Permissions',
  removed: 'Removed',
  roles: 'Roles given it',
  slug: 'Address',
};

/** A recorded metadata value as text, for display and for comparing members of a group. */
export function metadataText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** A recorded metadata key as a reader would say it. */
export function metadataLabel(key: string): string {
  return METADATA_LABELS[key] ?? readableTargetType(key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase());
}

const ADELAIDE = 'Australia/Adelaide';
const dayKeyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: ADELAIDE, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayHeadingFormat = new Intl.DateTimeFormat('en-AU', { timeZone: ADELAIDE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('en-AU', { timeZone: ADELAIDE, hour: 'numeric', minute: '2-digit' });

/** The Adelaide calendar day of an instant, `YYYY-MM-DD`. */
export function adelaideDayKey(value: string | Date): string {
  return dayKeyFormat.format(new Date(value));
}

/** "Today", "Yesterday", or "Mon, 14 Sept 2026" for a Adelaide day key. */
export function dayHeading(key: string, now: Date = new Date()): string {
  if (key === adelaideDayKey(now)) return 'Today';
  if (key === adelaideDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))) return 'Yesterday';
  return dayHeadingFormat.format(new Date(`${key}T12:00:00Z`));
}

/** "2:53 pm" in Adelaide time. */
export function adelaideTime(value: string): string {
  return timeFormat.format(new Date(value));
}

/** "from 2:53 pm to 2:58 pm" for a group that spans more than one minute; null otherwise. */
export function timeSpan(firstAt: string | undefined, lastAt: string | undefined): string | null {
  if (!firstAt || !lastAt) return null;
  const first = adelaideTime(firstAt);
  const last = adelaideTime(lastAt);
  return first === last ? null : `from ${first} to ${last}`;
}
