import { Suspense, lazy } from 'react';
import { Authenticated } from '@refinedev/core';
import { CatchAllNavigate } from '@refinedev/react-router';
import { Navigate, Outlet, Route, Routes } from 'react-router';
import { AdminShell } from '@/layouts/AdminShell';
import { PageLoader } from '@/components/ui';
import { RouteErrorBoundary } from '@/components/ErrorBoundary';
import { RequirePermission } from '@/auth/RequirePermission';
import { AcceptSetupPage } from '@/pages/AcceptSetupPage';
import { AREAS_CONFIG, CATEGORIES_CONFIG, SERVICES_CONFIG } from '@/pages/taxonomy/configs';
import { BLOG_CATEGORIES_CONFIG, BLOG_TAGS_CONFIG } from '@/pages/blog/editorial-configs';
import { DashboardPage } from '@/pages/DashboardPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';

/** Screens that carry their own heavy dependencies load on demand (SRS NFR 005). */
const AccountSecurityPage = lazy(() => import('@/pages/account/AccountSecurityPage').then((m) => ({ default: m.AccountSecurityPage })));
const AdminDetailPage = lazy(() => import('@/pages/admins/AdminDetailPage').then((m) => ({ default: m.AdminDetailPage })));
const AdministratorsPage = lazy(() => import('@/pages/admins/AdministratorsPage').then((m) => ({ default: m.AdministratorsPage })));
const AdminInvitePage = lazy(() => import('@/pages/admins/AdminInvitePage').then((m) => ({ default: m.AdminInvitePage })));
const EditorialTermsPage = lazy(() => import('@/pages/blog/EditorialTermsPage').then((m) => ({ default: m.EditorialTermsPage })));
const EditorialTermEditorPage = lazy(() => import('@/pages/blog/EditorialTermEditorPage').then((m) => ({ default: m.EditorialTermEditorPage })));
const TermsPage = lazy(() => import('@/pages/taxonomy/TermsPage').then((m) => ({ default: m.TermsPage })));
const TermEditorPage = lazy(() => import('@/pages/taxonomy/TermEditorPage').then((m) => ({ default: m.TermEditorPage })));
const PostsPage = lazy(() => import('@/pages/blog/PostsPage').then((m) => ({ default: m.PostsPage })));
const BusinessesPage = lazy(() => import('@/pages/businesses/BusinessesPage').then((m) => ({ default: m.BusinessesPage })));
const AuthorsPage = lazy(() => import('@/pages/blog/AuthorsPage').then((m) => ({ default: m.AuthorsPage })));
const RedirectsPage = lazy(() => import('@/pages/seo/RedirectsPage').then((m) => ({ default: m.RedirectsPage })));
const RedirectEditorPage = lazy(() => import('@/pages/seo/RedirectEditorPage').then((m) => ({ default: m.RedirectEditorPage })));
const EnquiriesPage = lazy(() => import('@/pages/enquiries/EnquiriesPage').then((m) => ({ default: m.EnquiriesPage })));
const CommentsPage = lazy(() => import('@/pages/moderation/CommentsPage').then((m) => ({ default: m.CommentsPage })));
const ReportsPage = lazy(() => import('@/pages/moderation/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const ReviewsPage = lazy(() => import('@/pages/moderation/ReviewsPage').then((m) => ({ default: m.ReviewsPage })));
const FeaturedPage = lazy(() => import('@/pages/businesses/FeaturedPage').then((m) => ({ default: m.FeaturedPage })));
const FeaturedEditorPage = lazy(() => import('@/pages/businesses/FeaturedEditorPage').then((m) => ({ default: m.FeaturedEditorPage })));
const BusinessEditorPage = lazy(() => import('@/pages/businesses/BusinessEditorPage').then((m) => ({ default: m.BusinessEditorPage })));
const MediaLibraryPage = lazy(() => import('@/pages/media/MediaLibraryPage').then((m) => ({ default: m.MediaLibraryPage })));
const MediaDetailPage = lazy(() => import('@/pages/media/MediaDetailPage').then((m) => ({ default: m.MediaDetailPage })));
const PostEditorPage = lazy(() => import('@/pages/blog/PostEditorPage').then((m) => ({ default: m.PostEditorPage })));
const AuthorEditorPage = lazy(() => import('@/pages/blog/AuthorEditorPage').then((m) => ({ default: m.AuthorEditorPage })));
const PagesPage = lazy(() => import('@/pages/website/PagesPage').then((m) => ({ default: m.PagesPage })));
const PageEditorPage = lazy(() => import('@/pages/website/PageEditorPage').then((m) => ({ default: m.PageEditorPage })));
const PageCreatePage = lazy(() => import('@/pages/website/PageCreatePage').then((m) => ({ default: m.PageCreatePage })));
const SiteSettingsPage = lazy(() => import('@/pages/settings/SiteSettingsPage').then((m) => ({ default: m.SiteSettingsPage })));
const GeneralSettingsPage = lazy(() => import('@/pages/settings/GeneralSettingsPage').then((m) => ({ default: m.GeneralSettingsPage })));
const SeoSettingsPage = lazy(() => import('@/pages/settings/SeoSettingsPage').then((m) => ({ default: m.SeoSettingsPage })));
const AuditLogPage = lazy(() => import('@/pages/AuditLogPage').then((m) => ({ default: m.AuditLogPage })));
const EmailLogsPage = lazy(() => import('@/pages/system/EmailLogsPage').then((m) => ({ default: m.EmailLogsPage })));
const FaqsPage = lazy(() => import('@/pages/website/FaqsPage').then((m) => ({ default: m.FaqsPage })));
const FaqEditorPage = lazy(() => import('@/pages/website/FaqEditorPage').then((m) => ({ default: m.FaqEditorPage })));
const ServiceAlertsPage = lazy(() => import('@/pages/website/ServiceAlertsPage').then((m) => ({ default: m.ServiceAlertsPage })));
const ServiceAlertEditorPage = lazy(() => import('@/pages/website/ServiceAlertEditorPage').then((m) => ({ default: m.ServiceAlertEditorPage })));
const TestimonialsPage = lazy(() => import('@/pages/website/TestimonialsPage').then((m) => ({ default: m.TestimonialsPage })));
const MenusPage = lazy(() => import('@/pages/website/menus/MenusPage').then((m) => ({ default: m.MenusPage })));
const PartnersPage = lazy(() => import('@/pages/website/PartnersPage').then((m) => ({ default: m.PartnersPage })));
const CacheManagerPage = lazy(() => import('@/pages/system/CacheManagerPage').then((m) => ({ default: m.CacheManagerPage })));
const QueueMonitorPage = lazy(() => import('@/pages/system/QueueMonitorPage').then((m) => ({ default: m.QueueMonitorPage })));
const ScheduledTasksPage = lazy(() => import('@/pages/system/ScheduledTasksPage').then((m) => ({ default: m.ScheduledTasksPage })));
const TestimonialEditorPage = lazy(() => import('@/pages/website/TestimonialEditorPage').then((m) => ({ default: m.TestimonialEditorPage })));
const PartnerEditorPage = lazy(() => import('@/pages/website/PartnerEditorPage').then((m) => ({ default: m.PartnerEditorPage })));
const SecuritySettingsPage = lazy(() => import('@/pages/security/SecuritySettingsPage').then((m) => ({ default: m.SecuritySettingsPage })));
const RolesPage = lazy(() => import('@/pages/access/RolesPage').then((m) => ({ default: m.RolesPage })));
const RoleEditorPage = lazy(() => import('@/pages/access/RoleEditorPage').then((m) => ({ default: m.RoleEditorPage })));
const PermissionCatalogPage = lazy(() => import('@/pages/access/PermissionCatalogPage').then((m) => ({ default: m.PermissionCatalogPage })));

/**
 * Route table. Everything inside the shell requires a server-verified session
 * (Refine <Authenticated> → authProvider.check → GET /api/v1/admin/auth/me);
 * the API enforces authorisation independently on every request (SRS RBAC 001).
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/accept-setup" element={<AcceptSetupPage />} />
      <Route
        element={
          <Authenticated key="admin-shell" fallback={<CatchAllNavigate to="/login" />} loading={<PageLoader label="Checking your session…" minHeight={320} />}>
            <AdminShell>
              {/*
                One route guard for every screen: it reads the required
                permissions from the canonical route mapping, waits while
                capabilities are unknown and renders the forbidden state instead
                of the page when they are not held (SRS RBAC 010). The API
                enforces the same permission on every request the page makes.
              */}
              <RequirePermission>
                <RouteErrorBoundary>
                  <Suspense fallback={<PageLoader label="Loading this screen…" />}>
                    <Outlet />
                  </Suspense>
                </RouteErrorBoundary>
              </RequirePermission>
            </AdminShell>
          </Authenticated>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="/businesses" element={<BusinessesPage />} />
        <Route path="/businesses/featured" element={<FeaturedPage />} />
        <Route path="/businesses/featured/new" element={<FeaturedEditorPage />} />
        <Route path="/businesses/new" element={<BusinessEditorPage />} />
        <Route path="/businesses/:id" element={<BusinessEditorPage />} />
        <Route path="/categories" element={<TermsPage config={CATEGORIES_CONFIG} />} />
        <Route path="/categories/new" element={<TermEditorPage config={CATEGORIES_CONFIG} />} />
        <Route path="/categories/:id" element={<TermEditorPage config={CATEGORIES_CONFIG} />} />
        <Route path="/services" element={<TermsPage config={SERVICES_CONFIG} />} />
        <Route path="/services/new" element={<TermEditorPage config={SERVICES_CONFIG} />} />
        <Route path="/services/:id" element={<TermEditorPage config={SERVICES_CONFIG} />} />
        <Route path="/areas" element={<TermsPage config={AREAS_CONFIG} />} />
        <Route path="/areas/new" element={<TermEditorPage config={AREAS_CONFIG} />} />
        <Route path="/areas/:id" element={<TermEditorPage config={AREAS_CONFIG} />} />
        <Route path="/media" element={<MediaLibraryPage />} />
        <Route path="/media/:id" element={<MediaDetailPage />} />
        <Route path="/posts" element={<PostsPage />} />
        <Route path="/posts/new" element={<PostEditorPage />} />
        <Route path="/posts/:id" element={<PostEditorPage />} />
        <Route path="/authors" element={<AuthorsPage />} />
        <Route path="/authors/new" element={<AuthorEditorPage />} />
        <Route path="/authors/:id" element={<AuthorEditorPage />} />
        <Route path="/blog-categories" element={<EditorialTermsPage config={BLOG_CATEGORIES_CONFIG} />} />
        <Route path="/blog-categories/new" element={<EditorialTermEditorPage config={BLOG_CATEGORIES_CONFIG} />} />
        <Route path="/blog-categories/:id" element={<EditorialTermEditorPage config={BLOG_CATEGORIES_CONFIG} />} />
        <Route path="/blog-tags" element={<EditorialTermsPage config={BLOG_TAGS_CONFIG} />} />
        <Route path="/blog-tags/new" element={<EditorialTermEditorPage config={BLOG_TAGS_CONFIG} />} />
        <Route path="/blog-tags/:id" element={<EditorialTermEditorPage config={BLOG_TAGS_CONFIG} />} />
        <Route path="/enquiries" element={<EnquiriesPage />} />
        <Route path="/comments" element={<CommentsPage />} />
        <Route path="/reviews" element={<ReviewsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings/general" element={<GeneralSettingsPage />} />
        <Route path="/settings/seo" element={<SeoSettingsPage />} />
        <Route path="/settings" element={<SiteSettingsPage />} />
        <Route path="/redirects" element={<RedirectsPage />} />
        <Route path="/redirects/new" element={<RedirectEditorPage />} />
        <Route path="/admins" element={<AdministratorsPage />} />
        <Route path="/admins/new" element={<AdminInvitePage />} />
        <Route path="/admins/:id" element={<AdminDetailPage />} />
        <Route path="/account" element={<AccountSecurityPage />} />
        <Route path="/roles" element={<RolesPage />} />
        <Route path="/roles/new" element={<RoleEditorPage />} />
        <Route path="/roles/:id" element={<RoleEditorPage />} />
        <Route path="/permissions" element={<PermissionCatalogPage />} />
        <Route path="/audit" element={<AuditLogPage />} />
        <Route path="/system/email-logs" element={<EmailLogsPage />} />
        <Route path="/website/pages" element={<PagesPage />} />
        <Route path="/website/pages/new" element={<PageCreatePage />} />
        <Route path="/website/pages/:slug" element={<PageEditorPage />} />
        {/* The information pages moved under Website in SRS 1.6; old links follow. */}
        <Route path="/pages" element={<Navigate to="/website/pages" replace />} />
        <Route path="/website/faqs" element={<FaqsPage />} />
        <Route path="/website/faqs/new" element={<FaqEditorPage />} />
        <Route path="/website/faqs/:id" element={<FaqEditorPage />} />
        <Route path="/website/service-alerts" element={<ServiceAlertsPage />} />
        <Route path="/website/service-alerts/new" element={<ServiceAlertEditorPage />} />
        <Route path="/website/service-alerts/:id" element={<ServiceAlertEditorPage />} />
        <Route path="/website/testimonials" element={<TestimonialsPage />} />
        <Route path="/website/testimonials/new" element={<TestimonialEditorPage />} />
        <Route path="/website/testimonials/:id" element={<TestimonialEditorPage />} />
        <Route path="/website/partners" element={<PartnersPage />} />
        <Route path="/website/partners/new" element={<PartnerEditorPage />} />
        <Route path="/website/partners/:id" element={<PartnerEditorPage />} />
        <Route path="/website/menus" element={<MenusPage />} />
        <Route path="/security/settings" element={<SecuritySettingsPage />} />
        <Route path="/system/cache" element={<CacheManagerPage />} />
        <Route path="/system/queues" element={<QueueMonitorPage />} />
        <Route path="/system/schedules" element={<ScheduledTasksPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
