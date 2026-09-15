import Link from 'next/link';
import { InformationHero, InformationPage } from '@/components/information-page';
import { PageSections } from '@/components/page-sections/page-sections';
import { ContactForm } from '@/components/contact-form';
import { fetchSiteSettings, fetchStaticPages, type StaticPageContent } from '@/lib/api';
import { JsonLdScript } from '@/components/json-ld';
import { withHeadingAnchors } from '@/lib/headings';
import { faqRichResultsEnabled, turnstileSiteKey } from '@/lib/site';
import { faqPageJsonLd, webPageJsonLd } from '@/lib/structured-data';

/**
 * The three documents that govern using the site. They are ordinary pages an
 * editor writes, but they are read differently from the rest — looked up
 * section by section, checked for a date, and usually followed by a question —
 * so they get the section navigation, the enquiry form and the links to each
 * other. Every one of them is still whatever the editor typed.
 */
export const POLICY_SLUGS = ['privacy', 'terms', 'review-guidelines'];

/**
 * One information page in the site's design (SRS CFG 002, change log 1.17),
 * shared by the public route and the private preview so a preview is exactly
 * what visitors will get.
 */
export async function StaticPageView({ page }: { page: StaticPageContent }) {
  const policy = POLICY_SLUGS.includes(page.slug);
  const faqs = (page.sections ?? []).flatMap((section) => (section.type === 'faq' ? section.items : []));
  // Described only as the page shows it; FAQPage stays behind the same sign-off flag as the FAQ page (SRS 1.2 FAQ 005).
  const structuredData = (
    <>
      <JsonLdScript data={webPageJsonLd({ path: `/${page.slug}`, name: page.seoTitle ?? page.title, description: page.seoDescription, updatedAt: page.updatedAt })} />
      {faqs.length > 0 && faqRichResultsEnabled() && <JsonLdScript data={faqPageJsonLd(faqs)} />}
    </>
  );

  // A page of sections other than plain text gets the designed layout; a page
  // that is only text (every page written before sections, and the policies)
  // keeps the reading template below, built from the same sanitised body.
  if (!policy && (page.sections ?? []).some((section) => section.type !== 'text')) {
    const settings = await fetchSiteSettings();
    return (
      <>
        {structuredData}
        <PageSections page={page} contact={settings.contact} turnstileSiteKey={turnstileSiteKey()} fallbackHero={<InformationHero title={page.title} updatedAt={page.updatedAt} />} />
      </>
    );
  }

  // Sanitised by the API with an allowlist before storage (SRS SEC 001); this
  // only anchors the headings that are already in it.
  const { html, headings } = withHeadingAnchors(page.body);
  const siblings = policy ? (await fetchStaticPages()).filter((other) => POLICY_SLUGS.includes(other.slug) && other.slug !== page.slug) : [];

  const enquiry = (
    <section aria-labelledby="page-enquiry-heading" className="rounded-card-lg border border-border bg-surface-raised p-6 shadow-sm">
      <h2 id="page-enquiry-heading" className="font-display text-xl tracking-tight">
        Send an enquiry
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">
        Ask us anything about {page.title.toLowerCase()} — or about a listing, a review or your own information. An editor reads every message.
      </p>
      <div className="mt-5">
        <ContactForm turnstileSiteKey={turnstileSiteKey()} compact />
      </div>
    </section>
  );

  const contents = headings.length > 1 && (
    <nav aria-labelledby="page-contents-heading" className="rounded-card-lg border border-border bg-surface p-6">
      <h2 id="page-contents-heading" className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
        On this page
      </h2>
      <ol className="mt-4 flex flex-col gap-1 text-sm">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a href={`#${heading.id}`} className="inline-flex min-h-9 items-center text-text-muted underline-offset-4 hover:text-link ms-text-link">
              {heading.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );

  const aside = policy ? (
    <div className="flex flex-col gap-6">
      {enquiry}
      {contents}
    </div>
  ) : (
    // One route for questions, so a page never carries a second address that
    // could drift from the configured one (SRS CFG 001).
    <div className="flex flex-col gap-6">
      <div className="rounded-card-lg border border-border bg-surface-raised p-6 shadow-sm">
        <h2 className="text-base font-semibold tracking-tight">Questions about this page?</h2>
        <p className="mt-3 text-sm leading-relaxed text-text-muted">The editors answer questions about our policies, and can correct anything on the site that is wrong.</p>
        <Link href="/contact" className="mt-3 inline-flex min-h-11 items-center text-link underline-offset-4 ms-text-link">
          Contact the editors
        </Link>
      </div>
      {contents}
    </div>
  );

  const footer = siblings.length > 0 && (
    <div className="border-t border-border bg-surface-muted">
      <div className="ms-container py-12 sm:py-14">
        <h2 className="font-display text-2xl tracking-tight">The other policies</h2>
        <p className="mt-2 text-text-muted">These three together describe what we do with your information, what you agree to by using the site, and what we publish.</p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {siblings.map((other) => (
            <li key={other.slug}>
              <Link
                href={`/${other.slug}`}
                className="ms-card-lift flex min-h-20 items-center justify-between gap-4 rounded-card-lg border border-border bg-surface p-5 font-semibold shadow-sm"
              >
                {other.title}
                <span aria-hidden="true" className="text-sky-700">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  return (
    <>
    {structuredData}
    <InformationPage
      title={page.title}
      eyebrow={policy ? 'Policies' : undefined}
      updatedAt={page.updatedAt}
      // The editor's own choice, made per page in the admin (SRS CFG 002).
      layout={page.layout}
      // The first paragraph of a policy is its summary; the class sets it in a
      // larger face so the page opens with something a reader can stop at.
      bodyClassName={policy ? 'ms-prose-lead' : ''}
      aside={aside}
      footer={footer || undefined}
    >
      <div className="ms-prose-html" dangerouslySetInnerHTML={{ __html: html }} />
    </InformationPage>
    </>
  );
}
