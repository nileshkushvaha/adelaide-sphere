import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRightIcon, ChevronDownIcon, CircleHelpIcon, InfoIcon, LockKeyholeIcon, MailIcon, MessageSquareTextIcon, PhoneIcon, StarIcon, StoreIcon, type LucideIcon } from 'lucide-react';
import { buttonVariants } from '@adelaide-sphere/ui';
import { InformationHero } from '@/components/information-page';
import { JsonLdScript } from '@/components/json-ld';
import { AsideCard, IconTile, ProductPageLayout } from '@/components/product-page';
import { fetchFaqs, fetchSiteSettings, type PublicFaq } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';
import { routeMetadata } from '@/lib/route-seo';
import { contactChannelFrom, faqRichResultsEnabled } from '@/lib/site';
import { faqPageJsonLd } from '@/lib/structured-data';

/** The page's own metadata, with any administrator overrides applied (SEO 001). */
export async function generateMetadata(): Promise<Metadata> {
  return routeMetadata(
    'faqs',
    await pageMetadata({
      title: 'Frequently asked questions',
      description: 'Answers to common questions about listing a business, correcting a listing, reviews and using the Adelaide business directory.',
      path: '/faqs',
      keywords: ['FAQ', 'business listing questions', 'how to list a business in Adelaide', 'Adelaide business directory help'],
      og: { kind: 'route', key: 'faqs' },
    }),
  );
}

/**
 * An icon per group an editor has named. Groups are free text, so the match is
 * by keyword and anything unrecognised gets the question mark; the group name
 * beside it carries the meaning either way.
 */
function groupIcon(name: string): LucideIcon {
  const key = name.toLowerCase();
  if (/listing|business/.test(key)) return StoreIcon;
  if (/review|comment|rating/.test(key)) return StarIcon;
  if (/enquir|contact|message/.test(key)) return MailIcon;
  if (/detail|privacy|data|account/.test(key)) return LockKeyholeIcon;
  if (/about/.test(key)) return InfoIcon;
  return CircleHelpIcon;
}

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const plural = (count: number) => `${count} question${count === 1 ? '' : 's'}`;

interface Group {
  id: string;
  name: string;
  icon: LucideIcon;
  items: PublicFaq[];
}

/**
 * Published questions (SRS 1.2 FAQ 004), grouped as the editors grouped them.
 *
 * The answers are `<details>`/`<summary>` rather than a scripted accordion: it
 * is keyboard operable, announced correctly and works with no JavaScript at
 * all, which is what NFR 011 asks for and what a scripted widget usually gets
 * wrong. When nothing is published the page is a 404 rather than an empty
 * container. Structured data stays behind its flag (FAQ 005).
 */
export default async function FaqsPage() {
  const [faqs, settings] = await Promise.all([fetchFaqs({ required: true }), fetchSiteSettings()]);
  if (faqs.length === 0) notFound();

  const byName = new Map<string, PublicFaq[]>();
  for (const faq of faqs) {
    const key = faq.groupName?.trim() || 'General questions';
    byName.set(key, [...(byName.get(key) ?? []), faq]);
  }
  const groups: Group[] = [...byName.entries()].map(([name, items]) => ({ id: `faq-${slugify(name)}`, name, icon: groupIcon(name), items }));

  const { email } = contactChannelFrom(settings);
  const { phone } = settings.contact;
  const contactLinkClass = 'flex min-h-11 items-center gap-2.5 break-words font-medium text-link underline-offset-4 ms-text-link [overflow-wrap:anywhere]';

  return (
    <article>
      {faqRichResultsEnabled() && <JsonLdScript data={faqPageJsonLd(faqs)} />}
      <InformationHero
        title="Frequently asked questions"
        eyebrow="Help centre"
        intro={`Answers about listing a business, reviews, enquiries and how ${settings.name} works.`}
        className="ms-editorial-band"
      />

      <ProductPageLayout
        lead={
          <section aria-labelledby="faq-topics-heading">
            <h2 id="faq-topics-heading" className="font-display text-2xl tracking-tight sm:text-3xl">
              Browse by topic
            </h2>
            <p className="mt-2 max-w-2xl leading-relaxed text-text-muted">
              {faqs.length} answers in {groups.length} {groups.length === 1 ? 'topic' : 'topics'}. Choose one to jump straight to it.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {groups.map((group) => (
                <li key={group.id}>
                  <a
                    href={`#${group.id}`}
                    className="group flex h-full items-center gap-4 rounded-card-lg border border-border bg-surface-raised p-4 shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    <IconTile icon={group.icon} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold leading-snug">{group.name}</span>
                      <span className="text-sm text-text-muted">{plural(group.items.length)}</span>
                    </span>
                    <ArrowRightIcon aria-hidden="true" className="size-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-link motion-reduce:transition-none" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        }
        aside={
          <AsideCard sticky="always" id="faq-help-heading" icon={MessageSquareTextIcon} title="Still have a question?" description="If the answer is not here, the editors read every message and reply by email.">
            <ul className="flex flex-col">
              {email && (
                <li>
                  <a href={`mailto:${email}`} className={contactLinkClass}>
                    <MailIcon aria-hidden="true" className="size-4 shrink-0 text-sky-600" />
                    {email}
                  </a>
                </li>
              )}
              {phone && (
                <li>
                  <a href={phone.telHref} className={contactLinkClass}>
                    <PhoneIcon aria-hidden="true" className="size-4 shrink-0 text-sky-600" />
                    {phone.display}
                  </a>
                </li>
              )}
            </ul>
            <Link href="/contact" className={`${buttonVariants({ size: 'lg' })} mt-4 w-full`}>
              Send us a message
            </Link>
          </AsideCard>
        }
      >
        {groups.map((group) => (
          <section key={group.id} id={group.id} aria-labelledby={`${group.id}-heading`} className="scroll-mt-28">
            <div className="flex items-center gap-3.5">
              <IconTile icon={group.icon} />
              <div className="min-w-0">
                <h2 id={`${group.id}-heading`} className="font-display text-2xl tracking-tight">
                  {group.name}
                </h2>
                <p className="text-sm text-text-muted">{plural(group.items.length)}</p>
              </div>
            </div>
            <ul className="mt-5 flex flex-col gap-3">
              {group.items.map((faq) => (
                <li key={faq.id}>
                  <details className="group rounded-card-lg border border-border bg-surface-raised shadow-sm transition-colors open:border-sky-400/60 open:shadow-md">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-card-lg px-5 py-4 text-base font-semibold leading-snug marker:content-none hover:bg-sky-50/60 [&::-webkit-details-marker]:hidden">
                      <span>{faq.question}</span>
                      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-sky-50 text-sky-700 transition-transform group-open:rotate-180 group-open:bg-linear-to-br group-open:from-sky-400 group-open:to-sky-700 group-open:text-white motion-reduce:transition-none">
                        <ChevronDownIcon className="size-4" />
                      </span>
                    </summary>
                    {/* Sanitised server-side by the same allowlist as articles (SEC 001). */}
                    <div className="ms-prose border-t border-border px-5 pt-4 pb-5 text-text-muted" dangerouslySetInnerHTML={{ __html: faq.answerHtml }} />
                  </details>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </ProductPageLayout>
    </article>
  );
}
