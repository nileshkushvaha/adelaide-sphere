import Link from 'next/link';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import type { Metadata } from 'next';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { NotFoundContent } from '@/components/not-found-content';
import './globals.css';

const bodyFont = Inter({ variable: '--font-body', subsets: ['latin'], display: 'swap' });
const displayFont = Plus_Jakarta_Sans({ variable: '--font-display', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Page not found · Adelaide Sphere',
  description: 'This page does not exist or is no longer published.',
  robots: { index: false, follow: true },
};

/**
 * Server-rendered 404 document.
 *
 * Next 16 answers `notFound()` and unmatched routes with a bare error document
 * whose content only exists in the flight payload, which renders as a blank
 * page. `global-not-found` bypasses that path, so a missing page still returns
 * 404 *and* real HTML — including the site shell, so a visitor can navigate on
 * (SRS SEO 001, UX 002). It renders outside the root layout, so styles, fonts
 * and the shell are imported here explicitly.
 */
export default function GlobalNotFound() {
  return (
    <html lang="en-AU" className={`${bodyFont.variable} ${displayFont.variable} h-full antialiased`}>
      <body suppressHydrationWarning className="flex min-h-full flex-col font-sans">
        <a className="ms-skip-link" href="#main-content">
          Skip to main content
        </a>
        <SiteHeader />
        <main id="main-content" className="w-full flex-1">
          <NotFoundContent />
          <p className="mx-auto max-w-lg px-4 pb-16 text-center text-sm text-text-muted">
            If you followed a link from elsewhere on the site,{' '}
            <Link href="/" className="text-link underline underline-offset-2">
              tell us
            </Link>{' '}
            so we can fix it.
          </p>
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
