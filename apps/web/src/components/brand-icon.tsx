import { createElement, type ComponentType } from 'react';
import { GlobeIcon, LinkIcon, MailIcon } from 'lucide-react';
import { SiFacebook, SiGithub, SiInstagram, SiMastodon, SiPinterest, SiThreads, SiTiktok, SiX, SiYoutube } from '@icons-pack/react-simple-icons';

/**
 * One icon and one name per link kind, shared by every surface that shows a
 * profile link: the site's own social links, a listing's links, an author's
 * profile links and the share row.
 *
 * The mark is decorative — each link carries the platform name as its
 * accessible name, so nothing depends on recognising a glyph (SRS NFR 011).
 * LinkedIn has no mark here on purpose: Simple Icons withdrew it at the
 * trademark owner's request, and hand-copying the logo would reinstate exactly
 * what was withdrawn, so that link keeps the neutral globe and its name.
 */
export type BrandKind =
  | 'facebook'
  | 'instagram'
  | 'x'
  | 'linkedin'
  | 'youtube'
  | 'tiktok'
  | 'pinterest'
  | 'threads'
  | 'mastodon'
  | 'github'
  | 'website'
  | 'email'
  | 'other';

type IconComponent = ComponentType<{ size?: number | string; className?: string; 'aria-hidden'?: boolean }>;

const ICONS: Record<BrandKind, IconComponent> = {
  facebook: SiFacebook,
  instagram: SiInstagram,
  x: SiX,
  linkedin: GlobeIcon,
  youtube: SiYoutube,
  tiktok: SiTiktok,
  pinterest: SiPinterest,
  threads: SiThreads,
  mastodon: SiMastodon,
  github: SiGithub,
  website: GlobeIcon,
  email: MailIcon,
  other: LinkIcon,
};

const LABELS: Record<BrandKind, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  x: 'X',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  pinterest: 'Pinterest',
  threads: 'Threads',
  mastodon: 'Mastodon',
  github: 'GitHub',
  website: 'Website',
  email: 'Email',
  other: 'Profile',
};

const isBrandKind = (kind: string): kind is BrandKind => kind in ICONS;

/** The icon for a link kind; an unknown kind falls back to the neutral link mark. */
export function brandIcon(kind: string): IconComponent {
  return isBrandKind(kind) ? ICONS[kind] : ICONS.other;
}

/** The name for a link kind, used as the accessible name wherever the icon stands alone. */
export function brandLabel(kind: string): string {
  return isBrandKind(kind) ? LABELS[kind] : LABELS.other;
}

/** Renders the mark for a link kind. Always decorative: pair it with a visible or screen-reader name. */
export function BrandIcon({ kind, size = 16, className }: { kind: string; size?: number; className?: string }) {
  // Created explicitly rather than as JSX: the component comes from a fixed
  // table keyed by the link kind, not from anything built during this render.
  return createElement(brandIcon(kind), { size, className, 'aria-hidden': true });
}
