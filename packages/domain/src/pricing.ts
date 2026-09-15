/**
 * Published prices (SRS 1.12, FUT 002 as amended): shown on the home and contact
 * pages and ordered through the contact form. The system takes no payments;
 * amounts are Australian dollars including GST, stored in cents.
 */
export const PRICING_PLAN_KEYS = ['guest_post', 'business_listing'] as const;
export type PricingPlanKey = (typeof PRICING_PLAN_KEYS)[number];

export const PRICING_PERIODS = ['one_time', 'year'] as const;
export type PricingPeriod = (typeof PRICING_PERIODS)[number];

export interface PricingPlan {
  key: PricingPlanKey;
  name: string;
  priceCents: number;
  period: PricingPeriod;
  summary: string | null;
  features: string[];
}

export interface PricingSettings {
  enabled: boolean;
  plans: PricingPlan[];
}

export const PRICING_LIMITS = { name: { min: 2, max: 40 }, summary: 140, feature: 90, features: 6, priceCents: 1_000_000 } as const;

/** Only what the product actually delivers is promised here. */
export const DEFAULT_PRICING: PricingSettings = {
  enabled: true,
  plans: [
    {
      key: 'guest_post',
      name: 'Guest Post',
      priceCents: 3900,
      period: 'one_time',
      summary: 'One article on the Adelaide Sphere blog.',
      features: ['You write it; our editors review and publish it', 'Clearly labelled as a guest post', 'Listed on the blog, in search and in the RSS feed'],
    },
    {
      key: 'business_listing',
      name: 'Business Listing',
      priceCents: 6900,
      period: 'year',
      summary: 'Your business in the Adelaide directory for 12 months.',
      features: ['Checked and published by our editors', 'Contact details, opening hours and photos', 'Found by category, local area and search', 'Customer reviews on your listing'],
    },
  ],
};

/** "$39", or "$39.50" when there are cents. */
export function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars.toLocaleString('en-AU') : dollars.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The plan's address form, e.g. `business-listing` in `/contact?plan=business-listing`. */
export function planSlug(key: PricingPlanKey): string {
  return key.replace('_', '-');
}

export function planFromSlug(slug: unknown): PricingPlanKey | null {
  const key = typeof slug === 'string' ? slug.replace('-', '_') : '';
  return (PRICING_PLAN_KEYS as readonly string[]).includes(key) ? (key as PricingPlanKey) : null;
}
