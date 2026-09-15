/**
 * Baseline fixtures (SRS SCP 004 / BUS 008): the sixteen Inner Adelaide localities the demonstration listings use
 * (trimmed at the user's request, 15 Sep 2026). The full researched list of 108
 * localities across the City of Adelaide and the Norwood Payneham & St Peters,
 * Unley, Prospect, Walkerville, Burnside and West Torrens council areas is
 * recorded in docs/setup-progress.md. Pending client decision D01.
 */
export const BASELINE_LOCAL_AREAS: { name: string; slug: string; note: string }[] = [
  { name: 'Adelaide', slug: 'adelaide', note: 'City of Adelaide (Inner Adelaide baseline)' },
  { name: 'North Adelaide', slug: 'north-adelaide', note: 'City of Adelaide (Inner Adelaide baseline)' },
  { name: 'Burnside', slug: 'burnside', note: 'City of Burnside (Inner Adelaide baseline)' },
  { name: 'Goodwood', slug: 'goodwood', note: 'City of Unley (Inner Adelaide baseline)' },
  { name: 'Hyde Park', slug: 'hyde-park', note: 'City of Unley (Inner Adelaide baseline)' },
  { name: 'Kent Town', slug: 'kent-town', note: 'City of Norwood Payneham & St Peters (Inner Adelaide baseline)' },
  { name: 'Maylands', slug: 'maylands', note: 'City of Norwood Payneham & St Peters (Inner Adelaide baseline)' },
  { name: 'Mile End', slug: 'mile-end', note: 'City of West Torrens (Inner Adelaide baseline)' },
  { name: 'Norwood', slug: 'norwood', note: 'City of Norwood Payneham & St Peters (Inner Adelaide baseline)' },
  { name: 'Parkside', slug: 'parkside', note: 'City of Unley (Inner Adelaide baseline)' },
  { name: 'Prospect', slug: 'prospect', note: 'City of Prospect (Inner Adelaide baseline)' },
  { name: 'Stepney', slug: 'stepney', note: 'City of Norwood Payneham & St Peters (Inner Adelaide baseline)' },
  { name: 'Thebarton', slug: 'thebarton', note: 'City of West Torrens (Inner Adelaide baseline)' },
  { name: 'Torrensville', slug: 'torrensville', note: 'City of West Torrens (Inner Adelaide baseline)' },
  { name: 'Unley Park', slug: 'unley-park', note: 'City of Unley (Inner Adelaide baseline)' },
  { name: 'Walkerville', slug: 'walkerville', note: 'Town of Walkerville (Inner Adelaide baseline)' },
];

export const STARTER_CATEGORIES: { name: string; slug: string; children?: { name: string; slug: string }[] }[] = [
  { name: 'Food & Drink', slug: 'food-and-drink', children: [{ name: 'Cafes', slug: 'cafes' }, { name: 'Restaurants', slug: 'restaurants' }, { name: 'Bars', slug: 'bars' }] },
  { name: 'Shopping', slug: 'shopping', children: [{ name: 'Independent shops', slug: 'independent-shops' }] },
  { name: 'Health & Wellness', slug: 'health-and-wellness' },
  { name: 'Home Services', slug: 'home-services' },
  { name: 'Professional Services', slug: 'professional-services' },
  { name: 'Pets & Vets', slug: 'pets-and-vets' },
];

export const STARTER_SERVICES: { name: string; slug: string; synonyms: string[] }[] = [
  { name: 'Coffee', slug: 'coffee', synonyms: ['espresso', 'flat white', 'cafe'] },
  { name: 'Plumbing', slug: 'plumbing', synonyms: ['plumber', 'blocked drain', 'hot water'] },
  { name: 'Accounting', slug: 'accounting', synonyms: ['accountant', 'tax return', 'bookkeeping'] },
];
