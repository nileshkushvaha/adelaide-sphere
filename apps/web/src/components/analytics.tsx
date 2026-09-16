'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import type { AnalyticsIds } from '@/lib/analytics';
import { useConsent } from '@/lib/use-consent';

/**
 * Loads the configured analytics, and only after the visitor has accepted them.
 *
 * Nothing here runs on the server and nothing is in the HTML: the scripts are
 * mounted by React once consent exists, so a visitor who declines — or who
 * never answers — sends no request to Google or Meta at all. Declining later
 * removes the tags from the page; the third-party cookies already set are the
 * browser's to clear, which the privacy page explains.
 *
 * The identifiers are public values (they appear in the page source of every
 * site that uses them), so serving them is not a disclosure; acting on them is
 * what needs permission.
 */
export function Analytics({ ids }: { ids: AnalyticsIds }) {
  const choice = useConsent();
  const pathname = usePathname();
  // A private preview's address carries its token, so analytics never load there and it cannot reach Google.
  if (choice !== 'accepted' || pathname?.startsWith('/preview/')) return null;

  return (
    <>
      {ids.googleTagManagerId && (
        <Script id="as-gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${ids.googleTagManagerId}');`}
        </Script>
      )}

      {ids.googleAnalyticsId && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ids.googleAnalyticsId}`} strategy="afterInteractive" />
          <Script id="as-ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ids.googleAnalyticsId}',{anonymize_ip:true});`}
          </Script>
        </>
      )}

      {ids.facebookPixelId && (
        <Script id="as-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${ids.facebookPixelId}');fbq('track','PageView');`}
        </Script>
      )}
    </>
  );
}
