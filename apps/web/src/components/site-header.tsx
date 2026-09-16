import Image from 'next/image';
import Link from 'next/link';
import { MailIcon, PhoneIcon } from 'lucide-react';
import { contactChannelFrom } from '@/lib/site';
import { fetchMenus, fetchSiteSettings } from '@/lib/api';
import { SocialLinks } from './social-links';
import { PrimaryNav } from './navigation/primary-nav';
import { SecondaryNav } from './navigation/secondary-nav';

/**
 * Public navigation (SRS UX 002, 1.9 MENU 003–006): a white navigation bar
 * above the hero, keyboard reachable and usable without JavaScript. The name,
 * logo, contact strip and social profiles come from the general settings
 * (CFG 001); the primary and secondary menus come from Website → Menus, already
 * filtered by the API to what a visitor can open. Anything unset is omitted
 * rather than rendered blank.
 *
 * The contact strip scrolls away and the navigation stays pinned (client
 * instruction, 7 Sep 2026). They are siblings rather than one sticky block
 * because a `sticky` child only sticks within its own parent's box: nested
 * inside the header it would unpin the moment the header scrolled past. No
 * scroll listener is involved, so there is nothing to jank on a slow device.
 */
export async function SiteHeader() {
  const [settings, menus] = await Promise.all([fetchSiteSettings(), fetchMenus()]);
  const channel = contactChannelFrom(settings);
  const { phone } = settings.contact;
  const contactDetails = phone !== null || channel.email !== null || settings.social.length > 0;
  // The secondary menu is hidden below the tablet breakpoint (it lives in the drawer there),
  // so a strip holding only that menu is hidden there too.
  const topBar = settings.headerTopBarEnabled && (contactDetails || menus.secondary.length > 0);

  return (
    <>
      {topBar && (
        <div aria-label="Contact details" className={`as-on-dark border-b border-white/10 bg-band-deep text-band-text ${contactDetails ? '' : 'hidden md:block'}`}>
          <div className="as-container flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-1 text-xs">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              {phone && (
                <a href={phone.telHref} className="inline-flex min-h-9 items-center gap-1.5 text-band-muted transition-colors hover:text-white">
                  <PhoneIcon aria-hidden="true" className="size-3.5" />
                  {phone.display}
                </a>
              )}
              {channel.email && (
                <a href={`mailto:${channel.email}`} className="inline-flex min-h-9 items-center gap-1.5 text-band-muted transition-colors hover:text-white">
                  <MailIcon aria-hidden="true" className="size-3.5" />
                  {channel.email}
                </a>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <SecondaryNav items={menus.secondary} />
              <SocialLinks links={settings.social} label={`${settings.name} on social media`} tone="dark" />
            </div>
          </div>
        </div>
      )}
      <header className="as-site-header sticky top-0 z-40 border-b border-border bg-surface text-text shadow-sm">
        <div className="as-container flex items-center py-3.5">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-lg py-1 text-text">
              <span className={settings.branding.logo ? "block w-[230px] max-w-full sm:w-[280px]" : "relative block aspect-[7.5/1] w-[230px] max-w-full overflow-hidden sm:w-[280px]"}>
              <Image
                src={settings.branding.logo?.url ?? '/Adelaide_Sphere_Light_Logo.png'}
                alt={settings.name}
                priority
                width={settings.branding.logo?.width ?? 2172}
                height={settings.branding.logo?.height ?? 724}
                className={settings.branding.logo ? "h-auto w-full object-contain" : "absolute left-0 top-1/2 h-auto w-full -translate-y-1/2"}
              />
              </span>
          </Link>
          <PrimaryNav primary={menus.primary} secondary={menus.secondary} />
        </div>
      </header>
    </>
  );
}
