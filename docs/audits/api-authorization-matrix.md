# API authorization matrix

**Generated:** 8 September 2026, during the complete production-readiness audit.
**Method:** `pnpm --filter api routes:matrix` — boots the application Nest actually
builds and reads the *same* `Reflector.getAllAndOverride([handler, class])` call
the `PermissionsGuard` makes. Nothing here comes from scanning source: decorator
order in a file says nothing about what the guard sees, and a controller-level
`@RequirePermissions` is invisible to a handler-only read (that mistake is what
produced 26 spurious "NONE" rows in the first run of this audit's generator).

**Regenerate** after adding or moving a route, and check the totals line. A row
reading **NONE** is refused at runtime by the default-deny guard, but it is a
programming error to be fixed rather than left.

**Runtime proof that the declarations are enforced** lives in
`apps/api/test/authorization-audit.integration-spec.ts` — "Every admin route
denies by default", which enumerates the routes from the running router and
asserts anonymous → 401 and permissionless-administrator → 403 on every route
outside the two allowlists below.

**Totals:** 193 admin routes, 33 outside the admin prefix, 0 without a resolved declaration.

## Deliberately open routes

These are the only two exemptions, and both are asserted against the reflector
by the sweep test rather than trusted as a hand-written list.

| Method | Route | Declaration | Why |
| --- | --- | --- | --- |
| POST | `/api/v1/admin/auth/login` | PUBLIC | sign-in |
| POST | `/api/v1/admin/auth/forgot-password` | PUBLIC | recovery request |
| POST | `/api/v1/admin/auth/reset-password` | PUBLIC | recovery completion |
| POST | `/api/v1/admin/auth/accept-setup` | PUBLIC | first-password invitation |
| POST | `/api/v1/admin/auth/totp/challenge` | PUBLIC | second factor, mid sign-in |
| GET | `/api/v1/admin/auth/me` | SESSION ONLY | the caller's own principal |
| POST | `/api/v1/admin/auth/logout` | SESSION ONLY | ends the caller's own session |
| POST | `/api/v1/admin/auth/change-password` | SESSION ONLY | the caller's own password |
| GET/DELETE | `/api/v1/admin/auth/sessions[/:id]` | SESSION ONLY | the caller's own sessions; another administrator's id answers 404 (IDOR test) |
| POST | `/api/v1/admin/auth/totp/{enroll,verify,disable}` | SESSION ONLY | the caller's own second factor |
| GET | `/api/v1/admin/dashboard` | SESSION ONLY | every counter is individually gated on a permission inside `DashboardService`; a permissionless administrator sees an empty list, not zeros |
| GET | `/api/v1/admin/settings/registry` | SESSION ONLY | metadata filtered to the groups the caller may view (SET 002) |

## Full matrix

| Method | Route | Required authorization | Controller |
| --- | --- | --- | --- |
| GET | `/api/v1/admin/activity` | `audit.read` | AuditController |
| GET | `/api/v1/admin/admins` | `admins.manage` | AdminsController |
| POST | `/api/v1/admin/admins` | `admins.manage` | AdminsController |
| GET | `/api/v1/admin/admins/:id` | `admins.manage` | AdminsController |
| PATCH | `/api/v1/admin/admins/:id` | `admins.manage` | AdminsController |
| GET | `/api/v1/admin/admins/:id/access` | `admins.manage` | AuthorizationController |
| POST | `/api/v1/admin/admins/:id/disable` | `admins.manage` | AdminsController |
| POST | `/api/v1/admin/admins/:id/enable` | `admins.manage` | AdminsController |
| PUT | `/api/v1/admin/admins/:id/permissions` | `admins.access.manage` | AuthorizationController |
| POST | `/api/v1/admin/admins/:id/resend-setup` | `admins.manage` | AdminsController |
| PUT | `/api/v1/admin/admins/:id/roles` | `admins.access.manage` | AuthorizationController |
| DELETE | `/api/v1/admin/admins/:id/sessions` | `security.sessions.revoke` | AdminsController |
| GET | `/api/v1/admin/admins/:id/sessions` | `security.sessions.view` | AdminsController |
| DELETE | `/api/v1/admin/admins/:id/sessions/:sessionId` | `security.sessions.revoke` | AdminsController |
| GET | `/api/v1/admin/areas` | `taxonomy.manage` | AdminLocalAreasController |
| POST | `/api/v1/admin/areas` | `taxonomy.manage` | AdminLocalAreasController |
| GET | `/api/v1/admin/areas/:id` | `taxonomy.manage` | AdminLocalAreasController |
| PATCH | `/api/v1/admin/areas/:id` | `taxonomy.manage` | AdminLocalAreasController |
| POST | `/api/v1/admin/areas/:id/activate` | `taxonomy.manage` | AdminLocalAreasController |
| POST | `/api/v1/admin/areas/:id/deactivate` | `taxonomy.manage` | AdminLocalAreasController |
| POST | `/api/v1/admin/auth/accept-setup` | `PUBLIC` | AuthController |
| POST | `/api/v1/admin/auth/change-password` | `SESSION ONLY` | AuthController |
| POST | `/api/v1/admin/auth/forgot-password` | `PUBLIC` | AuthController |
| POST | `/api/v1/admin/auth/login` | `PUBLIC` | AuthController |
| POST | `/api/v1/admin/auth/logout` | `SESSION ONLY` | AuthController |
| GET | `/api/v1/admin/auth/me` | `SESSION ONLY` | AuthController |
| POST | `/api/v1/admin/auth/reset-password` | `PUBLIC` | AuthController |
| GET | `/api/v1/admin/auth/sessions` | `SESSION ONLY` | AuthController |
| DELETE | `/api/v1/admin/auth/sessions/:id` | `SESSION ONLY` | AuthController |
| POST | `/api/v1/admin/auth/totp/challenge` | `PUBLIC` | AuthController |
| POST | `/api/v1/admin/auth/totp/disable` | `SESSION ONLY` | AuthController |
| POST | `/api/v1/admin/auth/totp/enroll` | `SESSION ONLY` | AuthController |
| POST | `/api/v1/admin/auth/totp/verify` | `SESSION ONLY` | AuthController |
| GET | `/api/v1/admin/authors` | `posts.write` | AuthorsAdminController |
| POST | `/api/v1/admin/authors` | `posts.write` | AuthorsAdminController |
| GET | `/api/v1/admin/authors/:id` | `posts.write` | AuthorsAdminController |
| PATCH | `/api/v1/admin/authors/:id` | `posts.write` | AuthorsAdminController |
| POST | `/api/v1/admin/authors/:id/activate` | `posts.write` | AuthorsAdminController |
| POST | `/api/v1/admin/authors/:id/deactivate` | `posts.write` | AuthorsAdminController |
| GET | `/api/v1/admin/blog-categories` | `posts.write` | BlogCategoriesAdminController |
| POST | `/api/v1/admin/blog-categories` | `posts.write` | BlogCategoriesAdminController |
| PATCH | `/api/v1/admin/blog-categories/:id` | `posts.write` | BlogCategoriesAdminController |
| POST | `/api/v1/admin/blog-categories/:id/activate` | `posts.write` | BlogCategoriesAdminController |
| POST | `/api/v1/admin/blog-categories/:id/deactivate` | `posts.write` | BlogCategoriesAdminController |
| GET | `/api/v1/admin/blog-tags` | `posts.write` | BlogTagsAdminController |
| POST | `/api/v1/admin/blog-tags` | `posts.write` | BlogTagsAdminController |
| PATCH | `/api/v1/admin/blog-tags/:id` | `posts.write` | BlogTagsAdminController |
| POST | `/api/v1/admin/blog-tags/:id/activate` | `posts.write` | BlogTagsAdminController |
| POST | `/api/v1/admin/blog-tags/:id/deactivate` | `posts.write` | BlogTagsAdminController |
| GET | `/api/v1/admin/businesses` | `listings.read` | DirectoryAdminController |
| POST | `/api/v1/admin/businesses` | `listings.write` | DirectoryAdminController |
| GET | `/api/v1/admin/businesses/:businessId/gallery` | `listings.read` | BusinessGalleryController |
| PUT | `/api/v1/admin/businesses/:businessId/gallery` | `listings.write` | BusinessGalleryController |
| GET | `/api/v1/admin/businesses/:id` | `listings.read` | DirectoryAdminController |
| PATCH | `/api/v1/admin/businesses/:id` | `listings.write` | DirectoryAdminController |
| POST | `/api/v1/admin/businesses/:id/archive` | `listings.publish` | DirectoryAdminController |
| GET | `/api/v1/admin/businesses/:id/hours` | `listings.read` | DirectoryAdminController |
| PUT | `/api/v1/admin/businesses/:id/hours` | `listings.write` | DirectoryAdminController |
| POST | `/api/v1/admin/businesses/:id/publish` | `listings.publish` | DirectoryAdminController |
| POST | `/api/v1/admin/businesses/:id/restore` | `listings.publish` | DirectoryAdminController |
| POST | `/api/v1/admin/businesses/:id/slug` | `listings.publish` | DirectoryAdminController |
| POST | `/api/v1/admin/businesses/:id/unpublish` | `listings.publish` | DirectoryAdminController |
| GET | `/api/v1/admin/categories` | `taxonomy.manage` | AdminCategoriesController |
| POST | `/api/v1/admin/categories` | `taxonomy.manage` | AdminCategoriesController |
| GET | `/api/v1/admin/categories/:id` | `taxonomy.manage` | AdminCategoriesController |
| PATCH | `/api/v1/admin/categories/:id` | `taxonomy.manage` | AdminCategoriesController |
| POST | `/api/v1/admin/categories/:id/activate` | `taxonomy.manage` | AdminCategoriesController |
| POST | `/api/v1/admin/categories/:id/deactivate` | `taxonomy.manage` | AdminCategoriesController |
| GET | `/api/v1/admin/comments` | `comments.moderate` | CommentsAdminController |
| GET | `/api/v1/admin/comments/:id` | `comments.moderate` | CommentsAdminController |
| POST | `/api/v1/admin/comments/:id/approve` | `comments.moderate` | CommentsAdminController |
| PATCH | `/api/v1/admin/comments/:id/redaction` | `comments.moderate` | CommentsAdminController |
| POST | `/api/v1/admin/comments/:id/reject` | `comments.moderate` | CommentsAdminController |
| POST | `/api/v1/admin/comments/:id/spam` | `comments.moderate` | CommentsAdminController |
| GET | `/api/v1/admin/dashboard` | `SESSION ONLY` | DashboardController |
| GET | `/api/v1/admin/email-logs` | `system.email_logs.view` | EmailLogsController |
| GET | `/api/v1/admin/email-logs/:id` | `system.email_logs.view` | EmailLogsController |
| GET | `/api/v1/admin/email-logs/:id/recipient` | `system.email_logs.recipients.view` | EmailLogsController |
| POST | `/api/v1/admin/email-logs/:id/resend` | `system.email_logs.resend` | EmailLogsController |
| GET | `/api/v1/admin/enquiries` | `enquiries.read` | EnquiriesAdminController |
| GET | `/api/v1/admin/enquiries/:id` | `enquiries.read` | EnquiriesAdminController |
| PATCH | `/api/v1/admin/enquiries/:id` | `enquiries.manage` | EnquiriesAdminController |
| POST | `/api/v1/admin/enquiries/:id/retry` | `enquiries.manage` | EnquiriesAdminController |
| GET | `/api/v1/admin/faqs` | `website.faqs.view` | FaqAdminController |
| POST | `/api/v1/admin/faqs` | `website.faqs.create` | FaqAdminController |
| DELETE | `/api/v1/admin/faqs/:id` | `website.faqs.delete` | FaqAdminController |
| GET | `/api/v1/admin/faqs/:id` | `website.faqs.view` | FaqAdminController |
| PUT | `/api/v1/admin/faqs/:id` | `website.faqs.update` | FaqAdminController |
| POST | `/api/v1/admin/faqs/:id/publish` | `website.faqs.publish` | FaqAdminController |
| POST | `/api/v1/admin/faqs/:id/unpublish` | `website.faqs.publish` | FaqAdminController |
| POST | `/api/v1/admin/faqs/reorder` | `website.faqs.update` | FaqAdminController |
| GET | `/api/v1/admin/featured` | `listings.read` | FeaturedAdminController |
| POST | `/api/v1/admin/featured` | `listings.publish` | FeaturedAdminController |
| DELETE | `/api/v1/admin/featured/:id` | `listings.publish` | FeaturedAdminController |
| PATCH | `/api/v1/admin/featured/:id` | `listings.publish` | FeaturedAdminController |
| GET | `/api/v1/admin/media` | `media.manage` | MediaAdminController |
| DELETE | `/api/v1/admin/media/:id` | `media.manage` | MediaAdminController |
| GET | `/api/v1/admin/media/:id` | `media.manage` | MediaAdminController |
| PATCH | `/api/v1/admin/media/:id` | `media.manage` | MediaAdminController |
| POST | `/api/v1/admin/media/:id/complete` | `media.manage` | MediaAdminController |
| POST | `/api/v1/admin/media/uploads` | `media.manage` | MediaAdminController |
| GET | `/api/v1/admin/operations/status` | `audit.read` | OperationsController |
| GET | `/api/v1/admin/pages` | `settings.manage` | StaticPagesAdminController |
| POST | `/api/v1/admin/pages` | `settings.manage` | StaticPagesAdminController |
| DELETE | `/api/v1/admin/pages/:slug` | `settings.manage` | StaticPagesAdminController |
| GET | `/api/v1/admin/pages/:slug` | `settings.manage` | StaticPagesAdminController |
| PUT | `/api/v1/admin/pages/:slug` | `settings.manage` | StaticPagesAdminController |
| POST | `/api/v1/admin/pages/:slug/publish` | `settings.manage` | StaticPagesAdminController |
| POST | `/api/v1/admin/pages/:slug/unpublish` | `settings.manage` | StaticPagesAdminController |
| GET | `/api/v1/admin/partners` | `website.clients.view` | PartnerAdminController |
| POST | `/api/v1/admin/partners` | `website.clients.create` | PartnerAdminController |
| DELETE | `/api/v1/admin/partners/:id` | `website.clients.delete` | PartnerAdminController |
| GET | `/api/v1/admin/partners/:id` | `website.clients.view` | PartnerAdminController |
| PUT | `/api/v1/admin/partners/:id` | `website.clients.update` | PartnerAdminController |
| POST | `/api/v1/admin/partners/:id/authorise` | `website.clients.approve` | PartnerAdminController |
| POST | `/api/v1/admin/partners/:id/publish` | `website.clients.publish` | PartnerAdminController |
| POST | `/api/v1/admin/partners/:id/unpublish` | `website.clients.publish` | PartnerAdminController |
| GET | `/api/v1/admin/permissions` | `permissions.view` | AuthorizationController |
| GET | `/api/v1/admin/posts` | `posts.write` | PostsAdminController |
| POST | `/api/v1/admin/posts` | `posts.write` | PostsAdminController |
| GET | `/api/v1/admin/posts/:id` | `posts.write` | PostsAdminController |
| PATCH | `/api/v1/admin/posts/:id` | `posts.write` | PostsAdminController |
| POST | `/api/v1/admin/posts/:id/archive` | `posts.publish` | PostsAdminController |
| GET | `/api/v1/admin/posts/:id/preview` | `posts.write` | PostsAdminController |
| POST | `/api/v1/admin/posts/:id/publish` | `posts.publish` | PostsAdminController |
| POST | `/api/v1/admin/posts/:id/restore` | `posts.publish` | PostsAdminController |
| GET | `/api/v1/admin/posts/:id/revisions` | `posts.write` | PostsAdminController |
| POST | `/api/v1/admin/posts/:id/schedule` | `posts.publish` | PostsAdminController |
| POST | `/api/v1/admin/posts/:id/slug` | `posts.publish` | PostsAdminController |
| POST | `/api/v1/admin/posts/:id/unpublish` | `posts.publish` | PostsAdminController |
| GET | `/api/v1/admin/redirects` | `redirects.manage` | RedirectsAdminController |
| POST | `/api/v1/admin/redirects` | `redirects.manage` | RedirectsAdminController |
| DELETE | `/api/v1/admin/redirects/:id` | `redirects.manage` | RedirectsAdminController |
| GET | `/api/v1/admin/reports` | `reports.manage` | ReportsAdminController |
| GET | `/api/v1/admin/reports/:id` | `reports.manage` | ReportsAdminController |
| POST | `/api/v1/admin/reports/:id/investigate` | `reports.manage` | ReportsAdminController |
| POST | `/api/v1/admin/reports/:id/resolve` | `reports.manage` | ReportsAdminController |
| GET | `/api/v1/admin/reviews` | `reviews.moderate` | ReviewsAdminController |
| GET | `/api/v1/admin/reviews/:id` | `reviews.moderate` | ReviewsAdminController |
| POST | `/api/v1/admin/reviews/:id/approve` | `reviews.moderate` | ReviewsAdminController |
| PATCH | `/api/v1/admin/reviews/:id/redaction` | `reviews.moderate` | ReviewsAdminController |
| POST | `/api/v1/admin/reviews/:id/reject` | `reviews.moderate` | ReviewsAdminController |
| POST | `/api/v1/admin/reviews/:id/spam` | `reviews.moderate` | ReviewsAdminController |
| GET | `/api/v1/admin/roles` | `roles.view` | AuthorizationController |
| POST | `/api/v1/admin/roles` | `roles.create` | AuthorizationController |
| DELETE | `/api/v1/admin/roles/:id` | `roles.delete` | AuthorizationController |
| GET | `/api/v1/admin/roles/:id` | `roles.view` | AuthorizationController |
| PATCH | `/api/v1/admin/roles/:id` | `roles.update` | AuthorizationController |
| PUT | `/api/v1/admin/roles/:id/permissions` | `roles.update` | AuthorizationController |
| GET | `/api/v1/admin/service-alerts` | `website.alerts.view` | AlertAdminController |
| POST | `/api/v1/admin/service-alerts` | `website.alerts.create` | AlertAdminController |
| DELETE | `/api/v1/admin/service-alerts/:id` | `website.alerts.delete` | AlertAdminController |
| GET | `/api/v1/admin/service-alerts/:id` | `website.alerts.view` | AlertAdminController |
| PUT | `/api/v1/admin/service-alerts/:id` | `website.alerts.update` | AlertAdminController |
| POST | `/api/v1/admin/service-alerts/:id/publish` | `website.alerts.publish` | AlertAdminController |
| POST | `/api/v1/admin/service-alerts/:id/unpublish` | `website.alerts.publish` | AlertAdminController |
| GET | `/api/v1/admin/services` | `taxonomy.manage` | AdminServicesController |
| POST | `/api/v1/admin/services` | `taxonomy.manage` | AdminServicesController |
| GET | `/api/v1/admin/services/:id` | `taxonomy.manage` | AdminServicesController |
| PATCH | `/api/v1/admin/services/:id` | `taxonomy.manage` | AdminServicesController |
| POST | `/api/v1/admin/services/:id/activate` | `taxonomy.manage` | AdminServicesController |
| POST | `/api/v1/admin/services/:id/deactivate` | `taxonomy.manage` | AdminServicesController |
| GET | `/api/v1/admin/settings/email` | `system.settings.view` | SettingsGroupsController |
| PUT | `/api/v1/admin/settings/email` | `system.settings.update` | SettingsGroupsController |
| GET | `/api/v1/admin/settings/general` | `settings.manage` | SettingsAdminController |
| PUT | `/api/v1/admin/settings/general` | `settings.manage` | SettingsAdminController |
| GET | `/api/v1/admin/settings/home` | `settings.manage` | SettingsAdminController |
| PUT | `/api/v1/admin/settings/home` | `settings.manage` | SettingsAdminController |
| GET | `/api/v1/admin/settings/operations` | `system.settings.view` | SettingsGroupsController |
| PUT | `/api/v1/admin/settings/operations` | `system.settings.update` | SettingsGroupsController |
| GET | `/api/v1/admin/settings/registry` | `SESSION ONLY` | SettingsGroupsController |
| GET | `/api/v1/admin/settings/security` | `security.settings.view` | SettingsGroupsController |
| PUT | `/api/v1/admin/settings/security` | `security.settings.update` | SettingsGroupsController |
| GET | `/api/v1/admin/system/cache` | `system.cache.view` | CacheAdminController |
| POST | `/api/v1/admin/system/cache/clear` | `system.cache.invalidate` | CacheAdminController |
| GET | `/api/v1/admin/system/queues` | `system.queues.view` | QueueMonitorController |
| POST | `/api/v1/admin/system/queues/:name/clean` | `system.queues.cancel` | QueueMonitorController |
| GET | `/api/v1/admin/system/queues/:name/jobs` | `system.queues.view` | QueueMonitorController |
| POST | `/api/v1/admin/system/queues/:name/pause` | `system.queues.pause` | QueueMonitorController |
| POST | `/api/v1/admin/system/queues/:name/remove` | `system.queues.cancel` | QueueMonitorController |
| POST | `/api/v1/admin/system/queues/:name/retry` | `system.queues.retry` | QueueMonitorController |
| GET | `/api/v1/admin/system/schedules` | `system.schedules.view` | SchedulesController |
| POST | `/api/v1/admin/system/schedules/:code/enabled` | `system.schedules.manage` | SchedulesController |
| POST | `/api/v1/admin/system/schedules/:code/run` | `system.schedules.run` | SchedulesController |
| GET | `/api/v1/admin/system/schedules/:code/runs` | `system.schedules.view` | SchedulesController |
| GET | `/api/v1/admin/testimonials` | `website.testimonials.view` | TestimonialAdminController |
| POST | `/api/v1/admin/testimonials` | `website.testimonials.create` | TestimonialAdminController |
| DELETE | `/api/v1/admin/testimonials/:id` | `website.testimonials.delete` | TestimonialAdminController |
| GET | `/api/v1/admin/testimonials/:id` | `website.testimonials.view` | TestimonialAdminController |
| PUT | `/api/v1/admin/testimonials/:id` | `website.testimonials.update` | TestimonialAdminController |
| POST | `/api/v1/admin/testimonials/:id/approve` | `website.testimonials.approve` | TestimonialAdminController |
| POST | `/api/v1/admin/testimonials/:id/publish` | `website.testimonials.publish` | TestimonialAdminController |
| POST | `/api/v1/admin/testimonials/:id/unpublish` | `website.testimonials.publish` | TestimonialAdminController |

### Routes outside /api/v1/admin

| Method | Route | Controller |
| --- | --- | --- |
| GET | `/api/v1/areas` | TaxonomyPublicController |
| GET | `/api/v1/blog-categories` | BlogPublicController |
| GET | `/api/v1/businesses` | DirectoryPublicController |
| POST | `/api/v1/businesses/:id/enquiries` | EnquiriesPublicController |
| GET | `/api/v1/businesses/:id/reviews` | ReviewsPublicController |
| POST | `/api/v1/businesses/:id/reviews` | ReviewsPublicController |
| GET | `/api/v1/businesses/:idOrSlug/related` | DirectoryPublicController |
| GET | `/api/v1/businesses/:slug` | DirectoryPublicController |
| GET | `/api/v1/categories` | TaxonomyPublicController |
| POST | `/api/v1/contact` | EnquiriesPublicController |
| GET | `/api/v1/faqs` | FaqPublicController |
| GET | `/api/v1/health` | HealthController |
| GET | `/api/v1/health/ready` | HealthController |
| GET | `/api/v1/home` | HomePublicController |
| GET | `/api/v1/pages` | StaticPagesPublicController |
| GET | `/api/v1/pages/:slug` | StaticPagesPublicController |
| GET | `/api/v1/partners` | PartnerPublicController |
| GET | `/api/v1/posts` | BlogPublicController |
| GET | `/api/v1/posts/:id/comments` | BlogPublicController |
| POST | `/api/v1/posts/:id/comments` | BlogPublicController |
| GET | `/api/v1/posts/:slug` | BlogPublicController |
| POST | `/api/v1/reports` | ReviewsPublicController |
| GET | `/api/v1/search/suggestions` | SearchPublicController |
| GET | `/api/v1/seo/redirects/resolve` | SeoPublicController |
| GET | `/api/v1/seo/sitemap/:section` | SeoPublicController |
| GET | `/api/v1/service-alerts` | AlertPublicController |
| GET | `/api/v1/services` | TaxonomyPublicController |
| GET | `/api/v1/site/context` | SiteController |
| GET | `/api/v1/site/metrics` | SiteController |
| GET | `/api/v1/site/settings` | SiteSettingsPublicController |
| GET | `/api/v1/tags` | BlogPublicController |
| GET | `/api/v1/testimonials` | TestimonialPublicController |
| POST | `/api/v1/webhooks/email` | EmailWebhookController |

**Totals:** 193 admin routes, 33 outside the admin prefix, 0 without a resolved declaration.
