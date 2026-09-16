import Link from 'next/link';
import { ArrowRightIcon, CheckIcon, NewspaperIcon, StoreIcon } from 'lucide-react';
import { formatPrice, planSlug } from '@adelaide-sphere/domain/pricing';
import type { SiteSettings } from '@/lib/api';

const PLAN_ICON = { guest_post: NewspaperIcon, business_listing: StoreIcon } as const;

/**
 * The published plans (SRS 1.12): a card each, with the price, what is included
 * and a button that opens the contact form with the plan chosen. Nothing is sold
 * or paid for on the site. Business Listing is the emphasised card. Renders
 * nothing when prices are switched off in General settings.
 */
export function PricingPlans({ pricing, headingLevel = 3, compact = false }: { pricing: SiteSettings['pricing'] | undefined; headingLevel?: 2 | 3; /** For a half-width column, e.g. beside the contact details. */ compact?: boolean }) {
  if (!pricing?.enabled || pricing.plans.length === 0) return null;
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <ul className={`grid items-stretch ${compact ? 'gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2' : 'gap-6 md:grid-cols-2'}`}>
      {pricing.plans.map((plan) => {
        const emphasised = plan.key === 'business_listing';
        const Icon = PLAN_ICON[plan.key];
        const period = plan.period === 'year' ? 'per year' : 'one time';
        return (
          <li key={plan.key} className={`as-pricing-card ${emphasised ? 'as-pricing-card--featured' : ''}`}>
            <div className={`flex h-full flex-col rounded-card-lg bg-surface-raised ${compact ? 'p-5 sm:p-6' : 'p-6 sm:p-8'}`}>
              <div className="flex items-start justify-between gap-4">
                <span aria-hidden="true" className={`grid size-12 place-items-center rounded-2xl ${emphasised ? 'bg-sky-700 text-white' : 'bg-sky-50 text-sky-700'}`}>
                  <Icon className="size-6" />
                </span>
                {emphasised && <span className="rounded-full bg-navy-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-white">For businesses</span>}
              </div>
              <Heading className="font-display mt-5 text-2xl tracking-tight">{plan.name}</Heading>
              {plan.summary && <p className="mt-2 leading-relaxed text-text-muted">{plan.summary}</p>}
              <p className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className={`font-display leading-none tracking-tight ${compact ? 'text-4xl' : 'text-5xl'}`}>{formatPrice(plan.priceCents)}</span>
                <span className="sr-only"> Australian dollars</span>
                <span className="text-sm font-medium text-text-muted">
                  {period}
                  {pricing.gstInclusive ? ' · inc. GST' : ''}
                </span>
              </p>
              {plan.features.length > 0 && (
                <ul className="mt-6 flex flex-col gap-3 border-t border-border pt-6 text-[0.9375rem]">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <span aria-hidden="true" className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-sky-100 text-sky-700">
                        <CheckIcon className="size-3.5" />
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-auto pt-8">
                <Link
                  href={`/contact?plan=${planSlug(plan.key)}#contact-form`}
                  className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-sky-700 ${emphasised ? 'as-primary-action text-white' : 'border border-border-strong text-text hover:bg-sky-50'}`}
                >
                  Choose {plan.name}
                  <ArrowRightIcon aria-hidden="true" className="size-5" />
                </Link>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
