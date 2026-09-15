import { describe, expect, it } from 'vitest';
import { DEFAULT_PRICING, formatPrice, planFromSlug, planSlug } from './pricing.js';

describe('pricing', () => {
  it('ships the two published prices', () => {
    expect(DEFAULT_PRICING.plans.map((plan) => [plan.key, plan.priceCents, plan.period])).toEqual([
      ['guest_post', 3900, 'one_time'],
      ['business_listing', 6900, 'year'],
    ]);
  });

  it('formats whole and part dollars', () => {
    expect(formatPrice(3900)).toBe('$39');
    expect(formatPrice(3950)).toBe('$39.50');
    expect(formatPrice(120000)).toBe('$1,200');
  });

  it('round-trips plan addresses and refuses anything else', () => {
    expect(planFromSlug(planSlug('business_listing'))).toBe('business_listing');
    expect(planFromSlug('guest-post')).toBe('guest_post');
    expect(planFromSlug('premium')).toBeNull();
    expect(planFromSlug(undefined)).toBeNull();
  });
});
