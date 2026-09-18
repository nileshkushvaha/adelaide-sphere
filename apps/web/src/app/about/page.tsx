import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightIcon,
  BookOpenIcon,
  CompassIcon,
  FlagIcon,
  GlobeIcon,
  MailIcon,
  PhoneIcon,
  UserCheckIcon,
  InboxIcon,
  MapPinIcon,
  MessageSquareTextIcon,
  PenLineIcon,
  RefreshCwIcon,
  SearchCheckIcon,
  ShieldCheckIcon,
  SparklesIcon,
  StarIcon,
  StoreIcon,
} from "lucide-react";
import { InformationHero } from "@/components/information-page";
import { JsonLdScript } from "@/components/json-ld";
import {
  AsideCard,
  ContentSection,
  IconPoints,
  ProductPageLayout,
  type IconPoint,
} from "@/components/product-page";
import { buttonVariants } from "@adelaide-sphere/ui";
import { fetchAreas, fetchSiteMetrics, fetchSiteSettings } from "@/lib/api";
import { contactChannelFrom } from "@/lib/site";
import { routeMetadata } from "@/lib/route-seo";
import { aboutPageJsonLd } from "@/lib/structured-data";

export const dynamic = "force-dynamic";

/**
 * `/about` is a product route built from the same parts as `/contact`, at client
 * instruction on 13 Sep 2026 — it is no longer an editable page, which SRS ABT
 * 001 still describes (recorded as a discrepancy in `docs/setup-progress.md`).
 * The copy describes the product as it works (ABT 002/004): no invented
 * history, people, awards or endorsements, and no claim of verification. The
 * figures are counted from published rows and omitted when they cannot be
 * taken or are zero (ABT 003).
 */
export async function generateMetadata(): Promise<Metadata> {
  const { name } = await fetchSiteSettings();
  return routeMetadata(
    "about",
    await pageMetadata({
      title: `About ${name}`,
      description: `${name} is an independently edited guide to Adelaide’s local businesses, neighbourhoods and city life. Here is how it works.`,
      path: "/about",
      keywords: [
        `about ${name}`,
        "Adelaide business directory",
        "independent local directory",
        "how listings are checked",
        "Adelaide South Australia",
      ],
      og: { kind: "route", key: "about" },
    }),
  );
}

/** Licensed photographs held by the project (ABT 006); sources in `docs/content/about-photography.md`. */
const PHOTOS = {
  skyline: {
    src: "/about/adelaide-skyline-torrens.webp",
    alt: "The Adelaide city skyline across the River Torrens",
  },
  laneway: {
    src: "/about/adelaide-leigh-street.webp",
    alt: "Leigh Street, a tree-lined laneway of cafés and small bars in the Adelaide city centre",
  },
  market: {
    src: "/about/adelaide-central-market.webp",
    alt: "Fruit and vegetable stalls inside the Adelaide Central Market",
  },
} as const;

const OFFER: IconPoint[] = [
  {
    icon: StoreIcon,
    title: "Business listings",
    text: "Hours, contacts and services, checked before publishing.",
  },
  {
    icon: CompassIcon,
    title: "Browse by area or category",
    text: "Find what’s nearby, in the words locals use.",
  },
  {
    icon: BookOpenIcon,
    title: "Guides and local stories",
    text: "Written and edited by our team; paid guest posts are clearly labelled.",
  },
  {
    icon: StarIcon,
    title: "Moderated reviews",
    text: "Read by a person before they appear.",
  },
];

/** How a listing is created, checked, published and corrected (ABT 004). */
const PROCESS: IconPoint[] = [
  { icon: InboxIcon, title: "Details reach our editors" },
  { icon: SearchCheckIcon, title: "We check it’s in an area we cover" },
  { icon: GlobeIcon, title: "It’s published to search and its area" },
  { icon: RefreshCwIcon, title: "Anyone can send a correction" },
];

/** Only rules the product enforces today (SRS REV 001–003, REP 001, ABT 004). */
const STANDARDS: IconPoint[] = [
  {
    icon: SearchCheckIcon,
    title: "Checked before publishing",
    text: "An editor reviews every listing first.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Reviews read against guidelines",
    text: "Nothing appears until a moderator approves it.",
  },
  {
    icon: FlagIcon,
    title: "Anyone can report a review",
    text: "Reports go to a person, not an algorithm.",
  },
  {
    icon: UserCheckIcon,
    title: "No “verified customer” labels",
    text: "We don’t claim what we can’t confirm.",
  },
];

const WHY: IconPoint[] = [
  { icon: MapPinIcon, title: "Adelaide, and only Adelaide" },
  { icon: PenLineIcon, title: "Edited, not uploaded" },
  { icon: ShieldCheckIcon, title: "Reviews and comments moderated" },
  { icon: MessageSquareTextIcon, title: "No business accounts to game" },
];

const JOIN = [
  { icon: StoreIcon, href: "/contact", label: "Request a listing" },
  { icon: CompassIcon, href: "/business", label: "Browse businesses" },
  { icon: BookOpenIcon, href: "/blog", label: "Read local guides" },
];

const count = new Intl.NumberFormat("en-AU");

function Photo({
  photo,
  className,
  sizes,
  priority = false,
}: {
  photo: (typeof PHOTOS)[keyof typeof PHOTOS];
  className: string;
  sizes: string;
  priority?: boolean;
}) {
  return (
    <figure>
      <div
        className={`relative w-full overflow-hidden rounded-card-lg shadow-md ${className}`}
      >
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      </div>
    </figure>
  );
}

export default async function AboutPage() {
  // The area list is decoration for the sidebar: if it cannot be read the card
  // is omitted rather than taking the page down (ABT 002).
  const [settings, metrics, areas] = await Promise.all([
    fetchSiteSettings(),
    fetchSiteMetrics(),
    fetchAreas().catch(() => []),
  ]);
  const title = `About ${settings.name}`;
  const { email } = contactChannelFrom(settings);
  const { phone } = settings.contact;
  const contactLinkClass =
    "flex min-h-11 items-center gap-2.5 break-words font-medium text-link underline-offset-4 as-text-link [overflow-wrap:anywhere]";
  const figures = [
    { value: metrics.businesses, label: "Published businesses" },
    { value: metrics.areas, label: "Local areas" },
    { value: metrics.categories, label: "Categories" },
    { value: metrics.articles, label: "Guides and articles" },
  ].filter(
    (figure): figure is { value: number; label: string } =>
      typeof figure.value === "number" && figure.value > 0,
  );

  return (
    <article className="as-product-page">
      <JsonLdScript
        data={aboutPageJsonLd({
          name: title,
          description: `${settings.name} is an independently edited guide to Adelaide’s local businesses.`,
        })}
      />
      <InformationHero
        title={title}
        eyebrow="About us"
        intro="An independently edited guide to Adelaide’s local businesses, neighbourhoods and city life."
        className="as-editorial-band as-ocean-band"
      />

      <ProductPageLayout
        lead={
          <>
            <Photo
              photo={PHOTOS.skyline}
              className="aspect-[5/2] sm:aspect-[4/1]"
              sizes="(min-width: 1024px) 60vw, 100vw"
              priority
            />
            <section aria-labelledby="who-heading" className="as-content-panel">
              <h2
                id="who-heading"
                className="font-display text-2xl tracking-tight sm:text-3xl"
              >
                Who we are
              </h2>
              <div className="mt-3 flex max-w-2xl flex-col gap-4 leading-relaxed text-text-muted sm:text-lg sm:leading-relaxed">
                <p>
                  {settings.name} is a local directory for Adelaide, South
                  Australia. It brings the city’s cafés, trades, clinics, shops
                  and services together in one place, alongside guides to the
                  suburbs they sit in and stories about the city around them.
                </p>
                <p>
                  Businesses don’t hold accounts or upload their own listings.
                  Our editors research each one, check that it operates in an
                  area we cover and publish it only once its details are
                  complete. When something changes, anyone can tell us, and an
                  editor updates it.
                </p>
                <p>
                  That is slower than an open submission form, and it is
                  deliberate: a directory is only useful while people can rely
                  on what it says.
                </p>
              </div>
            </section>
          </>
        }
        aside={
          // A stack of cards filling the column; only the last is sticky, and
          // `h-full` gives it the column's height to travel through.
          <div className="flex h-full flex-col gap-6">
            <AsideCard
              id="mission-heading"
              sticky={false}
              icon={SparklesIcon}
              title="Our mission"
              description="To make Adelaide’s local businesses easier to find and easier to trust — one checked listing at a time."
            >
              <Photo
                photo={PHOTOS.laneway}
                className="aspect-[4/3]"
                sizes="(min-width: 1280px) 30rem, (min-width: 1024px) 26rem, 100vw"
              />
              {figures.length > 0 && (
                <dl className="mt-5 grid grid-cols-2 gap-3">
                  {figures.map((figure) => (
                    <div
                      key={figure.label}
                      className="flex flex-col-reverse rounded-card border border-sky-100 bg-linear-to-br from-sky-50 to-teal-100 p-4"
                    >
                      <dt className="text-sm text-text-muted">
                        {figure.label}
                      </dt>
                      <dd className="font-display bg-linear-to-br from-sky-700 to-teal-700 bg-clip-text text-3xl tracking-tight text-transparent">
                        {count.format(figure.value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </AsideCard>

            {areas.length > 0 && (
              <AsideCard
                id="areas-heading"
                sticky={false}
                icon={MapPinIcon}
                title="Explore by area"
                description="Start with the neighbourhood you know, or one you are about to visit."
              >
                <ul className="flex flex-wrap gap-2">
                  {areas.slice(0, 12).map((area) => (
                    <li key={area.id}>
                      <Link
                        href={`/business/area/${area.slug}`}
                        className="as-text-link inline-flex min-h-11 items-center rounded-full px-3.5 text-sm font-medium"
                      >
                        {area.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </AsideCard>
            )}

            <AsideCard
              id="talk-heading"
              sticky="always"
              icon={MessageSquareTextIcon}
              title="Talk to our editors"
              description="Request a listing, report something out of date or ask us a question."
            >
              <ul className="flex flex-col">
                {email && (
                  <li>
                    <a href={`mailto:${email}`} className={contactLinkClass}>
                      <MailIcon
                        aria-hidden="true"
                        className="size-4 shrink-0 text-current"
                      />
                      {email}
                    </a>
                  </li>
                )}
                {phone && (
                  <li>
                    <a href={phone.telHref} className={contactLinkClass}>
                      <PhoneIcon
                        aria-hidden="true"
                        className="size-4 shrink-0 text-current"
                      />
                      {phone.display}
                    </a>
                  </li>
                )}
              </ul>
              <Link
                href="/contact"
                className={`${buttonVariants({ size: "lg" })} mt-4 w-full`}
              >
                Send us a message
              </Link>
            </AsideCard>
          </div>
        }
      >
        <ContentSection
          id="offer-heading"
          title="What we offer"
          intro="Whether you live here, have just arrived or are visiting for a weekend, the site is built to help you find the right place quickly."
        >
          <IconPoints items={OFFER} />
        </ContentSection>

        <ContentSection
          id="process-heading"
          title="How a listing gets here"
          intro="Every business on the site follows the same four steps. There is no charge at any point."
        >
          <IconPoints items={PROCESS} ordered />
        </ContentSection>

        <ContentSection
          id="standards-heading"
          title="Our editorial standards"
          intro="The same rules apply to every listing, review and comment, and they are the reason the site stays useful."
        >
          <IconPoints items={STANDARDS} />
        </ContentSection>

        <ContentSection
          id="why-heading"
          title={`Why ${settings.name}`}
          intro="One city, covered properly, by people who know it."
        >
          <div className="grid items-center gap-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Photo
              photo={PHOTOS.market}
              className="aspect-[4/3]"
              sizes="(min-width: 1280px) 22rem, (min-width: 640px) 45vw, 100vw"
            />
            <IconPoints items={WHY} columns={1} />
          </div>
        </ContentSection>

        <section
          aria-labelledby="join-heading"
          className="as-on-dark as-ocean-band relative isolate overflow-hidden rounded-card-lg bg-band-deep p-6 text-white shadow-lg sm:p-8"
        >
          <div
            aria-hidden="true"
            className="absolute -right-16 -top-20 -z-10 size-64 rounded-full bg-sky-400/30 blur-3xl"
          />
          <h2
            id="join-heading"
            className="font-display text-2xl tracking-tight sm:text-3xl"
          >
            Be part of {settings.name}
          </h2>
          <p className="mt-2 text-band-muted">
            However you use the city, there’s a place for you here.
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {JOIN.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="as-primary-action group flex h-full min-h-14 items-center gap-3 rounded-card border border-white/15 bg-white/[0.07] px-4 py-3 font-semibold transition-colors hover:border-sky-400 hover:bg-white/12"
                >
                  <item.icon
                    aria-hidden="true"
                    className="size-5 shrink-0 text-sky-400"
                  />
                  <span className="flex-1">{item.label}</span>
                  <ArrowRightIcon
                    aria-hidden="true"
                    className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </ProductPageLayout>
    </article>
  );
}
