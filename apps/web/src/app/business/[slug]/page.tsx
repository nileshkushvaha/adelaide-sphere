import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRightIcon, CalendarCheckIcon, GlobeIcon, MailIcon, MapPinIcon, PhoneIcon, ShieldCheckIcon } from 'lucide-react';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { JsonLdScript } from '@/components/json-ld';
import { breadcrumbJsonLd, localBusinessJsonLd } from '@/lib/structured-data';
import { BusinessCard } from '@/components/business-card';
import { HoursTable } from '@/components/hours-table';
import { PhotoGallery } from '@/components/photo-gallery';
import { ServiceIcon } from '@/components/service-icon';
import { adelaideYear, statusLabel } from '@/lib/hours';
import { RatingStars } from '@/components/rating-stars';
import { RatingPanel } from '@/components/rating-panel';
import { gridColumns } from '@/components/page-shell';
import { fetchBusiness, fetchReviews, fetchSiteSettings, reviewGuidelinesHref } from '@/lib/api';
import { EnquiryForm } from '@/components/enquiry-form';
import { ReviewForm } from '@/components/review-form';
import { ReviewList } from '@/components/review-list';
import { MoreReviews } from '@/components/more-reviews';
import { contactChannelFrom, reviewRichResultsEnabled, turnstileSiteKey } from '@/lib/site';
import { categoryGradient, initials } from '@/lib/category-visuals';
import { CategoryIcon } from '@/components/category-icon';
import { BrandIcon, brandLabel } from '@/components/brand-icon';

export async function generateMetadata({ params }: PageProps<'/business/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const business = await fetchBusiness(slug);
  if (!business) return { title: 'Business not found', robots: { index: false } };
  const where = `${business.primaryCategory.name} in ${business.localArea.name}`;
  return pageMetadata({
    title: business.seoTitle ?? `${business.name} — ${where}`,
    description: business.seoDescription ?? business.description,
    path: `/business/${business.slug}`,
    keywords: business.seoKeywords
      ? [business.seoKeywords]
      : [
      business.name,
      business.primaryCategory.name,
      where,
      `${business.primaryCategory.name} Adelaide`,
      business.localArea.name,
      ...business.secondaryCategories.map((category) => category.name),
      ...business.services.slice(0, 6).map((service) => service.name),
    ],
    // The share image an editor chose, then the listing's photograph; otherwise
    // the site default or a generated card, never the SVG fallback, which
    // social platforms reject.
    image: business.shareImage
      ? { url: business.shareImage.url, width: business.shareImage.width, height: business.shareImage.height, alt: business.shareImage.alt || business.name }
      : business.image
        ? { url: business.image.url, alt: business.image.alt || business.name }
        : null,
    og: { kind: 'business', key: business.slug },
  });
}

/** Business detail (SRS BUS 001/003/004/005): omits missing optional fields, never fabricates. */
export default async function BusinessPage({ params }: PageProps<'/business/[slug]'>) {
  const { slug } = await params;
  const business = await fetchBusiness(slug);
  if (!business) notFound();
  // Reviews are one section of the page: if only they fail, the listing still shows, with a notice.
  const [loadedReviews, settings] = await Promise.all([fetchReviews(business.id).catch(() => null), fetchSiteSettings()]);
  const reviews = loadedReviews ?? { data: [], meta: { page: 1, pageSize: 10, total: 0, pageCount: 0 } };
  // The editors' own address, published in the general settings; null until one
  // is configured, and then no correction link is offered rather than a dead one.
  const editorsEmail = contactChannelFrom(settings).email;
  const { contact, address } = business;
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Businesses', href: '/business' }, { label: business.primaryCategory.name, href: `/business/category/${business.primaryCategory.slug}` }, { label: business.name }];
  const hasContact = contact.phone || contact.email || contact.website || business.links.length > 0;
  // Whole years since the year the business gave; the current Adelaide year,
  // so a listing does not age a year early for a reader in another timezone.
  const yearsInBusiness = typeof business.establishedYear === 'number' ? Math.max(0, adelaideYear() - business.establishedYear) : null;
  const status = business.hours?.status;
  const statusTone = status?.state === 'open' ? 'bg-success/15 text-white' : status?.state === 'closed' ? 'bg-white/10 text-band-muted' : 'bg-white/10 text-band-muted';
  const action = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-bold transition-all hover:-translate-y-0.5';
  const enquiryHref = contact.email
    ? `mailto:${contact.email}?subject=${encodeURIComponent(`Enquiry from Adelaide Sphere about ${business.name}`)}`
    : business.acceptsEnquiries
      ? '#enquiry-heading'
      : null;

  return (
    <article>
      <JsonLdScript data={[localBusinessJsonLd(business, { reviewMarkup: reviewRichResultsEnabled() }), breadcrumbJsonLd(crumbs)]} />

      {/* Identity band: who this is, where it is, how it rates and the three
          things a visitor actually wants to do (SRS BUS 001/003). */}
      <div className="as-on-dark bg-band text-band-text [background-image:radial-gradient(circle_at_78%_20%,rgba(25,158,216,.2),transparent_30%),linear-gradient(135deg,#0d2848,#071426)]">
        <div className="as-container py-9 sm:py-12">
          <Breadcrumbs items={crumbs} tone="dark" />
          <div className="mt-7 grid gap-10 lg:grid-cols-[minmax(0,1fr)_27rem] lg:items-center">
            <div>
              <p className="flex flex-wrap items-center gap-2 text-xs">
                <Link href={`/business/category/${business.primaryCategory.slug}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-white/12 px-3.5 font-semibold text-white transition-colors hover:bg-white/20">
                  <CategoryIcon slug={business.primaryCategory.slug} className="size-3.5" />
                  {business.primaryCategory.name}
                </Link>
                {business.secondaryCategories.map((category) => (
                  <Link key={category.slug} href={`/business/category/${category.slug}`} className="inline-flex min-h-9 items-center rounded-full border border-band-border px-3.5 font-medium text-band-muted transition-colors hover:border-sky-400 hover:text-white">
                    {category.name}
                  </Link>
                ))}
              </p>
              <h1 className="font-display mt-5 max-w-4xl text-[clamp(2.4rem,4.8vw,4.6rem)] leading-[1.02]">{business.name}</h1>
              <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <Link href={`/business/area/${business.localArea.slug}`} className="inline-flex items-center gap-1.5 text-band-muted underline-offset-4 hover:text-white as-text-link">
                  <MapPinIcon aria-hidden="true" className="size-4" />
                  {business.localArea.name}, Adelaide
                </Link>
                {business.rating ? (
                  <a href="#reviews-heading" className="inline-flex items-center gap-2 text-band-muted underline-offset-4 hover:text-white as-text-link">
                    <RatingStars value={business.rating.average} size="sm" />
                    <span>
                      <span className="font-semibold text-white">{business.rating.average.toFixed(1)}</span>
                      <span className="sr-only"> out of 5</span> · {business.rating.count} review{business.rating.count === 1 ? '' : 's'}
                    </span>
                  </a>
                ) : (
                  <span className="text-band-muted">No reviews yet</span>
                )}
                {/* `typeof`, not a null check: a response cached before the field existed has no such key at all. */}
                {yearsInBusiness !== null && (
                  <span className="inline-flex items-center gap-1.5 text-band-muted">
                    <CalendarCheckIcon aria-hidden="true" className="size-4" />
                    {yearsInBusiness === 0 ? `Established ${business.establishedYear}` : `${yearsInBusiness} year${yearsInBusiness === 1 ? '' : 's'} in business`}
                    <span className="sr-only"> (established {business.establishedYear})</span>
                  </span>
                )}
                {status && <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusTone}`}>{statusLabel(status)}</span>}
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                {enquiryHref && (
                  <a href={enquiryHref} className={`${action} bg-gradient-to-r from-sky-400 to-sky-500 px-7 text-navy-950 shadow-[0_16px_35px_-18px_rgba(25,158,216,.95)] hover:from-[#83d8f7] hover:to-sky-400`}>
                    <MailIcon aria-hidden="true" className="size-4" />
                    Send enquiry
                    <ArrowRightIcon aria-hidden="true" className="size-4" />
                  </a>
                )}
                {contact.phone && (
                  <a href={contact.phone.telHref} className={`${action} border border-white/20 bg-white/[0.08] text-white backdrop-blur hover:bg-white/[0.14]`}>
                    <PhoneIcon aria-hidden="true" className="size-4" />
                    Call {contact.phone.display}
                  </a>
                )}
                {address && (
                  <a href={address.directionsUrl} target="_blank" rel="noopener noreferrer" className={`${action} border border-white/20 bg-white/[0.08] text-white backdrop-blur hover:bg-white/[0.14]`}>
                    <MapPinIcon aria-hidden="true" className="size-4" />
                    Directions
                  </a>
                )}
                {contact.website && (
                  <a href={contact.website} target="_blank" rel="noopener noreferrer nofollow" className={`${action} border border-white/20 bg-white/[0.08] text-white backdrop-blur hover:bg-white/[0.14]`}>
                    <GlobeIcon aria-hidden="true" className="size-4" />
                    Website
                  </a>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="as-glass-dark relative aspect-[4/3] overflow-hidden rounded-[2rem] bg-navy-950 shadow-lg ring-1 ring-white/10">
                {business.image ? (
                  <Image src={business.image.url} alt={business.image.alt ?? ''} fill priority sizes="(min-width: 1024px) 26rem, 100vw" className="object-cover" />
                ) : (
                  // The same branded, category-derived panel the cards use, so a
                  // listing without a photograph never shows a stock placeholder.
                  <div aria-hidden="true" className="flex size-full flex-col items-center justify-center gap-3 text-white/90" style={{ background: categoryGradient(business.primaryCategory.slug) }}>
                    <CategoryIcon slug={business.primaryCategory.slug} className="size-12 opacity-80" />
                    <span className="font-display text-4xl tracking-wide">{initials(business.name)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="as-dot-grid bg-surface-muted"><div className="as-container grid gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_28rem] lg:gap-12">
        <div className="flex flex-col gap-8">
          <section aria-labelledby="about-heading" className="rounded-card-lg border border-white/80 bg-white/82 p-6 shadow-md backdrop-blur-sm sm:p-8">
            <h2 id="about-heading" className="font-display text-2xl tracking-tight">
              About {business.name}
            </h2>
            <p className="mt-3 max-w-prose whitespace-pre-line text-[1.0625rem] leading-relaxed">{business.description}</p>
            {business.services.length > 0 && (
              <>
                <h3 className="mt-8 text-sm font-semibold uppercase tracking-[0.14em] text-text-muted">Services</h3>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {business.services.map((service) => (
                    <li key={service.slug} className="inline-flex items-center gap-2 rounded-full bg-surface-sunken px-3.5 py-1.5 text-sm">
                      <ServiceIcon name={service.name} icon={service.icon} className="size-4 text-sky-700" />
                      {service.name}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {business.gallery.length > 0 && <PhotoGallery photos={business.gallery} businessName={business.name} />}

          <HoursTable hours={business.hours} correctionEmail={editorsEmail} businessName={business.name} />

          <section aria-labelledby="reviews-heading" className="flex scroll-mt-24 flex-col gap-6 rounded-card-lg border border-white/80 bg-white/82 p-6 shadow-md backdrop-blur-sm sm:p-8">
            <h2 id="reviews-heading" className="font-display text-2xl tracking-tight">
              Reviews{reviews.meta.total > 0 ? ` (${reviews.meta.total})` : ''}
            </h2>
            <RatingPanel rating={business.rating} breakdown={business.ratingBreakdown} />
            {/* The panel already says "no reviews yet"; the list would repeat it. */}
            {reviews.data.length > 0 && <ReviewList reviews={reviews.data} />}
            {reviews.data.length > 0 && <MoreReviews businessId={business.id} pageCount={reviews.meta.pageCount} shownIds={reviews.data.map((review) => review.id)} />}
            {loadedReviews === null && <p role="status" className="text-sm text-text-muted">Reviews can’t be shown right now. Please try again shortly.</p>}
            <div id="write-review" className="scroll-mt-24">
              <h3 className="mb-3 text-lg font-semibold">Write a review</h3>
              <ReviewForm businessId={business.id} businessName={business.name} turnstileSiteKey={turnstileSiteKey()} guidelinesHref={await reviewGuidelinesHref()} />
            </div>
          </section>
        </div>

        {/* Contact details and the enquiry form share the sidebar: the form used
            to sit under the reviews, which left the sidebar column empty for most
            of the page. The column is no longer sticky because it is now taller
            than the viewport on ordinary screens. */}
        <aside className="flex flex-col gap-8 lg:self-start">
          <div id="contact" className="scroll-mt-24 rounded-card-lg border border-white/80 bg-white/84 p-6 shadow-lg backdrop-blur-md">
            <div className="flex items-center gap-3"><span className="inline-flex size-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-700"><ShieldCheckIcon aria-hidden="true" className="size-5" /></span><div><p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-sky-700">Verified details</p><h2 className="text-base font-bold tracking-tight">Contact and location</h2></div></div>
            {!hasContact && !address && <p className="mt-3 text-sm text-text-muted">Contact details have not been published.</p>}
            <dl className="mt-4 flex flex-col gap-4 text-sm">
              {contact.phone && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Phone</dt>
                  <dd className="mt-1">
                    <a href={contact.phone.telHref} className="text-link underline-offset-4 as-text-link">
                      {contact.phone.display}
                    </a>
                  </dd>
                </div>
              )}
              {contact.email && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Email</dt>
                  <dd className="mt-1">
                    <a href={`mailto:${contact.email}`} className="break-all text-link underline-offset-4 as-text-link">
                      {contact.email}
                    </a>
                  </dd>
                </div>
              )}
              {contact.website && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Website</dt>
                  <dd className="mt-1">
                    <a href={contact.website} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-link underline-offset-4 as-text-link">
                      {contact.website.replace(/^https?:\/\//, '')}
                    </a>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{address ? 'Address' : 'Service area'}</dt>
                <dd className="mt-1">
                  {address ? (
                    <address className="not-italic leading-relaxed">
                      {address.line1}
                      {address.line2 ? <>, {address.line2}</> : null}
                      <br />
                      {address.suburb} SA {address.postcode}
                    </address>
                  ) : (
                    <>Serves {business.localArea.name} and nearby Adelaide areas; the street address is not published.</>
                  )}
                </dd>
              </div>
            </dl>
            {business.links.length > 0 && (
              // Brand marks, sized to a 44 px target; the platform name (or the
              // editor's own label) stays as the accessible name (SRS NFR 011).
              <ul aria-label="Social links" className="mt-5 flex flex-wrap gap-1.5 border-t border-border pt-5">
                {business.links.map((link) => {
                  const name = link.label ?? (link.kind === 'other' ? new URL(link.url).hostname : brandLabel(link.kind));
                  return (
                    <li key={link.url}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        title={name}
                        className="inline-flex size-11 items-center justify-center rounded-full border border-border text-text-muted transition-colors hover:border-border-strong hover:bg-sky-50 hover:text-link"
                      >
                        <BrandIcon kind={link.kind} size={18} />
                        <span className="sr-only">{name}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

            <section aria-labelledby="enquiry-heading" className="flex scroll-mt-24 flex-col gap-4 rounded-card-lg border border-sky-500/20 bg-[linear-gradient(135deg,rgba(255,255,255,.92),rgba(239,248,254,.9))] p-6 shadow-lg backdrop-blur-md">
              <div className="flex items-start gap-3">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                  <MailIcon aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <h2 id="enquiry-heading" className="font-display text-xl tracking-tight">Send an enquiry</h2>
                  <p className="mt-1 text-sm text-text-muted">Your message is delivered securely to {business.name}; their private contact address is never shown.</p>
                </div>
              </div>
              {business.acceptsEnquiries ? (
                <EnquiryForm businessId={business.id} businessName={business.name} turnstileSiteKey={turnstileSiteKey()} compact />
              ) : (
                <p className="text-text-muted">
                  This business does not take messages through Adelaide Sphere. Use the phone number or website above
                  {editorsEmail ? (
                    <>
                      , or{' '}
                      <a className="text-link underline underline-offset-2" href={`mailto:${editorsEmail}?subject=${encodeURIComponent(`Listing correction: ${business.name}`)}`}>
                        tell us about a missing contact detail
                      </a>
                    </>
                  ) : null}
                  .
                </p>
              )}
          </section>
        </aside>
      </div></div>

      {business.related.length > 0 && (
        <section aria-labelledby="related-heading" className="as-section bg-surface-sunken">
          <div className="as-container">
            <h2 id="related-heading" className="font-display text-3xl tracking-tight">
              More {business.primaryCategory.name.toLowerCase()} nearby
            </h2>
            <ul className={`mt-8 grid gap-6 ${gridColumns(business.related.length)}`}>
              {business.related.map((related) => (
                <li key={related.id}>
                  <BusinessCard business={related} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </article>
  );
}
