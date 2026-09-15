/**
 * Permission catalogue (SRS RBAC 001/002, change log 1.13): codes are
 * `<resource>.<action>` and are declared here, in code. This module is the
 * single source of truth — the `permissions` table is synchronised from it,
 * guards accept nothing outside it and the admin interface offers nothing
 * outside it, so a misspelt or unknown code cannot exist to be granted.
 *
 * Revision 1.13 gives every admin menu item its own codes: a View code that
 * opens the screen, and one code per action the screen really has. `module` is
 * the sidebar section and `menuItem` the sidebar label, so the permission matrix
 * reads exactly like the navigation and one person can be given SEO settings
 * without General settings.
 *
 * Adding a module: add its entries here, run `pnpm --filter api admin:seed-rbac`
 * (idempotent, audited) and declare the code on the route with
 * `@RequirePermissions('…')`. Nothing becomes visible by default — a new
 * permission grants access only once a role or a direct assignment carries it.
 *
 * Splitting a permission: add the new codes with `migratesFrom` naming the old
 * one. The first synchronisation that creates a new code copies every role and
 * direct grant of the old code onto it, so nobody loses access on deploy; it
 * runs once per code, so a grant removed later is never re-added.
 *
 * Retiring a permission: set `active: false` here and re-run the synchronisation.
 * The row and its history stay; it grants nothing and is not offered for
 * assignment. Delete the entry only once no assignment references it.
 */

export interface PermissionDefinition {
  /** Human-readable name shown in the admin permission matrix. */
  label: string;
  /** One sentence explaining what holding it allows. */
  description: string;
  /** The sidebar section the screen sits in. */
  module: PermissionModule;
  /** The sidebar label of the screen the code belongs to. */
  menuItem: string;
  /** The matrix column: one of the standard actions, or a short named extra. */
  action: string;
  /** Codes whose existing grants are copied onto this one when it is first created. */
  migratesFrom?: readonly string[];
  /** A retired permission stays in the catalogue but grants nothing (RBAC 002). */
  active?: false;
}

export const PERMISSION_MODULES = ['Overview', 'Business', 'Editorial', 'Community', 'Configuration', 'Website', 'Security', 'System', 'Retired'] as const;
export type PermissionModule = (typeof PERMISSION_MODULES)[number];

/** The matrix columns every screen shares; anything else is shown as a named extra. */
export const STANDARD_ACTIONS = ['View', 'Create', 'Update', 'Publish', 'Delete'] as const;

export const PERMISSIONS = {
  // ---- Business -------------------------------------------------------------
  'listings.read': { label: 'View businesses', description: 'Open the business listings, their hours and galleries', module: 'Business', menuItem: 'Businesses', action: 'View' },
  'listings.create': { label: 'Add businesses', description: 'Create new business listings', module: 'Business', menuItem: 'Businesses', action: 'Create', migratesFrom: ['listings.write'] },
  'listings.update': { label: 'Edit businesses', description: 'Edit business listings, opening hours and galleries, and see the private enquiry email', module: 'Business', menuItem: 'Businesses', action: 'Update', migratesFrom: ['listings.write'] },
  'listings.publish': { label: 'Publish businesses', description: 'Publish, unpublish, archive and restore business listings and change their address', module: 'Business', menuItem: 'Businesses', action: 'Publish' },
  'featured.view': { label: 'View featured listings', description: 'Open the featured listing placements', module: 'Business', menuItem: 'Featured listings', action: 'View', migratesFrom: ['listings.read'] },
  'featured.manage': { label: 'Manage featured listings', description: 'Add, edit and remove featured listing placements', module: 'Business', menuItem: 'Featured listings', action: 'Manage', migratesFrom: ['listings.publish'] },
  'categories.view': { label: 'View categories', description: 'Open the business categories', module: 'Business', menuItem: 'Categories', action: 'View', migratesFrom: ['taxonomy.manage', 'listings.read'] },
  'categories.create': { label: 'Add categories', description: 'Create business categories', module: 'Business', menuItem: 'Categories', action: 'Create', migratesFrom: ['taxonomy.manage'] },
  'categories.update': { label: 'Edit categories', description: 'Edit, activate and deactivate business categories', module: 'Business', menuItem: 'Categories', action: 'Update', migratesFrom: ['taxonomy.manage'] },
  'services.view': { label: 'View services', description: 'Open the business services', module: 'Business', menuItem: 'Services', action: 'View', migratesFrom: ['taxonomy.manage', 'listings.read'] },
  'services.create': { label: 'Add services', description: 'Create business services', module: 'Business', menuItem: 'Services', action: 'Create', migratesFrom: ['taxonomy.manage'] },
  'services.update': { label: 'Edit services', description: 'Edit, activate and deactivate business services', module: 'Business', menuItem: 'Services', action: 'Update', migratesFrom: ['taxonomy.manage'] },
  'areas.view': { label: 'View local areas', description: 'Open the local areas', module: 'Business', menuItem: 'Local areas', action: 'View', migratesFrom: ['taxonomy.manage', 'listings.read'] },
  'areas.create': { label: 'Add local areas', description: 'Create local areas', module: 'Business', menuItem: 'Local areas', action: 'Create', migratesFrom: ['taxonomy.manage'] },
  'areas.update': { label: 'Edit local areas', description: 'Edit, activate and deactivate local areas', module: 'Business', menuItem: 'Local areas', action: 'Update', migratesFrom: ['taxonomy.manage'] },

  // ---- Editorial ------------------------------------------------------------
  'posts.view': { label: 'View articles', description: 'Open the articles, their revisions and previews', module: 'Editorial', menuItem: 'Articles', action: 'View', migratesFrom: ['posts.write'] },
  'posts.create': { label: 'Write new articles', description: 'Create article drafts', module: 'Editorial', menuItem: 'Articles', action: 'Create', migratesFrom: ['posts.write'] },
  'posts.update': { label: 'Edit articles', description: 'Edit article drafts, autosave, preview links and restore revisions', module: 'Editorial', menuItem: 'Articles', action: 'Update', migratesFrom: ['posts.write'] },
  'posts.publish': { label: 'Publish articles', description: 'Publish, schedule, unpublish, archive and restore articles and change their address', module: 'Editorial', menuItem: 'Articles', action: 'Publish' },
  'posts.feature': { label: 'Feature articles', description: 'Feature and unfeature articles on the blog', module: 'Editorial', menuItem: 'Articles', action: 'Feature', migratesFrom: ['posts.publish'] },
  'authors.view': { label: 'View authors', description: 'Open the author profiles', module: 'Editorial', menuItem: 'Authors', action: 'View', migratesFrom: ['posts.write'] },
  'authors.create': { label: 'Add authors', description: 'Create author profiles', module: 'Editorial', menuItem: 'Authors', action: 'Create', migratesFrom: ['posts.write'] },
  'authors.update': { label: 'Edit authors', description: 'Edit, activate and deactivate author profiles', module: 'Editorial', menuItem: 'Authors', action: 'Update', migratesFrom: ['posts.write'] },
  'blog_categories.view': { label: 'View blog categories', description: 'Open the blog categories', module: 'Editorial', menuItem: 'Blog categories', action: 'View', migratesFrom: ['posts.write'] },
  'blog_categories.create': { label: 'Add blog categories', description: 'Create blog categories', module: 'Editorial', menuItem: 'Blog categories', action: 'Create', migratesFrom: ['posts.write'] },
  'blog_categories.update': { label: 'Edit blog categories', description: 'Edit, activate and deactivate blog categories', module: 'Editorial', menuItem: 'Blog categories', action: 'Update', migratesFrom: ['posts.write'] },
  'blog_tags.view': { label: 'View blog tags', description: 'Open the blog tags', module: 'Editorial', menuItem: 'Blog tags', action: 'View', migratesFrom: ['posts.write'] },
  'blog_tags.create': { label: 'Add blog tags', description: 'Create blog tags', module: 'Editorial', menuItem: 'Blog tags', action: 'Create', migratesFrom: ['posts.write'] },
  'blog_tags.update': { label: 'Edit blog tags', description: 'Edit, activate and deactivate blog tags', module: 'Editorial', menuItem: 'Blog tags', action: 'Update', migratesFrom: ['posts.write'] },
  'media.view': { label: 'View media', description: 'Open the media library and choose images from it', module: 'Editorial', menuItem: 'Media library', action: 'View', migratesFrom: ['media.manage'] },
  'media.upload': { label: 'Upload media', description: 'Upload images and files', module: 'Editorial', menuItem: 'Media library', action: 'Create', migratesFrom: ['media.manage'] },
  'media.update': { label: 'Edit media details', description: 'Edit alt text, captions and credits of uploaded media', module: 'Editorial', menuItem: 'Media library', action: 'Update', migratesFrom: ['media.manage'] },
  'media.delete': { label: 'Delete media', description: 'Delete uploaded media that is not in use', module: 'Editorial', menuItem: 'Media library', action: 'Delete', migratesFrom: ['media.manage'] },
  'media.documents.upload': { label: 'Upload documents', description: 'Upload PDF documents up to 20 MB, to link from pages, articles and menus', module: 'Editorial', menuItem: 'Media library', action: 'Upload documents' },

  // ---- Community ------------------------------------------------------------
  'enquiries.read': { label: 'View enquiries', description: 'Open enquiries with contact details masked', module: 'Community', menuItem: 'Enquiries', action: 'View' },
  'enquiries.manage': { label: 'Handle enquiries', description: 'Change the handling status of enquiries', module: 'Community', menuItem: 'Enquiries', action: 'Update' },
  'enquiries.retry': { label: 'Retry enquiry delivery', description: 'Send an enquiry that failed to deliver again', module: 'Community', menuItem: 'Enquiries', action: 'Retry', migratesFrom: ['enquiries.manage'] },
  'enquiries.contact.view': { label: 'Reveal enquiry contact details', description: 'Reveal the email address or phone number a visitor gave with an enquiry. Every reveal is recorded.', module: 'Community', menuItem: 'Enquiries', action: 'Reveal contact', migratesFrom: ['community.contacts.view'] },
  'reviews.view': { label: 'View reviews', description: 'Open reviews and their moderation state', module: 'Community', menuItem: 'Reviews', action: 'View', migratesFrom: ['reviews.moderate'] },
  'reviews.moderate': { label: 'Moderate reviews', description: 'Approve, reject and mark reviews as spam', module: 'Community', menuItem: 'Reviews', action: 'Moderate' },
  'reviews.redact': { label: 'Redact reviews', description: 'Hide part of a review’s text', module: 'Community', menuItem: 'Reviews', action: 'Redact', migratesFrom: ['reviews.moderate'] },
  'reviews.email.view': { label: 'Reveal reviewer email', description: 'Reveal the email address a reviewer gave. Every reveal is recorded.', module: 'Community', menuItem: 'Reviews', action: 'Reveal email', migratesFrom: ['community.contacts.view'] },
  'comments.view': { label: 'View comments', description: 'Open article comments and their moderation state', module: 'Community', menuItem: 'Comments', action: 'View', migratesFrom: ['comments.moderate'] },
  'comments.moderate': { label: 'Moderate comments', description: 'Approve, reject and mark comments as spam', module: 'Community', menuItem: 'Comments', action: 'Moderate' },
  'comments.redact': { label: 'Redact comments', description: 'Hide part of a comment’s text', module: 'Community', menuItem: 'Comments', action: 'Redact', migratesFrom: ['comments.moderate'] },
  'comments.reply': { label: 'Reply to comments', description: 'Post a staff reply to a comment', module: 'Community', menuItem: 'Comments', action: 'Reply', migratesFrom: ['comments.moderate'] },
  'comments.email.view': { label: 'Reveal commenter email', description: 'Reveal the email address a commenter gave. Every reveal is recorded.', module: 'Community', menuItem: 'Comments', action: 'Reveal email', migratesFrom: ['community.contacts.view'] },
  'reports.view': { label: 'View abuse reports', description: 'Open abuse reports', module: 'Community', menuItem: 'Abuse reports', action: 'View', migratesFrom: ['reports.manage'] },
  'reports.manage': { label: 'Handle abuse reports', description: 'Investigate and resolve abuse reports', module: 'Community', menuItem: 'Abuse reports', action: 'Update' },
  'reports.email.view': { label: 'Reveal reporter email', description: 'Reveal the email address a reporter gave. Every reveal is recorded.', module: 'Community', menuItem: 'Abuse reports', action: 'Reveal email', migratesFrom: ['community.contacts.view'] },

  // ---- Configuration --------------------------------------------------------
  'settings.general.view': { label: 'View general settings', description: 'Open the general site settings', module: 'Configuration', menuItem: 'General settings', action: 'View', migratesFrom: ['settings.manage'] },
  'settings.general.update': { label: 'Change general settings', description: 'Change the general site settings', module: 'Configuration', menuItem: 'General settings', action: 'Update', migratesFrom: ['settings.manage'] },
  'settings.home.view': { label: 'View home page settings', description: 'Open the home page settings', module: 'Configuration', menuItem: 'Home page settings', action: 'View', migratesFrom: ['settings.manage'] },
  'settings.home.update': { label: 'Change home page settings', description: 'Change the home page settings', module: 'Configuration', menuItem: 'Home page settings', action: 'Update', migratesFrom: ['settings.manage'] },
  'settings.seo.view': { label: 'View SEO settings', description: 'Open the SEO settings', module: 'Configuration', menuItem: 'SEO settings', action: 'View', migratesFrom: ['settings.manage'] },
  'settings.seo.update': { label: 'Change SEO settings', description: 'Change the SEO settings', module: 'Configuration', menuItem: 'SEO settings', action: 'Update', migratesFrom: ['settings.manage'] },
  'redirects.view': { label: 'View redirects', description: 'Open the URL redirects and preview where an address resolves', module: 'Configuration', menuItem: 'SEO redirects', action: 'View', migratesFrom: ['redirects.manage'] },
  'redirects.create': { label: 'Add redirects', description: 'Create URL redirects', module: 'Configuration', menuItem: 'SEO redirects', action: 'Create', migratesFrom: ['redirects.manage'] },
  'redirects.update': { label: 'Activate redirects', description: 'Activate and deactivate URL redirects', module: 'Configuration', menuItem: 'SEO redirects', action: 'Update', migratesFrom: ['redirects.manage'] },
  'redirects.delete': { label: 'Delete redirects', description: 'Delete URL redirects', module: 'Configuration', menuItem: 'SEO redirects', action: 'Delete', migratesFrom: ['redirects.manage'] },
  'admins.view': { label: 'View administrators', description: 'Open the administrator accounts and the access they hold', module: 'Configuration', menuItem: 'Administrators', action: 'View', migratesFrom: ['admins.manage'] },
  'admins.create': { label: 'Invite administrators', description: 'Invite administrators and resend their setup email', module: 'Configuration', menuItem: 'Administrators', action: 'Create', migratesFrom: ['admins.manage'] },
  'admins.update': { label: 'Edit administrators', description: 'Edit administrator names', module: 'Configuration', menuItem: 'Administrators', action: 'Update', migratesFrom: ['admins.manage'] },
  'admins.status': { label: 'Disable administrators', description: 'Disable and re-enable administrator accounts', module: 'Configuration', menuItem: 'Administrators', action: 'Disable', migratesFrom: ['admins.manage'] },
  'admins.access.manage': { label: 'Assign administrator access', description: "Assign an administrator's roles and direct permissions", module: 'Configuration', menuItem: 'Administrators', action: 'Assign access' },
  'security.sessions.view': { label: 'View administrator sessions', description: "View another administrator's active sessions", module: 'Configuration', menuItem: 'Administrators', action: 'View sessions' },
  'security.sessions.revoke': { label: 'Revoke administrator sessions', description: "Sign another administrator out of their sessions", module: 'Configuration', menuItem: 'Administrators', action: 'Revoke sessions' },
  'roles.view': { label: 'View roles', description: 'View roles and the permissions they carry', module: 'Configuration', menuItem: 'Roles', action: 'View' },
  'roles.create': { label: 'Create roles', description: 'Create new roles', module: 'Configuration', menuItem: 'Roles', action: 'Create' },
  'roles.update': { label: 'Edit roles', description: 'Edit role details, activation and the permissions a role carries', module: 'Configuration', menuItem: 'Roles', action: 'Update' },
  'roles.delete': { label: 'Delete roles', description: 'Delete an unused role that is not a protected system role', module: 'Configuration', menuItem: 'Roles', action: 'Delete' },
  'permissions.view': { label: 'View the permission catalogue', description: 'View the registered permission catalogue', module: 'Configuration', menuItem: 'Permissions', action: 'View' },
  // The activity log by area (change log 1.14): each code shows one area's events.
  'activity.authentication.view': { label: 'View sign-in activity', description: 'See sign-ins, failed sign-ins, password resets and account security events in the activity log', module: 'Configuration', menuItem: 'Activity log', action: 'Sign-in', migratesFrom: ['audit.read'] },
  'activity.access_control.view': { label: 'View access activity', description: 'See changes to administrators, roles and permissions in the activity log', module: 'Configuration', menuItem: 'Activity log', action: 'Access', migratesFrom: ['audit.read'] },
  'activity.content.view': { label: 'View content activity', description: 'See changes to listings, categories, articles, media and website content in the activity log', module: 'Configuration', menuItem: 'Activity log', action: 'Content', migratesFrom: ['audit.read'] },
  'activity.moderation.view': { label: 'View moderation activity', description: 'See review, comment and abuse report decisions in the activity log', module: 'Configuration', menuItem: 'Activity log', action: 'Moderation', migratesFrom: ['audit.read'] },
  'activity.communication.view': { label: 'View communication activity', description: 'See enquiry and transactional email events in the activity log', module: 'Configuration', menuItem: 'Activity log', action: 'Communication', migratesFrom: ['audit.read'] },
  'activity.configuration.view': { label: 'View configuration activity', description: 'See settings, SEO and redirect changes in the activity log', module: 'Configuration', menuItem: 'Activity log', action: 'Configuration', migratesFrom: ['audit.read'] },
  'activity.system.view': { label: 'View system activity', description: 'See queue, cache, scheduled task and other operational events in the activity log, and any event from an unregistered area', module: 'Configuration', menuItem: 'Activity log', action: 'System', migratesFrom: ['audit.read'] },

  // ---- Website --------------------------------------------------------------
  'website.pages.view': { label: 'View pages', description: 'Open the static website pages', module: 'Website', menuItem: 'Pages', action: 'View', migratesFrom: ['settings.manage'] },
  'website.pages.create': { label: 'Create pages', description: 'Create static website pages', module: 'Website', menuItem: 'Pages', action: 'Create', migratesFrom: ['settings.manage'] },
  'website.pages.update': { label: 'Edit pages', description: 'Edit static website pages', module: 'Website', menuItem: 'Pages', action: 'Update', migratesFrom: ['settings.manage'] },
  'website.pages.publish': { label: 'Publish pages', description: 'Publish and unpublish static website pages', module: 'Website', menuItem: 'Pages', action: 'Publish', migratesFrom: ['settings.manage'] },
  'website.pages.delete': { label: 'Delete pages', description: 'Delete static website pages', module: 'Website', menuItem: 'Pages', action: 'Delete', migratesFrom: ['settings.manage'] },
  // Navigation menus (SRS 1.9 MENU 002). Viewing and acting are separate (RBAC 013).
  'website.menus.view': { label: 'View menus', description: 'View navigation menus and which locations they are shown in', module: 'Website', menuItem: 'Menus', action: 'View' },
  'website.menus.manage': { label: 'Edit menus', description: 'Create, edit and delete the header, top bar and footer navigation menus', module: 'Website', menuItem: 'Menus', action: 'Update' },
  'website.menus.assign': { label: 'Assign menu locations', description: 'Choose which menu is shown in the header, top bar and footer', module: 'Website', menuItem: 'Menus', action: 'Assign', migratesFrom: ['website.menus.manage'] },
  'website.faqs.view': { label: 'View FAQs', description: 'View frequently asked questions', module: 'Website', menuItem: 'FAQs', action: 'View' },
  'website.faqs.create': { label: 'Create FAQs', description: 'Create frequently asked questions', module: 'Website', menuItem: 'FAQs', action: 'Create' },
  'website.faqs.update': { label: 'Edit FAQs', description: 'Edit frequently asked questions and their display order', module: 'Website', menuItem: 'FAQs', action: 'Update' },
  'website.faqs.publish': { label: 'Publish FAQs', description: 'Publish and unpublish frequently asked questions', module: 'Website', menuItem: 'FAQs', action: 'Publish' },
  'website.faqs.delete': { label: 'Delete FAQs', description: 'Delete frequently asked questions', module: 'Website', menuItem: 'FAQs', action: 'Delete' },
  'website.alerts.view': { label: 'View service alerts', description: 'View service alerts', module: 'Website', menuItem: 'Service alerts', action: 'View' },
  'website.alerts.create': { label: 'Create service alerts', description: 'Create service alerts', module: 'Website', menuItem: 'Service alerts', action: 'Create' },
  'website.alerts.update': { label: 'Edit service alerts', description: 'Edit service alerts, their severity, display window and order', module: 'Website', menuItem: 'Service alerts', action: 'Update' },
  'website.alerts.publish': { label: 'Publish service alerts', description: 'Publish and unpublish service alerts shown above the public header', module: 'Website', menuItem: 'Service alerts', action: 'Publish' },
  'website.alerts.delete': { label: 'Delete service alerts', description: 'Delete service alerts', module: 'Website', menuItem: 'Service alerts', action: 'Delete' },
  'website.testimonials.view': { label: 'View testimonials', description: 'View testimonials and their approval state', module: 'Website', menuItem: 'Testimonials', action: 'View' },
  'website.testimonials.create': { label: 'Create testimonials', description: 'Create testimonials', module: 'Website', menuItem: 'Testimonials', action: 'Create' },
  'website.testimonials.update': { label: 'Edit testimonials', description: 'Edit testimonials and their display order', module: 'Website', menuItem: 'Testimonials', action: 'Update' },
  'website.testimonials.publish': { label: 'Publish testimonials', description: 'Publish and unpublish approved testimonials', module: 'Website', menuItem: 'Testimonials', action: 'Publish' },
  'website.testimonials.delete': { label: 'Delete testimonials', description: 'Delete testimonials', module: 'Website', menuItem: 'Testimonials', action: 'Delete' },
  'website.clients.view': { label: 'View client and partner logos', description: 'View the client and partner organisations displayed on the website', module: 'Website', menuItem: 'Clients and partners', action: 'View' },
  'website.clients.create': { label: 'Create client and partner logos', description: 'Create client and partner organisation records', module: 'Website', menuItem: 'Clients and partners', action: 'Create' },
  'website.clients.update': { label: 'Edit client and partner logos', description: 'Edit client and partner organisation records and their display order', module: 'Website', menuItem: 'Clients and partners', action: 'Update' },
  'website.clients.approve': { label: 'Authorise logo display', description: "Record written authorisation to display an organisation's mark; publication is refused without it", module: 'Website', menuItem: 'Clients and partners', action: 'Authorise' },
  'website.clients.publish': { label: 'Publish client and partner logos', description: 'Publish and unpublish authorised client and partner organisations', module: 'Website', menuItem: 'Clients and partners', action: 'Publish' },
  'website.clients.delete': { label: 'Delete client and partner logos', description: 'Delete client and partner organisation records', module: 'Website', menuItem: 'Clients and partners', action: 'Delete' },

  // ---- Security (SRS 1.2, SECS 001–008) --------------------------------------
  'security.settings.view': { label: 'View security settings', description: 'View authentication, password policy, login security and session settings', module: 'Security', menuItem: 'Security settings', action: 'View' },
  'security.settings.update': { label: 'Change security settings', description: 'Change authentication, password policy, login security and session settings within their specified bounds', module: 'Security', menuItem: 'Security settings', action: 'Update' },

  // ---- System (SRS 1.2, RBAC 013 · section 25) -------------------------------
  // Viewing and acting are always separate codes, and revealing protected data
  // is separate again from viewing the record that contains it (MAIL 005).
  'system.email_logs.view': { label: 'View email delivery log', description: 'View transactional email deliveries with masked recipients', module: 'System', menuItem: 'Email logs', action: 'View' },
  'system.email_logs.recipients.view': { label: 'Reveal email recipients', description: 'Reveal the full recipient address on an email delivery record; every reveal is recorded', module: 'System', menuItem: 'Email logs', action: 'Reveal recipient' },
  'system.email_logs.resend': { label: 'Resend an email', description: 'Resend a transactional email that has not been delivered, complained about or suppressed', module: 'System', menuItem: 'Email logs', action: 'Resend' },
  'system.cache.view': { label: 'View cache status', description: 'View cache availability and the registered cache namespaces', module: 'System', menuItem: 'Cache manager', action: 'View' },
  'system.cache.invalidate': { label: 'Invalidate caches', description: 'Invalidate a registered cache namespace or tag, and warm an approved cache', module: 'System', menuItem: 'Cache manager', action: 'Clear' },
  'system.queues.view': { label: 'View queues', description: 'View queue depths, worker availability and redacted job detail', module: 'System', menuItem: 'Queue monitor', action: 'View' },
  'system.queues.retry': { label: 'Retry queue jobs', description: 'Retry an eligible failed job', module: 'System', menuItem: 'Queue monitor', action: 'Retry' },
  'system.queues.cancel': { label: 'Remove queue jobs', description: 'Cancel or remove an eligible waiting or delayed job', module: 'System', menuItem: 'Queue monitor', action: 'Remove' },
  'system.queues.clean': { label: 'Clean queue records', description: 'Remove old job records within retention bounds', module: 'System', menuItem: 'Queue monitor', action: 'Clean', migratesFrom: ['system.queues.cancel'] },
  'system.queues.pause': { label: 'Pause queues', description: 'Pause and resume a queue where operational policy allows it', module: 'System', menuItem: 'Queue monitor', action: 'Pause' },
  'system.schedules.view': { label: 'View scheduled tasks', description: 'View registered scheduled tasks and their execution history', module: 'System', menuItem: 'Scheduled tasks', action: 'View' },
  'system.schedules.run': { label: 'Run scheduled tasks', description: 'Run a registered task that allows manual execution', module: 'System', menuItem: 'Scheduled tasks', action: 'Run' },
  'system.schedules.manage': { label: 'Enable scheduled tasks', description: 'Enable or disable a registered task whose registry entry permits runtime control', module: 'System', menuItem: 'Scheduled tasks', action: 'Enable' },
  'system.status.view': { label: 'View operational status', description: 'View the operational status of the API, database, cache and worker', module: 'System', menuItem: 'Operational status', action: 'View', migratesFrom: ['audit.read'] },
  // Email and operations settings groups; they have no admin screen yet.
  'system.settings.view': { label: 'View operational settings', description: 'View the settings registry and the email and operational settings groups', module: 'System', menuItem: 'Operational settings', action: 'View' },
  'system.settings.update': { label: 'Change operational settings', description: 'Change the email and operational settings groups', module: 'System', menuItem: 'Operational settings', action: 'Update' },

  // ---- Retired (RBAC 002): grant nothing; rows and history are kept ----------
  'listings.write': { label: 'Edit listings (retired)', description: 'Retired: replaced by Add businesses and Edit businesses', module: 'Retired', menuItem: 'Businesses', action: 'Retired', active: false },
  'taxonomy.manage': { label: 'Manage taxonomy (retired)', description: 'Retired: replaced by the Categories, Services and Local areas permissions', module: 'Retired', menuItem: 'Categories', action: 'Retired', active: false },
  'posts.write': { label: 'Edit articles (retired)', description: 'Retired: replaced by the Articles, Authors, Blog categories and Blog tags permissions', module: 'Retired', menuItem: 'Articles', action: 'Retired', active: false },
  'media.manage': { label: 'Manage media (retired)', description: 'Retired: replaced by the Media library permissions', module: 'Retired', menuItem: 'Media library', action: 'Retired', active: false },
  'community.contacts.view': { label: 'Reveal visitor contact details (retired)', description: 'Retired: replaced by one reveal permission on each of Enquiries, Reviews, Comments and Abuse reports', module: 'Retired', menuItem: 'Enquiries', action: 'Retired', active: false },
  'settings.manage': { label: 'Manage settings (retired)', description: 'Retired: replaced by the General settings, Home page settings, SEO settings and Pages permissions', module: 'Retired', menuItem: 'General settings', action: 'Retired', active: false },
  'redirects.manage': { label: 'Manage redirects (retired)', description: 'Retired: replaced by the SEO redirects permissions', module: 'Retired', menuItem: 'SEO redirects', action: 'Retired', active: false },
  'admins.manage': { label: 'Manage administrators (retired)', description: 'Retired: replaced by the Administrators permissions', module: 'Retired', menuItem: 'Administrators', action: 'Retired', active: false },
  'audit.read': { label: 'View the activity log (retired)', description: 'Retired: replaced by one activity log permission per area', module: 'Retired', menuItem: 'Activity log', action: 'Retired', active: false },
  // Retired before it was ever assignable; the activity log is now read by area.
  'system.activity_logs.view': { label: 'View the activity log, old code (retired)', description: 'Retired: use the activity log permissions by area', module: 'Retired', menuItem: 'Activity log', action: 'Retired', active: false },
} as const satisfies Record<string, PermissionDefinition>;

export type PermissionKey = keyof typeof PERMISSIONS;

export const ALL_PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

/** Keys that currently grant access; a retired entry is excluded. */
export const ACTIVE_PERMISSION_KEYS = ALL_PERMISSION_KEYS.filter((key) => (PERMISSIONS[key] as PermissionDefinition).active !== false);

export function isPermissionKey(value: string): value is PermissionKey {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}

/** True when the code is registered *and* still granting access (RBAC 002). */
export function isActivePermissionKey(value: string): value is PermissionKey {
  return isPermissionKey(value) && (PERMISSIONS[value] as PermissionDefinition).active !== false;
}

export function permissionDefinition(key: PermissionKey): PermissionDefinition {
  return PERMISSIONS[key] as PermissionDefinition;
}

/** Position in the catalogue, so the matrix lists screens in sidebar order rather than alphabetically. */
export function permissionOrder(key: string): number {
  const index = ALL_PERMISSION_KEYS.indexOf(key as PermissionKey);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

/** System roles. Only Super Admin is seeded; it is protected (SRS ADM 001/003, RBAC 011). */
export const SUPER_ADMIN_ROLE = {
  key: 'super_admin',
  name: 'Super Admin',
  description: 'Full access to all administration functions',
} as const;
