/**
 * Typed permission codes and the canonical resource → permission mapping (SRS
 * RBAC 010). The server calculates and enforces access; this file exists so no
 * component compares raw strings, and so a new screen has exactly one place to
 * declare what it needs.
 *
 * Keep in step with `apps/api/src/identity/permissions.ts`, where every code
 * names the sidebar item it belongs to (change log 1.13). The contract test in
 * `permissions.test.ts` fails if the API's catalogue gains a code this list does
 * not know, so the two cannot drift silently.
 */
export const PERMISSION = {
  aiContentView: 'ai_content.view',
  aiContentManageTopics: 'ai_content.manage_topics',
  aiContentReview: 'ai_content.review',
  aiContentGenerate: 'ai_content.generate',
  aiContentApprove: 'ai_content.approve',
  aiContentConfigure: 'ai_content.configure',
  // Business
  listingsRead: 'listings.read',
  listingsCreate: 'listings.create',
  listingsUpdate: 'listings.update',
  listingsPublish: 'listings.publish',
  featuredView: 'featured.view',
  featuredManage: 'featured.manage',
  categoriesView: 'categories.view',
  categoriesCreate: 'categories.create',
  categoriesUpdate: 'categories.update',
  servicesView: 'services.view',
  servicesCreate: 'services.create',
  servicesUpdate: 'services.update',
  areasView: 'areas.view',
  areasCreate: 'areas.create',
  areasUpdate: 'areas.update',

  // Editorial
  postsView: 'posts.view',
  postsCreate: 'posts.create',
  postsUpdate: 'posts.update',
  postsPublish: 'posts.publish',
  postsFeature: 'posts.feature',
  authorsView: 'authors.view',
  authorsCreate: 'authors.create',
  authorsUpdate: 'authors.update',
  blogCategoriesView: 'blog_categories.view',
  blogCategoriesCreate: 'blog_categories.create',
  blogCategoriesUpdate: 'blog_categories.update',
  blogTagsView: 'blog_tags.view',
  blogTagsCreate: 'blog_tags.create',
  blogTagsUpdate: 'blog_tags.update',
  mediaView: 'media.view',
  mediaUpload: 'media.upload',
  mediaUpdate: 'media.update',
  mediaDelete: 'media.delete',
  mediaDocumentsUpload: 'media.documents.upload',

  // Community
  enquiriesRead: 'enquiries.read',
  enquiriesManage: 'enquiries.manage',
  enquiriesRetry: 'enquiries.retry',
  enquiriesContactView: 'enquiries.contact.view',
  reviewsView: 'reviews.view',
  reviewsModerate: 'reviews.moderate',
  reviewsRedact: 'reviews.redact',
  reviewsEmailView: 'reviews.email.view',
  commentsView: 'comments.view',
  commentsModerate: 'comments.moderate',
  commentsRedact: 'comments.redact',
  commentsReply: 'comments.reply',
  commentsEmailView: 'comments.email.view',
  reportsView: 'reports.view',
  reportsManage: 'reports.manage',
  reportsEmailView: 'reports.email.view',

  // Configuration
  settingsGeneralView: 'settings.general.view',
  settingsGeneralUpdate: 'settings.general.update',
  settingsHomeView: 'settings.home.view',
  settingsHomeUpdate: 'settings.home.update',
  settingsSeoView: 'settings.seo.view',
  settingsSeoUpdate: 'settings.seo.update',
  redirectsView: 'redirects.view',
  redirectsCreate: 'redirects.create',
  redirectsUpdate: 'redirects.update',
  redirectsDelete: 'redirects.delete',
  adminsView: 'admins.view',
  adminsCreate: 'admins.create',
  adminsUpdate: 'admins.update',
  adminsStatus: 'admins.status',
  adminsAccessManage: 'admins.access.manage',
  securitySessionsView: 'security.sessions.view',
  securitySessionsRevoke: 'security.sessions.revoke',
  rolesView: 'roles.view',
  rolesCreate: 'roles.create',
  rolesUpdate: 'roles.update',
  rolesDelete: 'roles.delete',
  permissionsView: 'permissions.view',
  // The activity log, one code per area (change log 1.14).
  activityAuthenticationView: 'activity.authentication.view',
  activityAccessControlView: 'activity.access_control.view',
  activityContentView: 'activity.content.view',
  activityModerationView: 'activity.moderation.view',
  activityCommunicationView: 'activity.communication.view',
  activityConfigurationView: 'activity.configuration.view',
  activitySystemView: 'activity.system.view',

  // Website
  websitePagesView: 'website.pages.view',
  websitePagesCreate: 'website.pages.create',
  websitePagesUpdate: 'website.pages.update',
  websitePagesPublish: 'website.pages.publish',
  websitePagesDelete: 'website.pages.delete',
  websiteMenusView: 'website.menus.view',
  websiteMenusManage: 'website.menus.manage',
  websiteMenusAssign: 'website.menus.assign',
  websiteFaqsView: 'website.faqs.view',
  websiteFaqsCreate: 'website.faqs.create',
  websiteFaqsUpdate: 'website.faqs.update',
  websiteFaqsPublish: 'website.faqs.publish',
  websiteFaqsDelete: 'website.faqs.delete',
  websiteAlertsView: 'website.alerts.view',
  websiteAlertsCreate: 'website.alerts.create',
  websiteAlertsUpdate: 'website.alerts.update',
  websiteAlertsPublish: 'website.alerts.publish',
  websiteAlertsDelete: 'website.alerts.delete',
  websiteTestimonialsView: 'website.testimonials.view',
  websiteTestimonialsCreate: 'website.testimonials.create',
  websiteTestimonialsUpdate: 'website.testimonials.update',
  websiteTestimonialsPublish: 'website.testimonials.publish',
  websiteTestimonialsDelete: 'website.testimonials.delete',
  websiteClientsView: 'website.clients.view',
  websiteClientsCreate: 'website.clients.create',
  websiteClientsUpdate: 'website.clients.update',
  websiteClientsApprove: 'website.clients.approve',
  websiteClientsPublish: 'website.clients.publish',
  websiteClientsDelete: 'website.clients.delete',

  // Security (SECS 001–008)
  securitySettingsView: 'security.settings.view',
  securitySettingsUpdate: 'security.settings.update',

  // System (SRS 1.2 section 25, RBAC 013)
  systemEmailLogsView: 'system.email_logs.view',
  systemEmailLogsRecipientsView: 'system.email_logs.recipients.view',
  systemEmailLogsResend: 'system.email_logs.resend',
  systemCacheView: 'system.cache.view',
  systemCacheInvalidate: 'system.cache.invalidate',
  systemQueuesView: 'system.queues.view',
  systemQueuesRetry: 'system.queues.retry',
  systemQueuesCancel: 'system.queues.cancel',
  systemQueuesClean: 'system.queues.clean',
  systemQueuesPause: 'system.queues.pause',
  systemSchedulesView: 'system.schedules.view',
  systemSchedulesRun: 'system.schedules.run',
  systemSchedulesManage: 'system.schedules.manage',
  systemStatusView: 'system.status.view',
  systemSettingsView: 'system.settings.view',
  systemSettingsUpdate: 'system.settings.update',
} as const;

export type PermissionCode = (typeof PERMISSION)[keyof typeof PERMISSION];

export const ALL_PERMISSION_CODES = Object.values(PERMISSION) as PermissionCode[];

/** Any one of these opens the activity log; each shows its own area. */
export const ACTIVITY_VIEW_CODES: PermissionCode[] = [
  PERMISSION.activityAuthenticationView,
  PERMISSION.activityAccessControlView,
  PERMISSION.activityContentView,
  PERMISSION.activityModerationView,
  PERMISSION.activityCommunicationView,
  PERMISSION.activityConfigurationView,
  PERMISSION.activitySystemView,
];

/**
 * What each admin route needs. One mapping, consulted by the route guard, the
 * navigation and the access-control provider, so a screen cannot be protected in
 * one place and open in another.
 *
 * A path not listed here needs a session only (the dashboard, the account
 * screens). A path listed with several codes needs all of them, unless it is
 * marked `anyOf`, when one is enough.
 */
export const ROUTE_PERMISSIONS: { path: string; permissions: PermissionCode[]; anyOf?: boolean }[] = [
  { path: '/ai-content', permissions: [PERMISSION.aiContentView] },
  { path: '/ai-content/topics', permissions: [PERMISSION.aiContentView] },
  { path: '/ai-content/topics/:id', permissions: [PERMISSION.aiContentView] },
  { path: '/ai-content/fact-review', permissions: [PERMISSION.aiContentView] },
  { path: '/ai-content/schedule', permissions: [PERMISSION.aiContentView] },
  { path: '/ai-content/sources', permissions: [PERMISSION.aiContentConfigure] },
  { path: '/ai-content/pricing', permissions: [PERMISSION.aiContentConfigure] },
  { path: '/ai-content/settings', permissions: [PERMISSION.aiContentConfigure] },
  // Business. An editor route opens with View; the screen itself goes read-only without Update.
  { path: '/businesses', permissions: [PERMISSION.listingsRead] },
  { path: '/businesses/new', permissions: [PERMISSION.listingsCreate] },
  { path: '/businesses/featured', permissions: [PERMISSION.featuredView] },
  { path: '/businesses/featured/new', permissions: [PERMISSION.featuredManage] },
  { path: '/categories', permissions: [PERMISSION.categoriesView] },
  { path: '/categories/new', permissions: [PERMISSION.categoriesCreate] },
  { path: '/categories/:id', permissions: [PERMISSION.categoriesView] },
  { path: '/services', permissions: [PERMISSION.servicesView] },
  { path: '/services/new', permissions: [PERMISSION.servicesCreate] },
  { path: '/services/:id', permissions: [PERMISSION.servicesView] },
  { path: '/areas', permissions: [PERMISSION.areasView] },
  { path: '/areas/new', permissions: [PERMISSION.areasCreate] },
  { path: '/areas/:id', permissions: [PERMISSION.areasView] },
  // Editorial
  { path: '/posts', permissions: [PERMISSION.postsView] },
  { path: '/posts/new', permissions: [PERMISSION.postsCreate] },
  { path: '/authors', permissions: [PERMISSION.authorsView] },
  { path: '/authors/new', permissions: [PERMISSION.authorsCreate] },
  { path: '/blog-categories', permissions: [PERMISSION.blogCategoriesView] },
  { path: '/blog-categories/new', permissions: [PERMISSION.blogCategoriesCreate] },
  { path: '/blog-categories/:id', permissions: [PERMISSION.blogCategoriesView] },
  { path: '/blog-tags', permissions: [PERMISSION.blogTagsView] },
  { path: '/blog-tags/new', permissions: [PERMISSION.blogTagsCreate] },
  { path: '/blog-tags/:id', permissions: [PERMISSION.blogTagsView] },
  { path: '/media', permissions: [PERMISSION.mediaView] },
  { path: '/media/:id', permissions: [PERMISSION.mediaView] },
  // Community
  { path: '/enquiries', permissions: [PERMISSION.enquiriesRead] },
  { path: '/reviews', permissions: [PERMISSION.reviewsView] },
  { path: '/comments', permissions: [PERMISSION.commentsView] },
  { path: '/reports', permissions: [PERMISSION.reportsView] },
  // Configuration
  { path: '/settings/general', permissions: [PERMISSION.settingsGeneralView] },
  { path: '/settings/seo', permissions: [PERMISSION.settingsSeoView] },
  { path: '/settings', permissions: [PERMISSION.settingsHomeView] },
  { path: '/redirects', permissions: [PERMISSION.redirectsView] },
  { path: '/redirects/new', permissions: [PERMISSION.redirectsCreate] },
  { path: '/admins', permissions: [PERMISSION.adminsView] },
  { path: '/admins/new', permissions: [PERMISSION.adminsCreate] },
  { path: '/roles', permissions: [PERMISSION.rolesView] },
  { path: '/permissions', permissions: [PERMISSION.permissionsView] },
  { path: '/audit', permissions: ACTIVITY_VIEW_CODES, anyOf: true },
  // Website
  { path: '/website/pages', permissions: [PERMISSION.websitePagesView] },
  { path: '/website/pages/new', permissions: [PERMISSION.websitePagesCreate] },
  { path: '/website/pages/:slug', permissions: [PERMISSION.websitePagesView] },
  { path: '/pages', permissions: [PERMISSION.websitePagesView] },
  { path: '/website/menus', permissions: [PERMISSION.websiteMenusView] },
  { path: '/website/faqs', permissions: [PERMISSION.websiteFaqsView] },
  { path: '/website/faqs/new', permissions: [PERMISSION.websiteFaqsCreate] },
  { path: '/website/faqs/:id', permissions: [PERMISSION.websiteFaqsUpdate] },
  { path: '/website/service-alerts', permissions: [PERMISSION.websiteAlertsView] },
  { path: '/website/service-alerts/new', permissions: [PERMISSION.websiteAlertsCreate] },
  { path: '/website/service-alerts/:id', permissions: [PERMISSION.websiteAlertsUpdate] },
  { path: '/website/testimonials', permissions: [PERMISSION.websiteTestimonialsView] },
  { path: '/website/testimonials/new', permissions: [PERMISSION.websiteTestimonialsCreate] },
  { path: '/website/testimonials/:id', permissions: [PERMISSION.websiteTestimonialsUpdate] },
  { path: '/website/partners', permissions: [PERMISSION.websiteClientsView] },
  { path: '/website/partners/new', permissions: [PERMISSION.websiteClientsCreate] },
  { path: '/website/partners/:id', permissions: [PERMISSION.websiteClientsUpdate] },
  // Security and System
  { path: '/security/settings', permissions: [PERMISSION.securitySettingsView] },
  { path: '/system/email-logs', permissions: [PERMISSION.systemEmailLogsView] },
  { path: '/system/cache', permissions: [PERMISSION.systemCacheView] },
  { path: '/system/queues', permissions: [PERMISSION.systemQueuesView] },
  { path: '/system/schedules', permissions: [PERMISSION.systemSchedulesView] },
];

/** The permissions a path requires; the longest matching prefix wins. */
/** Segment-wise match allowing `:param` placeholders, e.g. `/website/faqs/:id`. */
function matchesPattern(pattern: string, path: string): boolean {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every((part, index) => part.startsWith(':') || part === pathParts[index]);
}

function routeEntryForPath(path: string) {
  const candidates = [...ROUTE_PERMISSIONS].sort((a, b) => b.path.length - a.path.length);
  // A pattern that matches segment for segment wins over a prefix: an editor at
  // `/website/faqs/:id` needs the edit permission, not the list's read
  // permission, so opening it without that permission shows the forbidden state
  // rather than a form the server will refuse to save (SRS RBAC 010).
  // A literal route (`/website/pages/new`) wins over a placeholder that would
  // also match it (`/website/pages/:slug`): creating needs the create code.
  return (
    candidates.find((entry) => entry.path === path) ??
    candidates.find((entry) => matchesPattern(entry.path, path)) ??
    candidates.find((entry) => path.startsWith(`${entry.path}/`))
  );
}

export function permissionsForPath(path: string): PermissionCode[] {
  return routeEntryForPath(path)?.permissions ?? [];
}

/** What a path needs, and whether one of the codes is enough. */
export function routeRequirement(path: string): { permissions: PermissionCode[]; anyOf: boolean } {
  const entry = routeEntryForPath(path);
  return { permissions: entry?.permissions ?? [], anyOf: entry?.anyOf === true };
}

/** True when at least one of the codes is held. */
export function holdsAny(held: readonly string[] | undefined, codes: readonly string[]): boolean {
  if (!held) return false;
  return codes.some((code) => held.includes(code));
}

/** True when every required code is held. An empty requirement is not a grant of anything. */
export function holdsAll(held: readonly string[] | undefined, required: readonly string[]): boolean {
  if (!held) return false;
  return required.every((code) => held.includes(code));
}
