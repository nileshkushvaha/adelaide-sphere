import { DEFAULT_ADELAIDE_MAP_SRC, SITE_MAP_TITLE, isSiteMapSrc } from '@adelaide-sphere/domain/embeds';
import { SectionHeading } from '@/components/page-shell';
import { fetchSiteSettings } from '@/lib/api';

/**
 * A full-width map of Adelaide above the footer on every public page (SRS 1.11
 * BUS 003). The map is shown directly; the browser requests it from Google only
 * as it scrolls into view (`loading="lazy"`), and its height is reserved so the
 * page does not move when it arrives. The address is the one chosen in General
 * settings, checked again here; anything else shows the built-in Adelaide map.
 */
export async function SiteMapBand() {
  const settings = await fetchSiteSettings();
  const configured = settings.siteMap?.src;
  const src = isSiteMapSrc(configured) ? configured : DEFAULT_ADELAIDE_MAP_SRC;
  const title = settings.siteMap?.title || SITE_MAP_TITLE;
  return (
    <section aria-labelledby="site-map-heading" className="ms-dot-grid bg-surface-sunken text-text">
      <div className="ms-container py-10 sm:py-12">
        <SectionHeading id="site-map-heading" eyebrow="Around the city" title="Explore Adelaide" description="Find your way around the city and its neighbourhoods." />
      </div>
      <div className="ms-site-map">
        <iframe src={src} title={title} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
      </div>
    </section>
  );
}
