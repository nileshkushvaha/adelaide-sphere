import type { PublicMenuItem, PublicMenus } from './api';

const link = (id: string, label: string, href: string, extra: Partial<PublicMenuItem> = {}): PublicMenuItem => ({
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

/**
 * The navigation the site shipped with before menus became editable (SRS UX
 * 002), used only when the API cannot be reached. Every link here is a product
 * route that always resolves; nothing depends on what has been published, so a
 * fallback can never point at a 404 — which is also why the policy links are
 * absent: whether they are published is exactly what the API would have said.
 */
export const DEFAULT_MENUS: PublicMenus = {
  primary: [
    link('default-home', 'Home', '/'),
    link('default-businesses', 'Businesses', '/business'),
    link('default-blog', 'Blog', '/blog'),
    link('default-about', 'About', '/about'),
    link('default-contact', 'Contact', '/contact'),
    link('default-add', 'Add a business', '/contact', { style: 'button' }),
  ],
  secondary: [],
  footer: [
    {
      ...link('default-information', 'Information', ''),
      href: null,
      children: [
        link('default-footer-about', 'About us', '/about'),
        link('default-footer-businesses', 'Businesses', '/business'),
        link('default-footer-blog', 'Latest articles', '/blog'),
        link('default-footer-contact', 'Contact us', '/contact'),
        link('default-footer-add', 'Add your business', '/contact'),
      ],
    },
  ],
  footer_bottom: [],
};
