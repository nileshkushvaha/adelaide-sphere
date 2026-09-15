import { useBranding } from './branding-context';

interface BrandProps {
  compact?: boolean;
  showSuffix?: boolean;
  /** The surface the logo sits on: the rail and the sign-in panel are dark, the phone top bar is light. */
  tone?: 'dark' | 'light';
  /** Rendered width of the full logo in CSS pixels; the height follows the artwork. */
  width?: number;
}

/**
 * The brand logo. An uploaded logo (Configuration → General settings) wins;
 * otherwise the bundled artwork is used. The bundled files are transparent and
 * cropped to the artwork, so they sit on any background without a box and fill
 * the width they are given instead of shrinking inside empty padding.
 */
export function Brand({ compact = false, showSuffix = true, tone = 'dark', width = 220 }: BrandProps) {
  const settings = useBranding();
  const name = settings?.name ?? 'Adelaide Sphere';
  const base = import.meta.env.BASE_URL;

  if (compact) {
    return (
      <img
        src={settings?.branding.favicon?.url ?? `${base}brand-favicon.png`}
        alt={name}
        width={34}
        height={34}
        style={{ display: 'block', objectFit: 'contain' }}
      />
    );
  }

  const uploaded = tone === 'dark' ? settings?.branding.darkLogo : settings?.branding.logo;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0, maxWidth: '100%' }}>
      <img
        src={uploaded?.url ?? `${base}brand-logo-${tone}.png`}
        alt={name}
        style={{ display: 'block', width, maxWidth: '100%', height: 'auto', maxHeight: Math.round(width / 3), objectFit: 'contain', objectPosition: 'left center' }}
      />
      {showSuffix && <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', color: tone === 'dark' ? '#c8d3ec' : '#4a5876' }}>Admin</span>}
    </span>
  );
}
