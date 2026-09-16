import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Avatar, Button, Drawer, Dropdown, Grid, Layout, Menu, Tooltip, Typography } from 'antd';
import {
  AlertOutlined,
  AppstoreOutlined,
  CommentOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  EditOutlined,
  EnvironmentOutlined,
  FileSearchOutlined,
  SearchOutlined,
  FileTextOutlined,
  LinkOutlined,
  LogoutOutlined,
  MailOutlined,
  MenuOutlined,
  PictureOutlined,
  QuestionCircleOutlined,
  ReadOutlined,
  SafetyOutlined,
  LayoutOutlined,
  SettingOutlined,
  ShopOutlined,
  StarOutlined,
  TagsOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  KeyOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useGetIdentity, useLogout, usePermissions } from '@refinedev/core';
import type { AdminSummary } from '@/api/auth';
import { Link, useLocation } from 'react-router';
import { Brand } from '@/components/Brand';
import { brand, layoutDimensions } from '@/config/theme';
import { useScrollableTables } from '@/shared/useScrollableTables';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ACTIVITY_VIEW_CODES, type PermissionCode } from '@/auth/permissions';
import type { LogoutParams } from '@/auth/auth-provider';

const { Header, Sider, Content, Footer } = Layout;

interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  /** One code, or a list of which any one is enough. */
  permission?: PermissionCode | readonly PermissionCode[];
}

interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

/**
 * Navigation grouped the way the work is grouped (SRS ADM 002). Hiding an entry
 * is a courtesy only; the API enforces permissions on every request (RBAC 001).
 */
const NAV_GROUPS: NavGroup[] = [
  {
    key: 'overview',
    label: 'Overview',
    items: [{ key: '/', label: 'Dashboard', icon: <DashboardOutlined aria-hidden="true" /> }],
  },
  {
    key: 'business',
    label: 'Business',
    items: [
      { key: '/businesses', label: 'Businesses', icon: <ShopOutlined aria-hidden="true" />, permission: 'listings.read' },
      { key: '/businesses/featured', label: 'Featured listings', icon: <StarOutlined aria-hidden="true" />, permission: 'featured.view' },
      { key: '/categories', label: 'Categories', icon: <AppstoreOutlined aria-hidden="true" />, permission: 'categories.view' },
      { key: '/services', label: 'Services', icon: <TagsOutlined aria-hidden="true" />, permission: 'services.view' },
      { key: '/areas', label: 'Local areas', icon: <EnvironmentOutlined aria-hidden="true" />, permission: 'areas.view' },
    ],
  },
  {
    key: 'editorial',
    label: 'Editorial',
    items: [
      { key: '/posts', label: 'Articles', icon: <ReadOutlined aria-hidden="true" />, permission: 'posts.view' },
      { key: '/authors', label: 'Authors', icon: <UserOutlined aria-hidden="true" />, permission: 'authors.view' },
      { key: '/blog-categories', label: 'Blog categories', icon: <EditOutlined aria-hidden="true" />, permission: 'blog_categories.view' },
      { key: '/blog-tags', label: 'Blog tags', icon: <TagsOutlined aria-hidden="true" />, permission: 'blog_tags.view' },
      { key: '/media', label: 'Media library', icon: <PictureOutlined aria-hidden="true" />, permission: 'media.view' },
    ],
  },
  {
    key: 'community',
    label: 'Community',
    items: [
      { key: '/enquiries', label: 'Enquiries', icon: <MailOutlined aria-hidden="true" />, permission: 'enquiries.read' },
      { key: '/reviews', label: 'Reviews', icon: <StarOutlined aria-hidden="true" />, permission: 'reviews.view' },
      { key: '/comments', label: 'Comments', icon: <CommentOutlined aria-hidden="true" />, permission: 'comments.view' },
      { key: '/reports', label: 'Abuse reports', icon: <AlertOutlined aria-hidden="true" />, permission: 'reports.view' },
    ],
  },
  {
    key: 'configuration',
    label: 'Configuration',
    items: [
      { key: '/settings/general', label: 'General settings', icon: <SettingOutlined aria-hidden="true" />, permission: 'settings.general.view' },
      { key: '/settings', label: 'Home page settings', icon: <LayoutOutlined aria-hidden="true" />, permission: 'settings.home.view' },
      { key: '/settings/seo', label: 'SEO settings', icon: <SearchOutlined aria-hidden="true" />, permission: 'settings.seo.view' },
      { key: '/redirects', label: 'SEO redirects', icon: <LinkOutlined aria-hidden="true" />, permission: 'redirects.view' },
      { key: '/admins', label: 'Administrators', icon: <TeamOutlined aria-hidden="true" />, permission: 'admins.view' },
      { key: '/roles', label: 'Roles', icon: <SafetyCertificateOutlined aria-hidden="true" />, permission: 'roles.view' },
      { key: '/permissions', label: 'Permissions', icon: <KeyOutlined aria-hidden="true" />, permission: 'permissions.view' },
      { key: '/audit', label: 'Activity log', icon: <FileSearchOutlined aria-hidden="true" />, permission: ACTIVITY_VIEW_CODES },
    ],
  },
  {
    key: 'website',
    label: 'Website',
    items: [
      { key: '/website/pages', label: 'Pages', icon: <FileTextOutlined aria-hidden="true" />, permission: 'website.pages.view' },
      { key: '/website/menus', label: 'Menus', icon: <MenuOutlined aria-hidden="true" />, permission: 'website.menus.view' },
      { key: '/website/faqs', label: 'FAQs', icon: <QuestionCircleOutlined aria-hidden="true" />, permission: 'website.faqs.view' },
      { key: '/website/service-alerts', label: 'Service alerts', icon: <AlertOutlined aria-hidden="true" />, permission: 'website.alerts.view' },
      { key: '/website/testimonials', label: 'Testimonials', icon: <CommentOutlined aria-hidden="true" />, permission: 'website.testimonials.view' },
      { key: '/website/partners', label: 'Clients and partners', icon: <ShopOutlined aria-hidden="true" />, permission: 'website.clients.view' },
    ],
  },
  {
    key: 'security',
    label: 'Security',
    items: [
      { key: '/security/settings', label: 'Security settings', icon: <SafetyOutlined aria-hidden="true" />, permission: 'security.settings.view' },
    ],
  },
  {
    key: 'system',
    label: 'System',
    items: [
      { key: '/system/email-logs', label: 'Email logs', icon: <MailOutlined aria-hidden="true" />, permission: 'system.email_logs.view' },
      { key: '/system/cache', label: 'Cache manager', icon: <DatabaseOutlined aria-hidden="true" />, permission: 'system.cache.view' },
      { key: '/system/queues', label: 'Queue monitor', icon: <ThunderboltOutlined aria-hidden="true" />, permission: 'system.queues.view' },
      { key: '/system/schedules', label: 'Scheduled tasks', icon: <ClockCircleOutlined aria-hidden="true" />, permission: 'system.schedules.view' },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

interface AdminShellProps {
  children: ReactNode;
}

/**
 * Application frame: brand header with the account menu, grouped side
 * navigation on desktop, drawer navigation on small screens, skip link and
 * landmarks.
 */
export function AdminShell({ children }: AdminShellProps) {
  useScrollableTables();
  const screens = Grid.useBreakpoint();
  const isMobile = screens.lg === false; // undefined during first render → treat as desktop
  // Below Ant's smallest breakpoint the top bar has room for controls only.
  const isNarrow = screens.xs === true && screens.sm !== true;
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navId = useId();
  const { data: identity } = useGetIdentity<AdminSummary>();
  const { data: permissions } = usePermissions<string[]>({});
  const { mutate: logout, isPending: loggingOut } = useLogout<LogoutParams>();

  // `undefined` means the server has not answered yet. Nothing permission-gated
  // is rendered until it has, so no entry appears and is then withdrawn
  // (SRS RBAC 010); the shell shows the navigation as a quiet waiting state.
  const capabilitiesKnown = permissions !== undefined;
  const groups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.permission || (capabilitiesKnown && (typeof item.permission === 'string' ? [item.permission] : item.permission).some((code) => (permissions ?? []).includes(code)))),
      })).filter((group) => group.items.length > 0),
    [permissions, capabilitiesKnown],
  );

  // Escape closes the mobile drawer wherever focus is (WCAG 2.1.2 / dialog convention).
  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  // Longest matching path wins, so /posts/new highlights Articles, not Dashboard.
  const active = ALL_ITEMS.filter((item) => item.key !== '/' && location.pathname.startsWith(item.key)).sort((a, b) => b.key.length - a.key.length)[0];
  // Screens reached from the account menu rather than the navigation still need
  // a name in the bar; without this they read as "Dashboard", which is wrong.
  const OFF_MENU_TITLES: Record<string, string> = { '/account': 'Account security' };
  const barTitle = OFF_MENU_TITLES[location.pathname] ?? (active?.label as string | undefined) ?? 'Dashboard';
  const selectedKeys = [active?.key ?? (location.pathname === '/' ? '/' : '')];

  const menu = (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={selectedKeys}
      // Navigating from the drawer closes it; focus returns to the toggle via afterOpenChange.
      onClick={() => setDrawerOpen(false)}
      items={groups.map((group) => ({
        key: group.key,
        type: 'group' as const,
        label: collapsed && !isMobile ? undefined : group.label,
        children: group.items.map((item) => ({
          key: item.key,
          icon: item.icon,
          label: <Link to={item.key}>{item.label}</Link>,
        })),
      }))}
      style={{ borderInlineEnd: 0, background: 'transparent', paddingBlock: 8 }}
    />
  );

  const initials = (identity?.displayName ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <Layout className="as-app" style={{ minHeight: '100vh' }}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      {/* The rail spans the full height and the top bar sits beside it, so the
          brand, the navigation and the account block form one column rather
          than being cut in half by a band across the top. */}
      <Layout style={{ minHeight: '100vh' }}>
        {isMobile ? (
          <Drawer
            id={navId}
            placement="left"
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            afterOpenChange={(open) => {
              if (!open) toggleRef.current?.focus();
            }}
            width={layoutDimensions.siderWidth}
            classNames={{ body: 'as-drawer-nav' }}
            styles={{ body: { padding: 0 }, header: { background: brand.navy, color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.08)' } }}
            title={<span style={{ color: '#FFFFFF' }}>Navigation</span>}
            closeIcon={
              <span aria-hidden="true" style={{ color: '#FFFFFF', fontSize: 20 }}>
                ×
              </span>
            }
          >
            <nav aria-label="Admin navigation">{menu}</nav>
          </Drawer>
        ) : (
          <Sider
            id={navId}
            className="as-sider"
            width={layoutDimensions.siderWidth}
            collapsedWidth={layoutDimensions.siderCollapsedWidth}
            collapsed={collapsed}
            trigger={null}
            style={{ position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            {/* The brand heads the rail, above the scrolling navigation, so it
                stays put while a long menu moves. */}
            <div style={{ height: layoutDimensions.headerHeight, display: 'flex', alignItems: 'center', paddingInline: collapsed ? 0 : 20, justifyContent: collapsed ? 'center' : 'flex-start', flexShrink: 0 }}>
              <Link to="/" aria-label="Adelaide Sphere Admin home" style={{ display: 'inline-flex' }}>
                <Brand compact={collapsed} showSuffix={false} />
              </Link>
            </div>
            <nav aria-label="Admin navigation" className="as-sider-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 8 }}>
              {menu}
            </nav>
            {identity && (
              <div className="as-sider-account" style={{ flexShrink: 0, padding: collapsed ? '12px 0' : '12px 16px', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 10 }}>
                <Avatar size={32} style={{ background: brand.primarySolid, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                  {initials || <UserOutlined aria-hidden="true" />}
                </Avatar>
                {!collapsed && (
                  <span style={{ minWidth: 0, lineHeight: 1.3 }}>
                    <span style={{ display: 'block', color: '#FFFFFF', fontSize: 13, fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{identity.displayName}</span>
                    <span style={{ display: 'block', color: brand.navyMuted, fontSize: 12 }}>Adelaide only</span>
                  </span>
                )}
              </div>
            )}
          </Sider>
        )}
        <Layout style={{ minWidth: 0 }}>
      <Header className="as-topbar" role="banner" style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 100 }}>
        <Button
          ref={toggleRef}
          type="text"
          icon={<MenuOutlined aria-hidden="true" />}
          aria-label={isMobile ? (drawerOpen ? 'Close navigation' : 'Open navigation') : collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-expanded={isMobile ? drawerOpen : !collapsed}
          aria-controls={navId}
          onClick={() => (isMobile ? setDrawerOpen((open) => !open) : setCollapsed((c) => !c))}
        />
        {/* On desktop the brand lives at the head of the navigation rail, so the
            top bar carries the location instead of repeating the product name. */}
        {isMobile ? (
          // At 320 px the bar holds a menu button, a link to the site and the
          // account button; the wordmark is the one thing that can go, and the
          // link keeps its accessible name either way.
          <Link to="/" aria-label="Adelaide Sphere Admin home" style={{ display: 'inline-flex', minWidth: 0, overflow: 'hidden' }}>
            <Brand compact={isNarrow} tone="light" width={168} showSuffix={false} />
          </Link>
        ) : (
          <Typography.Text style={{ fontWeight: 600, fontSize: 15, color: brand.text }}>{barTitle}</Typography.Text>
        )}
        <span style={{ flex: 1, minWidth: 0 }} />
        <Tooltip title="Open the public site in a new tab">
          {/* On a phone the label is dropped for room, so the name has to come
              from somewhere: an icon-only link with no text is unusable with a
              screen reader (WCAG 2.4.4). */}
          <Button
            type="text"
            href={import.meta.env.VITE_PUBLIC_SITE_URL ?? '/'}
            target="_blank"
            rel="noreferrer noopener"
            icon={<LinkOutlined aria-hidden="true" />}
            aria-label="View the public site in a new tab"
            style={{ color: brand.textMuted }}
          >
            {isMobile ? null : 'View site'}
          </Button>
        </Tooltip>
        <ThemeToggle />
        {identity && (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'who', disabled: true, label: <span style={{ display: 'block', maxWidth: 240 }}>{identity.email}</span> },
                { type: 'divider' as const },
                { key: 'account', icon: <SafetyOutlined aria-hidden="true" />, label: <Link to="/account">Account security</Link> },
                { key: 'signout', icon: <LogoutOutlined aria-hidden="true" />, danger: true, label: 'Sign out', onClick: () => logout({ signedOut: true }) },
              ],
            }}
          >
            <Button type="text" loading={loggingOut} style={{ height: 40, paddingInline: 8 }} aria-label={`Account menu for ${identity.displayName}`}>
              {/* The name is already at the foot of the rail; repeating it here
                  would say the same thing twice on one screen. */}
              <Avatar size={30} style={{ background: brand.primarySolid, fontSize: 12, fontWeight: 600 }}>
                {initials || <UserOutlined aria-hidden="true" />}
              </Avatar>
            </Button>
          </Dropdown>
        )}
      </Header>
          <Content id="main-content" tabIndex={-1} role="main" style={{ padding: isMobile ? '16px 16px 8px' : '28px 32px 12px', maxWidth: layoutDimensions.contentMaxWidth, width: '100%', margin: '0 auto' }}>
            {children}
          </Content>
          <Footer role="contentinfo" style={{ background: 'transparent', padding: isMobile ? '8px 16px 20px' : '8px 32px 24px', maxWidth: layoutDimensions.contentMaxWidth, width: '100%', margin: '0 auto' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Adelaide Sphere Admin · sessions expire after 30 minutes of inactivity
            </Typography.Text>
          </Footer>
        </Layout>
      </Layout>
    </Layout>
  );
}
