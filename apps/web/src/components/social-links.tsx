import type { SiteSettings } from '@/lib/api';
import { BrandIcon, brandLabel } from './brand-icon';

/**
 * Configured social profiles (SRS CFG 001). The API stores at most one URL per
 * platform and checks that it points at that platform's own domain, so a link
 * in the shell cannot be turned into a redirect on every page.
 *
 * The icon is decorative: each link carries the platform name as its accessible
 * name, so nothing depends on recognising a glyph (SRS NFR 011). Links open in
 * a new tab with `noopener` and `nofollow`, so an outbound profile carries no
 * ranking signal.
 */
export function SocialLinks({ links, label, tone = 'dark' }: { links: SiteSettings['social']; label: string; tone?: 'light' | 'dark' }) {
  if (links.length === 0) return null;
  const colour = tone === 'dark' ? 'text-band-muted hover:bg-white/10 hover:text-white' : 'text-text-muted hover:bg-surface-sunken hover:text-link';
  return (
    <ul aria-label={label} className="flex flex-wrap items-center gap-0.5">
      {links.map((link) => (
        <li key={link.platform}>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            // 36 px target inside the slim contact strip; 44 px everywhere the strip is not the constraint.
            className={`as-social-link inline-flex size-9 items-center justify-center rounded-full transition-colors ${colour}`}
          >
            <BrandIcon kind={link.platform} size={16} />
            <span className="sr-only">{brandLabel(link.platform)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
