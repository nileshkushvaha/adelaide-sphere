import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { SiteAnalytics } from '@/components/site-analytics';
import { AnalyticsEvents } from '@/components/analytics-events';
import { SiteFooter } from '@/components/site-footer';
import { HideOnPaths } from '@/components/hide-on-paths';
import { SiteMapBand } from '@/components/site-map-band';
import { ServiceAlertBar } from '@/components/service-alert-bar';
import { SiteHeader } from '@/components/site-header';
import { PageMotion } from '@/components/page-motion';
import { RouteProgress } from '@/components/route-progress';
import Script from 'next/script';
import { siteOrigin, siteTitle, turnstileSiteKey, siteNoindex } from '@/lib/site';
import { fetchSiteSettings } from '@/lib/api';
import './globals.css';

const bodyFont = Inter({ variable: '--font-body', subsets: ['latin'], display: 'swap' });
/** Plus Jakarta Sans adds expressive headings alongside the neutral Inter body face. */
const displayFont = Plus_Jakarta_Sans({ variable: '--font-display', subsets: ['latin'], display: 'swap' });

/**
 * Site-wide metadata from the general settings (SRS CFG 001, SEO 001): the
 * name, title template, default description, browser icon and default share
 * image are all editable, and each falls back to a shipped default so the
 * document is never missing them.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await fetchSiteSettings();
  const { favicon, shareImage } = settings.branding;
  return {
    metadataBase: new URL(siteOrigin()),
    // The full name, not the short one: "· Sphere" on its own does not tell a
    // search result which site it is (SRS SEO 001).
    title: { default: siteTitle(settings), template: `%s · ${settings.name}` },
    description: settings.metaDescription ?? undefined,
    applicationName: settings.name,
    alternates: { types: { 'application/rss+xml': [{ url: '/blog/feed.xml', title: `${settings.name} blog` }] } },
    // Pages built with `pageMetadata` replace these with their own complete set;
    // they stand only for a route that declares nothing (SRS SEO 001).
    robots: siteNoindex() ? { index: false, follow: false } : { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 } },
    openGraph: {
      siteName: settings.name,
      locale: 'en_AU',
      type: 'website',
      ...(shareImage ? { images: [{ url: shareImage.url, width: shareImage.width, height: shareImage.height, alt: shareImage.alt || settings.name }] } : {}),
    },
    twitter: { card: settings.seo?.twitterCard === 'summary' ? 'summary' : 'summary_large_image' },
    // Declared explicitly rather than through the app-directory file convention:
    // the generated icon module is pulled into every render, including error and
    // not-found responses, where it prevented the HTML from being produced.
    icons: { icon: favicon ? favicon.url : '/brand-favicon.png' },
    // A verification tag proves ownership to Google; it loads nothing and sets
    // no cookie. The analytics identifiers beside it in the settings are
    // deliberately not rendered — see the note on the SEO settings screen.
    ...(settings.seo?.googleSiteVerification ? { verification: { google: settings.seo.googleSiteVerification } } : {}),
  };
}

/**
 * Public shell: skip link, landmarks, header and footer (SRS UX 002, NFR 011).
 * `main` carries no width of its own — sections are full-bleed and bound their
 * own content with `.as-container`, so the page can alternate light and dark
 * bands across the whole viewport instead of living in one narrow column.
 */
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-AU" className={`${bodyFont.variable} ${displayFont.variable} h-full antialiased`}>
      {/* Browser extensions (ColorZilla's `cz-shortcut-listen`, Grammarly and
          others) write attributes onto <body> before React hydrates. This
          ignores attribute differences on this one element only; its
          children are still checked. */}
      <body suppressHydrationWarning className="flex min-h-full flex-col font-sans">
        <a className="as-skip-link" href="#main-content">
          Skip to main content
        </a>
        {/* Reads the current address, so it needs its own boundary; it adds an
            indicator to client navigations and never gates the page itself. */}
        <Suspense fallback={null}>
          <RouteProgress />
          <PageMotion />
        </Suspense>
        {/* Above the header on every public page (SRS 1.2 ALRT 002). Rendered
            in document order rather than inside a Suspense boundary: a streamed
            boundary is swapped in after the header, which puts the alert in the
            wrong place and shifts the page as it arrives (NFR 001). */}
        <ServiceAlertBar />
        <SiteHeader />
        <main id="main-content" className="w-full flex-1">
          {children}
        </main>
        {/* The map above the footer on every public page, except private previews (SRS 1.11 BUS 003). */}
        <HideOnPaths prefixes={['/preview/']}>
          <SiteMapBand />
        </HideOnPaths>
        <SiteFooter />
        {/* The cookie question and the analytics it governs. Placed last so it
            is the final thing in the tab order: a visitor who ignores it can
            use the whole site first. */}
        <Suspense fallback={null}>
          <SiteAnalytics />
          <AnalyticsEvents />
        </Suspense>
        {/* Loaded only when a site key is configured; every form renders its challenge explicitly through TurnstileWidget, so a form reached by client-side navigation gets one too (SRS SEC 002). */}
        {turnstileSiteKey() && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" />}
      </body>
    </html>
  );
}
