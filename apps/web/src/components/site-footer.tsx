import Image from 'next/image';
import { MailIcon } from 'lucide-react';
import { fetchMenus, fetchSiteSettings } from '@/lib/api';
import { renderCopyright } from '@/lib/copyright';
import { contactChannelFrom } from '@/lib/site';
import { ConsentPreferencesLink } from './consent-banner';
import { FOOTER_GRID, FooterBottomMenu, FooterMenuColumns } from './navigation/footer-menu';
import { SocialLinks } from './social-links';

/**
 * Footer (SRS UX 002, CFG 001, 1.9 MENU 003): a structured dark band closing
 * the page rhythm.
 *
 * The brand column comes from the general settings; the link columns and the
 * links beside the copyright come from the Footer and Footer bottom menus in
 * Website → Menus. The API resolves both, so a category an editor retires or a
 * policy that is not yet published is simply not linked — no link here points
 * at a 404.
 *
 * A postal address and a phone number are deliberately absent: this directory
 * has neither, and a footer that invents them tells visitors something untrue.
 * The email and the contact page are the routes that exist.
 */
export async function SiteFooter() {
  const [settings, menus] = await Promise.all([fetchSiteSettings(), fetchMenus()]);
  const channel = contactChannelFrom(settings);
  const columns = Math.min(menus.footer.length, 4);
  const copyright = renderCopyright(settings.footer.copyrightText, { year: new Date().getFullYear(), name: settings.name });

  return (
    // The target of the menu button when JavaScript is unavailable: the footer holds the same destinations.
    <footer id="footer-navigation" className="ms-site-footer ms-on-dark bg-band-deep text-band-text">
      <div className="ms-container py-16 sm:py-20">
        <div className={`grid gap-10 sm:grid-cols-2 lg:gap-10 ${FOOTER_GRID[columns]}`}>
          <div className="ms-footer-brand ms-footer-section min-w-0 max-w-sm">
            <p className="ms-footer-heading flex flex-wrap items-center gap-2.5">
              <span className={settings.branding.darkLogo ? "block w-[230px] max-w-full sm:w-[280px]" : "relative block aspect-[7.5/1] w-[230px] max-w-full overflow-hidden sm:w-[280px]"}>
              <Image
                src={settings.branding.darkLogo?.url ?? '/Adelaide_Sphere_Dark_Logo.png'}
                alt={settings.name}
                width={settings.branding.darkLogo?.width ?? 2172}
                height={settings.branding.darkLogo?.height ?? 724}
                className={settings.branding.darkLogo ? "h-auto w-full object-contain" : "absolute left-0 top-1/2 h-auto w-full -translate-y-1/2"}
              />
              </span>
            </p>
            {/* `whitespace-pre-line`, because the field is a textarea: an editor
                who writes two lines gets two lines, not one run-on sentence. */}
            <p className="mt-5 whitespace-pre-line text-base leading-7 text-sky-100">
              {settings.footer.text ?? 'An independent directory and local blog for Adelaide, South Australia. Every listing is checked by our editors before it is published — one city, covered properly.'}
            </p>
            <div className="mt-5">
              <SocialLinks links={settings.social} label={`${settings.name} on social media`} tone="dark" />
            </div>
            {/* Shown only when an editor has published a routable address; the
                site refuses one on a development domain, so this is never a
                mailto that goes nowhere. */}
            {channel.email && (
              <a href={`mailto:${channel.email}`} className="ms-footer-email ms-primary-action mt-5 inline-flex min-h-12 max-w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white">
                <MailIcon aria-hidden="true" className="size-5 shrink-0" />
                <span className="min-w-0 [overflow-wrap:anywhere]">{channel.email}</span>
              </a>
            )}
          </div>

          <FooterMenuColumns items={menus.footer} />
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-band-border pt-6 text-sm text-band-muted sm:flex-row sm:items-center sm:justify-between">
          {/* Exactly the line the editor wrote, with {year} and {name} filled
              in. It used to have the organisation name and ", Adelaide,
              Victoria, Australia" appended in code, so an editor who changed
              the line still could not change the end of it. */}
          <p>{copyright}</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:justify-end">
            <FooterBottomMenu items={menus.footer_bottom} />
            {/* Only rendered once the question has been answered, so it is a way
                back to a decision rather than a second prompt. */}
            <ConsentPreferencesLink />
          </div>
        </div>
      </div>
    </footer>
  );
}
