import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { buttonVariants } from '@adelaide-sphere/ui';
import type { CalloutSection, CardsSection, ContactSection, FaqSection, HeaderSection, ImageTextSection, PageButton, PageSection } from '@adelaide-sphere/domain/page-sections';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ContactForm } from '@/components/contact-form';
import { JsonLdScript } from '@/components/json-ld';
import { MenuIcon } from '@/components/navigation/menu-icon';
import type { SiteSettings, StaticPageContent } from '@/lib/api';
import { withHeadingAnchors } from '@/lib/headings';
import { breadcrumbJsonLd } from '@/lib/structured-data';

interface Context {
  page: StaticPageContent;
  contact: SiteSettings['contact'];
  turnstileSiteKey: string | null;
}

const adelaideDate = (value: string) => new Intl.DateTimeFormat('en-AU', { dateStyle: 'long', timeZone: 'Australia/Adelaide' }).format(new Date(value));

/**
 * Where a button goes: a library document when one was chosen and is still
 * published, otherwise the link the editor typed. Null when neither survives,
 * so a button never points at a document that has since been removed.
 */
function buttonTarget(button: PageButton | null, page: StaticPageContent): { href: string; document: boolean } | null {
  if (!button) return null;
  if (button.documentId) {
    const document = page.documents[button.documentId];
    return document ? { href: document.url, document: true } : null;
  }
  return button.href ? { href: button.href, document: false } : null;
}

function SectionButton({ button, page, variant = 'primary', className = '' }: { button: PageButton | null; page: StaticPageContent; variant?: 'primary' | 'outline' | 'navy'; className?: string }) {
  const target = buttonTarget(button, page);
  if (!button || !target) return null;
  const classes = `${buttonVariants({ variant, size: 'lg' })} ${className}`.trim();
  // Internal addresses go through the router; everything else is a plain link.
  if (target.href.startsWith('/') && !target.document) {
    return (
      <Link href={target.href} className={classes}>
        {button.label}
      </Link>
    );
  }
  const external = /^https?:/i.test(target.href);
  return (
    <a href={target.href} className={classes} {...(external ? { rel: 'noopener noreferrer' } : {})}>
      {button.label}
      {target.document && <span className="sr-only"> (PDF download)</span>}
    </a>
  );
}

function Header({ section, page }: { section: HeaderSection; page: StaticPageContent }) {
  const image = section.imageId ? page.images[section.imageId] : undefined;
  const crumbs = [{ label: 'Home', href: '/' }, { label: page.title }];
  return (
    <>
      <JsonLdScript data={breadcrumbJsonLd(crumbs)} />
      <header className="ms-on-dark bg-band text-band-text">
        <div className={`ms-container grid items-center gap-10 py-10 sm:py-14 ${image ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]' : ''}`}>
          <div>
            <Breadcrumbs items={crumbs} tone="dark" />
            {section.eyebrow && <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">{section.eyebrow}</p>}
            <h1 className={`font-display ${section.eyebrow ? 'mt-3' : 'mt-6'} max-w-3xl text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.08] tracking-tight`}>{section.heading ?? page.title}</h1>
            {section.intro && <p className="mt-4 max-w-2xl text-lg leading-relaxed text-band-muted">{section.intro}</p>}
            <SectionButton button={section.button} page={page} className="mt-7" />
          </div>
          {image && (
            <figure>
              <div className="relative aspect-[4/3] overflow-hidden rounded-card-lg shadow-lg">
                <Image src={image.url} alt={image.alt} fill priority sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
              </div>
              {image.credit && <figcaption className="mt-2 text-xs text-band-muted">Photograph: {image.credit}</figcaption>}
            </figure>
          )}
        </div>
      </header>
    </>
  );
}

function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="font-display text-[clamp(1.6rem,3vw,2.25rem)] leading-tight tracking-tight">
      {children}
    </h2>
  );
}

function ImageText({ section, page }: { section: ImageTextSection; page: StaticPageContent }) {
  const image = section.imageId ? page.images[section.imageId] : undefined;
  const headingId = `section-${section.id}-heading`;
  return (
    <section aria-labelledby={section.heading ? headingId : undefined} className="ms-container py-12 sm:py-16">
      <div className={`grid items-center gap-10 ${image ? 'lg:grid-cols-2' : ''}`}>
        {image && (
          <figure className={section.imageSide === 'right' ? 'lg:order-2' : ''}>
            <div className="relative aspect-[4/3] overflow-hidden rounded-card-lg shadow-md">
              <Image src={image.url} alt={image.alt} fill sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
            </div>
            {image.credit && <figcaption className="mt-2 text-xs text-text-muted">Photograph: {image.credit}</figcaption>}
          </figure>
        )}
        <div>
          {section.heading && <SectionHeading id={headingId}>{section.heading}</SectionHeading>}
          <div className="ms-prose mt-4">
            <div className="ms-prose-html" dangerouslySetInnerHTML={{ __html: section.html }} />
          </div>
          <SectionButton button={section.button} page={page} variant="outline" className="mt-6" />
        </div>
      </div>
    </section>
  );
}

function Callout({ section, page }: { section: CalloutSection; page: StaticPageContent }) {
  const brand = section.tone === 'brand';
  const headingId = `section-${section.id}-heading`;
  return (
    <section aria-labelledby={headingId} className="ms-container py-8 sm:py-10">
      <div className={`rounded-card-lg p-8 sm:p-12 ${brand ? 'ms-on-dark bg-band text-band-text' : 'border border-border bg-surface-muted'}`}>
        <SectionHeading id={headingId}>{section.heading}</SectionHeading>
        {section.text && <p className={`mt-3 max-w-2xl text-lg leading-relaxed ${brand ? 'text-band-muted' : 'text-text-muted'}`}>{section.text}</p>}
        <div className="mt-7 flex flex-wrap gap-3">
          <SectionButton button={section.primary} page={page} />
          <SectionButton button={section.secondary} page={page} variant={brand ? 'navy' : 'outline'} />
        </div>
      </div>
    </section>
  );
}

function Cards({ section }: { section: CardsSection }) {
  const headingId = `section-${section.id}-heading`;
  return (
    <section aria-labelledby={section.heading ? headingId : undefined} className="ms-container py-12 sm:py-16">
      {section.heading && <SectionHeading id={headingId}>{section.heading}</SectionHeading>}
      <ul className={`grid gap-5 sm:grid-cols-2 ${section.cards.length % 3 === 0 ? 'lg:grid-cols-3' : ''} ${section.heading ? 'mt-8' : ''}`}>
        {section.cards.map((card, index) => {
          const body = (
            <>
              {card.icon && (
                <span className="grid size-11 place-items-center rounded-full bg-sky-50 text-sky-700">
                  <MenuIcon name={card.icon} className="size-5" />
                </span>
              )}
              {/* One level below the section heading; without one, the cards are the section's headings. */}
              <CardTitle level={section.heading ? 3 : 2}>{card.title}</CardTitle>
              {card.text && <p className="mt-2 text-sm leading-relaxed text-text-muted">{card.text}</p>}
            </>
          );
          return (
            <li key={index}>
              {card.href ? (
                <a href={card.href} className="ms-card-lift block h-full rounded-card-lg border border-border bg-surface-raised p-6 shadow-sm">
                  {body}
                </a>
              ) : (
                <div className="h-full rounded-card-lg border border-border bg-surface-raised p-6 shadow-sm">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CardTitle({ level, children }: { level: 2 | 3; children: ReactNode }) {
  const className = 'mt-4 text-lg font-semibold tracking-tight';
  return level === 2 ? <h2 className={className}>{children}</h2> : <h3 className={className}>{children}</h3>;
}

function Faq({ section }: { section: FaqSection }) {
  const headingId = `section-${section.id}-heading`;
  return (
    <section aria-labelledby={headingId} className="ms-container py-12 sm:py-16">
      <SectionHeading id={headingId}>{section.heading ?? 'Frequently asked questions'}</SectionHeading>
      {/* Native disclosure: keyboard operable and readable without JavaScript (NFR 011). */}
      <ul className="mt-8 flex max-w-3xl flex-col gap-3">
        {section.items.map((item, index) => (
          <li key={index}>
            <details className="group rounded-card-lg border border-border bg-surface-raised shadow-sm open:border-sky-400/60 open:shadow-md">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-card-lg px-5 py-4 text-base font-semibold leading-snug marker:content-none [&::-webkit-details-marker]:hidden">
                <span>{item.question}</span>
                <span aria-hidden="true" className="text-sky-700 transition-transform group-open:rotate-180 motion-reduce:transition-none">
                  ▾
                </span>
              </summary>
              {/* Sanitised server-side with the article allowlist (SEC 001). */}
              <div className="ms-prose border-t border-border px-5 pt-4 pb-5 text-text-muted" dangerouslySetInnerHTML={{ __html: item.answerHtml }} />
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Contact({ section, contact, turnstileSiteKey, title }: { section: ContactSection; contact: SiteSettings['contact']; turnstileSiteKey: string | null; title: string }) {
  const headingId = `section-${section.id}-heading`;
  const details = [
    contact.email && { label: 'Email', value: contact.email, href: `mailto:${contact.email}` },
    contact.phone && { label: 'Phone', value: contact.phone.display, href: contact.phone.telHref },
    contact.address && { label: 'Address', value: contact.address, href: null },
  ].filter((item): item is { label: string; value: string; href: string | null } => Boolean(item));
  return (
    <section aria-labelledby={headingId} className="ms-container py-12 sm:py-16">
      <div className={`grid gap-10 ${section.showForm ? 'lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]' : ''}`}>
        <div>
          <SectionHeading id={headingId}>{section.heading ?? 'Get in touch'}</SectionHeading>
          {details.length > 0 ? (
            <dl className="mt-6 flex flex-col gap-4">
              {details.map((item) => (
                <div key={item.label}>
                  <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">{item.label}</dt>
                  <dd className="mt-1 text-base">
                    {item.href ? (
                      <a href={item.href} className="ms-text-link">
                        {item.value}
                      </a>
                    ) : (
                      item.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-4 text-text-muted">
              <Link href="/contact" className="ms-text-link">
                Contact the editors
              </Link>
            </p>
          )}
        </div>
        {section.showForm && (
          <div className="rounded-card-lg border border-border bg-surface-raised p-6 shadow-sm">
            <p className="text-sm leading-relaxed text-text-muted">Ask us anything about {title.toLowerCase()}. An editor reads every message.</p>
            <div className="mt-5">
              <ContactForm turnstileSiteKey={turnstileSiteKey} compact />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function renderSection(section: PageSection, context: Context): ReactNode {
  const { page } = context;
  switch (section.type) {
    case 'header':
      return <Header section={section} page={page} />;
    case 'text': {
      const { html } = withHeadingAnchors(section.html);
      return (
        <div className="ms-container py-10 sm:py-12">
          <div className="ms-prose max-w-[68ch]">
            <div className="ms-prose-html" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      );
    }
    case 'imageText':
      return <ImageText section={section} page={page} />;
    case 'callout':
      return <Callout section={section} page={page} />;
    case 'cards':
      return <Cards section={section} />;
    case 'faq':
      return <Faq section={section} />;
    case 'businesses': {
      const businesses = section.businessIds.map((id) => page.businesses[id]).filter((business) => business !== undefined);
      if (businesses.length === 0) return null;
      const headingId = `section-${section.id}-heading`;
      return (
        <section aria-labelledby={section.heading ? headingId : undefined} className="ms-container py-12 sm:py-16">
          {section.heading && <SectionHeading id={headingId}>{section.heading}</SectionHeading>}
          <ul className={`grid gap-5 sm:grid-cols-2 lg:grid-cols-3 ${section.heading ? 'mt-8' : ''}`}>
            {businesses.map((business) => (
              <li key={business.id}>
                <Link href={`/business/${encodeURIComponent(business.slug)}`} className="ms-card-lift block h-full rounded-card-lg border border-border bg-surface-raised p-6 shadow-sm" data-track="business_card_click">
                  <span className="font-display block text-xl tracking-tight">{business.name}</span>
                  {(business.categoryName || business.areaName) && <span className="mt-1 block text-sm text-text-muted">{[business.categoryName, business.areaName].filter(Boolean).join(' · ')}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      );
    }
    case 'contact':
      return <Contact section={section} contact={context.contact} turnstileSiteKey={context.turnstileSiteKey} title={page.title} />;
  }
}

/**
 * A page built from sections (change log 1.17). The API has already removed
 * hidden sections, sanitised every rich text and resolved the images,
 * documents and businesses; anything it could not resolve is simply absent
 * here. Without a header section the page keeps the standard title band, so
 * every page still has exactly one `<h1>`.
 */
export function PageSections({ page, contact, turnstileSiteKey, fallbackHero }: Context & { fallbackHero: ReactNode }) {
  const sections = page.sections;
  const hasHeader = sections[0]?.type === 'header';
  return (
    <article>
      {!hasHeader && fallbackHero}
      {sections.map((section) => (
        <div key={section.id} data-section={section.type}>
          {renderSection(section, { page, contact, turnstileSiteKey })}
        </div>
      ))}
      {hasHeader && (
        <p className="ms-container pb-12 text-sm text-text-muted">
          Last updated <time dateTime={page.updatedAt}>{adelaideDate(page.updatedAt)}</time>
        </p>
      )}
    </article>
  );
}
