import type { ComponentType } from 'react';
import { brandLabel } from '@/shared/brands';
import { GlobalOutlined, LinkOutlined, MailOutlined } from '@ant-design/icons';
import { SiFacebook, SiGithub, SiInstagram, SiMastodon, SiPinterest, SiThreads, SiTiktok, SiX, SiYoutube } from '@icons-pack/react-simple-icons';

/**
 * One mark and one name per link kind, shared by every admin screen that edits
 * a profile link: general settings, the business editor and the author editor.
 * The public site uses the same set (`apps/web/src/components/brand-icon.tsx`),
 * so an editor sees the icon a visitor will see.
 *
 * LinkedIn has no brand mark here on purpose: Simple Icons withdrew it at the
 * trademark owner's request, so that kind keeps the neutral globe.
 */
type IconComponent = ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;

/** Ant Design icons size by font, not by a `size` prop; this keeps both families on one interface. */
const antdIcon = (Icon: ComponentType<{ style?: React.CSSProperties; 'aria-hidden'?: boolean }>): IconComponent =>
  function AntdBrandIcon({ size = 16, ...rest }) {
    return <Icon style={{ fontSize: size }} {...rest} />;
  };

const ICONS: Record<string, IconComponent> = {
  facebook: SiFacebook,
  instagram: SiInstagram,
  x: SiX,
  linkedin: antdIcon(GlobalOutlined),
  youtube: SiYoutube,
  tiktok: SiTiktok,
  pinterest: SiPinterest,
  threads: SiThreads,
  mastodon: SiMastodon,
  github: SiGithub,
  website: antdIcon(GlobalOutlined),
  email: antdIcon(MailOutlined),
  other: antdIcon(LinkOutlined),
};



/** Renders the mark for a link kind. Decorative: always shown next to the name. */
export function BrandIcon({ kind, size = 16 }: { kind: string; size?: number }) {
  const Icon = ICONS[kind] ?? ICONS.other;
  return <Icon size={size} aria-hidden />;
}

/** Icon and name together, for a select option or a form label. */
export function BrandOptionLabel({ kind, suffix }: { kind: string; suffix?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <BrandIcon kind={kind} />
      {brandLabel(kind)}
      {suffix ? ` ${suffix}` : ''}
    </span>
  );
}
