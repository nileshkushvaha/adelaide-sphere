// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SITE_SETTINGS, type PublicMenuItem, type PublicMenus, type SiteSettings } from '@/lib/api';
import { DEFAULT_MENUS } from '@/lib/default-menus';

vi.mock('next/navigation', () => ({ usePathname: () => '/blog/a-long-read' }));

const fetchMenus = vi.fn<() => Promise<PublicMenus>>();
const fetchSiteSettings = vi.fn<() => Promise<SiteSettings>>();
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, fetchMenus: () => fetchMenus(), fetchSiteSettings: () => fetchSiteSettings() };
});

const loadHeader = async () => (await import('./site-header')).SiteHeader;
const loadFooter = async () => (await import('./site-footer')).SiteFooter;

const item = (id: string, label: string, href: string | null, extra: Partial<PublicMenuItem> = {}): PublicMenuItem => ({
  id,
  label,
  href,
  external: false,
  newTab: false,
  rel: null,
  title: null,
  description: null,
  icon: null,
  style: 'link',
  children: [],
  ...extra,
});

const MENUS: PublicMenus = {
  primary: [
    item('home', 'Home', '/'),
    item('businesses', 'Businesses', '/business', { children: [item('cbd', 'Adelaide CBD', '/business/area/adelaide-cbd', { description: 'The city centre' })] }),
    item('blog', 'Blog', '/blog'),
    item('add', 'Add a business', '/contact', { style: 'button' }),
  ],
  secondary: [item('help', 'Help', '/faqs')],
  footer: [
    item('areas', 'Local areas', null, { children: [item('norwood', 'Norwood', '/business/area/norwood')] }),
    item('info', 'Information', null, { children: [item('partner', 'Partner site', 'https://example.com', { external: true, newTab: true, rel: 'noopener noreferrer' })] }),
  ],
  footer_bottom: [item('privacy', 'Privacy Policy', '/privacy')],
};

// Each case re-imports the component after resetting the module registry, so
// the first assertion in a cold run waits on a real compile.
const MODULE_LOAD_TIMEOUT_MS = 20_000;

/**
 * Menu-driven navigation (SRS 1.9 MENU 005–006): the shell renders exactly
 * what the API resolved, so it never keeps a list of its own.
 */
describe('Header navigation from menus', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMenus.mockResolvedValue(MENUS);
    fetchSiteSettings.mockResolvedValue(DEFAULT_SITE_SETTINGS);
  });

  it('renders the primary menu, marks the section of the current page and shows button items as the call to action', async () => {
    const SiteHeader = await loadHeader();
    render(await SiteHeader());
    const main = screen.getByRole('navigation', { name: 'Main' });
    expect(within(main).getByRole('link', { name: 'Blog' })).toHaveAttribute('aria-current', 'page');
    expect(within(main).queryByRole('link', { name: 'Add a business' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a business' })).toHaveAttribute('href', '/contact');
  }, MODULE_LOAD_TIMEOUT_MS);

  it('opens a submenu with its own button, keeps the parent a link, and closes it with Escape', async () => {
    const SiteHeader = await loadHeader();
    render(await SiteHeader());
    const main = screen.getByRole('navigation', { name: 'Main' });
    expect(within(main).getByRole('link', { name: 'Businesses' })).toHaveAttribute('href', '/business');
    const toggle = within(main).getByRole('button', { name: 'Businesses submenu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toHaveAttribute('data-open');

    fireEvent.keyDown(toggle, { key: 'Escape' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  }, MODULE_LOAD_TIMEOUT_MS);

  it('shows the contact strip for a secondary menu even when no contact details are set', async () => {
    fetchSiteSettings.mockResolvedValue({ ...DEFAULT_SITE_SETTINGS, headerTopBarEnabled: true });
    const SiteHeader = await loadHeader();
    render(await SiteHeader());
    const secondary = screen.getByRole('navigation', { name: 'Secondary' });
    expect(within(secondary).getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/faqs');
  }, MODULE_LOAD_TIMEOUT_MS);

  it('falls back to product routes only, so a failed menu read never links to a 404', () => {
    const hrefs = [...DEFAULT_MENUS.primary, ...DEFAULT_MENUS.footer.flatMap((column) => column.children)].map((entry) => entry.href);
    expect(new Set(hrefs)).toEqual(new Set(['/', '/business', '/blog', '/about', '/contact']));
    expect(DEFAULT_MENUS.footer_bottom).toEqual([]);
  });
});

describe('Footer navigation from menus', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMenus.mockResolvedValue(MENUS);
    fetchSiteSettings.mockResolvedValue(DEFAULT_SITE_SETTINGS);
  });

  it('renders one labelled column per top-level item, the bottom links, and says when a link opens a new tab', async () => {
    const SiteFooter = await loadFooter();
    const { container } = render(await SiteFooter());
    const footer = within(container);
    const areas = footer.getByRole('navigation', { name: 'Local areas' });
    expect(within(areas).getByRole('link', { name: 'Norwood' })).toHaveAttribute('href', '/business/area/norwood');
    const partner = footer.getByRole('link', { name: /Partner site/ });
    expect(partner).toHaveAttribute('target', '_blank');
    expect(partner).toHaveAttribute('rel', 'noopener noreferrer');
    expect(partner).toHaveTextContent('(opens in a new tab)');
    expect(within(footer.getByRole('navigation', { name: 'Legal' })).getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
    // Nothing is hard-coded any more: a link the menu does not hold is not rendered.
    expect(footer.queryByRole('link', { name: 'Latest articles' })).not.toBeInTheDocument();
  }, MODULE_LOAD_TIMEOUT_MS);
});
