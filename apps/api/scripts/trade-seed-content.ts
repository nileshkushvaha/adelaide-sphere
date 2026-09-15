/**
 * Demonstration trade categories and the listings that fill them.
 *
 * The twenty listings in `business-seed-content.ts` are written one by one,
 * because they are the ones a reviewer reads closely. This file covers the
 * long tail — forty-odd trades, four listings each — which no one is going to
 * hand-write and no one needs hand-written: what matters there is that every
 * category has enough real-looking listings to judge search, filtering,
 * pagination and the category pages against.
 *
 * So each trade carries a small vocabulary — what the trade does, how it
 * works, what its customers say — and the composer below builds four distinct
 * businesses from it: different name, suburb, street, hours, services and
 * reviews, chosen by the business's position rather than at random, so a
 * re-run produces the same twenty-second listing it produced before.
 *
 * Everything is fictional on the same terms as the hand-written listings:
 * invented names, ACMA's reserved `(08) 5550` range, domains that belong to
 * nobody, and reviewers who do not exist. The suburbs and streets are real,
 * because the directory covers Inner Adelaide only (SRS SCP 001–005).
 */
import type { HoursRule, SeedBusiness, SeedReview, Weekday } from './business-seed-content.js';

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];

/** How a trade keeps its week. */
export type HoursKind = 'trade' | 'shop' | 'clinic' | 'hospitality' | 'earlyTrade' | 'sixDay';

const HOURS: Record<HoursKind, HoursRule[]> = {
  // On the tools: an early start, and Saturday morning for the jobs that cannot wait.
  trade: [[WEEKDAYS, '07:00', '17:00'], [[6], '08:00', '12:00']],
  earlyTrade: [[WEEKDAYS, '06:30', '16:00']],
  sixDay: [[WEEKDAYS, '07:30', '17:30'], [[6], '08:00', '15:00']],
  shop: [[WEEKDAYS, '09:00', '17:30'], [[6], '09:00', '16:00'], [[7], '10:00', '15:00']],
  clinic: [[[1, 3, 5], '08:00', '17:00'], [[2, 4], '08:00', '19:00'], [[6], '09:00', '13:00']],
  hospitality: [[[2, 3, 4], '11:30', '22:00'], [[5, 6], '11:30', '23:00'], [[7], '11:30', '21:00']],
};

/** The local areas these listings sit in, with streets that are really there. */
const SUBURBS: { slug: string; suburb: string; postcode: string; lat: number; lng: number; streets: string[] }[] = [
  { slug: 'adelaide', suburb: 'Adelaide', postcode: '5000', lat: -34.9285, lng: 138.6007, streets: ['Pirie Street', 'Gawler Place', 'Waymouth Street', 'Frome Street'] },
  { slug: 'north-adelaide', suburb: 'North Adelaide', postcode: '5006', lat: -34.9070, lng: 138.5930, streets: ['O’Connell Street', 'Tynte Street', 'Jeffcott Street', 'Archer Street'] },
  { slug: 'norwood', suburb: 'Norwood', postcode: '5067', lat: -34.9210, lng: 138.6320, streets: ['The Parade', 'Osmond Terrace', 'George Street', 'Beulah Road'] },
  { slug: 'kent-town', suburb: 'Kent Town', postcode: '5067', lat: -34.9215, lng: 138.6195, streets: ['Rundle Street', 'King William Street', 'Wakefield Street', 'Dequetteville Terrace'] },
  { slug: 'stepney', suburb: 'Stepney', postcode: '5069', lat: -34.9110, lng: 138.6280, streets: ['Nelson Street', 'Stepney Street', 'Magill Road', 'Payneham Road'] },
  { slug: 'st-peters', suburb: 'St Peters', postcode: '5069', lat: -34.9050, lng: 138.6220, streets: ['Stephen Terrace', 'Winchester Street', 'Harrow Road', 'Eighth Avenue'] },
  { slug: 'unley', suburb: 'Unley', postcode: '5061', lat: -34.9500, lng: 138.6070, streets: ['Unley Road', 'Arthur Street', 'Mary Street', 'Edmund Avenue'] },
  { slug: 'parkside', suburb: 'Parkside', postcode: '5063', lat: -34.9440, lng: 138.6170, streets: ['Castle Street', 'Robsart Street', 'Porter Street', 'Glen Osmond Road'] },
  { slug: 'goodwood', suburb: 'Goodwood', postcode: '5034', lat: -34.9510, lng: 138.5890, streets: ['Goodwood Road', 'Leader Street', 'Rosa Street', 'Albert Street'] },
  { slug: 'hyde-park', suburb: 'Hyde Park', postcode: '5061', lat: -34.9560, lng: 138.6010, streets: ['King William Road', 'Park Street', 'Mitchell Street', 'Oxford Street'] },
  { slug: 'fullarton', suburb: 'Fullarton', postcode: '5063', lat: -34.9540, lng: 138.6270, streets: ['Cremorne Street', 'Kenilworth Road', 'Fisher Street', 'Fullarton Road'] },
  { slug: 'prospect', suburb: 'Prospect', postcode: '5082', lat: -34.8830, lng: 138.5950, streets: ['Prospect Road', 'Braund Road', 'Highbury Street', 'Olive Street'] },
  { slug: 'walkerville', suburb: 'Walkerville', postcode: '5081', lat: -34.8940, lng: 138.6170, streets: ['Walkerville Terrace', 'Smith Street', 'Church Terrace', 'Northcote Terrace'] },
  { slug: 'burnside', suburb: 'Burnside', postcode: '5066', lat: -34.9400, lng: 138.6480, streets: ['Lockwood Road', 'Glynburn Road', 'Hallett Road', 'Stuart Street'] },
  { slug: 'glenside', suburb: 'Glenside', postcode: '5065', lat: -34.9430, lng: 138.6340, streets: ['Flemington Street', 'Conyngham Street', 'Cator Street', 'Greenhill Road'] },
  { slug: 'thebarton', suburb: 'Thebarton', postcode: '5031', lat: -34.9170, lng: 138.5720, streets: ['Phillips Street', 'George Street', 'Holland Street', 'Dew Street'] },
  { slug: 'torrensville', suburb: 'Torrensville', postcode: '5031', lat: -34.9200, lng: 138.5610, streets: ['Hayward Avenue', 'Ashley Street', 'Carlton Parade', 'Henley Beach Road'] },
  { slug: 'mile-end', suburb: 'Mile End', postcode: '5031', lat: -34.9260, lng: 138.5700, streets: ['Ebor Avenue', 'Falcon Avenue', 'Railway Terrace', 'Henley Beach Road'] },
  { slug: 'marleston', suburb: 'Marleston', postcode: '5033', lat: -34.9470, lng: 138.5620, streets: ['Marion Road', 'Richmond Road', 'Galway Avenue', 'Aldridge Terrace'] },
  { slug: 'kurralta-park', suburb: 'Kurralta Park', postcode: '5037', lat: -34.9510, lng: 138.5680, streets: ['Anzac Highway', 'Beauchamp Street', 'Tennyson Street', 'Broughton Avenue'] },
];

/** Family names for the businesses that are named after someone. */
const SURNAMES = ['Halloran', 'Whitfield', 'Kostas', 'Brennan', 'Nguyen', 'Fairbairn', 'Okafor', 'Petrakis', 'Marchetti', 'Donnelly', 'Ashcroft', 'Rahimi', 'Sullivan', 'Beaumont', 'Castellano', 'Oyelaran'];
/** Words an Adelaide business puts in front of its trade. */
const PREFIXES = ['Cityside', 'Parklands', 'Torrens', 'Ironbark', 'Bluestone', 'Gulfside', 'Redgum', 'Wattle', 'Foundry', 'Trellis', 'Hillside', 'Brightwell'];

const REVIEWERS = ['Anna P.', 'Marcus L.', 'Priya D.', 'Tom H.', 'Georgia W.', 'Sam K.', 'Nadia R.', 'Ben O.', 'Yuki M.', 'Liam F.', 'Ruth A.', 'Deniz C.', 'Hamish B.', 'Ivy T.', 'Omar S.', 'Kate V.'];

export interface TradeProfile {
  /** Category slug and name. */
  slug: string;
  name: string;
  /**
   * What a business in this trade calls itself, completing "X is a ___".
   * Written out per trade rather than derived from the category name: the
   * name is a plural heading, and trimming its "s" produced "a plumber
   * business" and, for Gyms & fitness, "a fitnes".
   */
  self: string;
  /**
   * Whether customers come to the business or it comes to them. A plumber
   * works across a suburb; a café is on a street in one, and saying a café
   * "works across the inner north" is how seeded copy gives itself away.
   */
  siting?: 'premises';
  /** The category this one sits under. */
  parent: string;
  /** What belongs in the category, for its own page. */
  description: string;
  /** Commons subjects for the category picture and the listings' photographs. */
  imageQueries: string[];
  services: string[];
  /** Trade words a business name ends in, e.g. "Plumbing & Gas". */
  nouns: string[];
  /** What the business does. One sentence, no business name, no full stop missing. */
  angles: string[];
  /** How it works, or who it serves. */
  practice: string[];
  reviews: string[];
  hours: HoursKind;
  /** How many listings to create; four unless a category is already fuller. */
  count?: number;
}

/** A stable number from a string, so a trade's choices never move between runs. */
function seedOf(value: string): number {
  let total = 0;
  for (const character of value) total = (total * 31 + character.charCodeAt(0)) % 100_000;
  return total;
}

const pick = <T,>(list: T[], index: number): T => list[index % list.length]!;

/** "a" or "an". Every phrase in this file starts with an ordinary consonant or vowel sound, so the letter is enough. */
const article = (phrase: string): string => ('aeiou'.includes(phrase[0]!.toLowerCase()) ? 'an' : 'a');

/** Adelaide's compass, for a sentence about where a business works. */
const QUARTER: Record<string, string> = {
  adelaide: 'the city', 'north-adelaide': 'the inner north', norwood: 'the inner east', 'kent-town': 'the inner east', stepney: 'the inner east',
  'st-peters': 'the inner east', unley: 'the inner south', parkside: 'the inner south', goodwood: 'the inner south', 'hyde-park': 'the inner south',
  fullarton: 'the inner south-east', prospect: 'the inner north', walkerville: 'the inner north-east', burnside: 'the eastern suburbs',
  glenside: 'the inner south-east', thebarton: 'the inner west', torrensville: 'the inner west', 'mile-end': 'the inner west',
  marleston: 'the inner south-west', 'kurralta-park': 'the inner south-west',
};

/** Builds the four listings for one trade. */
export function tradeBusinesses(trade: TradeProfile, phoneFrom: number): SeedBusiness[] {
  const base = seedOf(trade.slug);
  const count = trade.count ?? 4;
  return Array.from({ length: count }, (_, index) => {
    const place = pick(SUBURBS, base + index * 5);
    const street = pick(place.streets, base + index);
    const noun = pick(trade.nouns, base + index);
    // Two ways a business gets its name, so a category is not four of a kind.
    const name = (base + index) % 2 === 0 ? `${pick(SURNAMES, base * 3 + index * 7)} ${noun}` : `${pick(PREFIXES, base * 5 + index * 3)} ${noun}`;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const domain = `${slug.replace(/-/g, '')}.com.au`;
    const established = 1996 + ((base + index * 13) % 27);
    const services = trade.services.filter((_, position) => position < 3 + ((base + index) % Math.max(1, trade.services.length - 2)));

    const opening =
      trade.siting === 'premises'
        ? `${name} is ${article(trade.self)} ${trade.self} on ${street} in ${place.suburb}, trading since ${established}.`
        : `${name} is ${article(trade.self)} ${trade.self} working across ${place.suburb} and ${QUARTER[place.slug] ?? 'inner Adelaide'}, trading since ${established}.`;
    const closing =
      trade.siting === 'premises'
        ? `Bookings can be made by phone or online, and walk-ins are taken whenever there is room.`
        : `Quotes are given before work starts, and ${place.suburb} and the surrounding suburbs are covered from the ${street} base.`;
    const description = [opening, pick(trade.angles, base + index), pick(trade.practice, base * 7 + index), closing].join(' ');

    const reviews: SeedReview[] = Array.from({ length: 2 + ((base + index) % 2) }, (_, position) => ({
      name: pick(REVIEWERS, base + index * 4 + position * 9),
      rating: (position === 0 ? 5 : 4 + ((base + index + position) % 2)) as 4 | 5,
      text: pick(trade.reviews, base + index * 3 + position * 5),
      daysAgo: 6 + ((base + index * 17 + position * 29) % 170),
    }));

    return {
      slug,
      name,
      category: trade.slug,
      area: place.slug,
      established,
      description,
      services,
      phone: `(08) 5550 ${String(phoneFrom + index).padStart(4, '0')}`,
      email: `hello@${domain}`,
      website: `https://${domain}`,
      address: { line1: `${1 + ((base + index * 11) % 240)} ${street}`, suburb: place.suburb, postcode: place.postcode, lat: place.lat, lng: place.lng },
      hours: HOURS[trade.hours],
      links: (base + index) % 3 === 0 ? [{ kind: 'facebook' as const, url: `https://www.facebook.com/${slug}` }] : [{ kind: 'facebook' as const, url: `https://www.facebook.com/${slug}` }, { kind: 'instagram' as const, url: `https://www.instagram.com/${slug}` }],
      // The photographs come from the category's own pool, not from a query
      // per listing: four plumbers want four different pictures of plumbing,
      // and one search answers that better than four identical ones.
      images: [],
      reviews,
    };
  });
}

/** Parent categories these trades sit under; created if they are not there. */
export const TRADE_PARENTS: { slug: string; name: string; description: string; imageQueries: string[] }[] = [
  { slug: 'home-services', name: 'Home Services', description: 'Trades and services that come to your home — repairs, maintenance, cleaning and renovation.', imageQueries: ['tradesman tools house', 'home repair worker'] },
  { slug: 'auto-and-transport', name: 'Auto & Transport', description: 'Keeping a vehicle on the road, and getting things from one place to another.', imageQueries: ['car workshop vehicle', 'delivery van road'] },
  { slug: 'health-and-wellness', name: 'Health & Wellness', description: 'Clinics, practitioners and studios looking after health, movement and recovery.', imageQueries: ['clinic treatment room', 'wellness exercise studio'] },
  { slug: 'personal-care', name: 'Personal Care', description: 'Everyday services for how you look and what you wear.', imageQueries: ['hair salon interior', 'grooming products shelf'] },
  { slug: 'food-and-drink', name: 'Food & Drink', description: 'Where Adelaide eats and drinks, and the people who supply it.', imageQueries: ['food market stall', 'kitchen cooking chef'] },
  { slug: 'professional-services', name: 'Professional Services', description: 'Advice and services for people and the businesses they run.', imageQueries: ['office desk meeting', 'business documents desk'] },
  { slug: 'shopping', name: 'Shopping', description: 'Shops worth crossing town for.', imageQueries: ['shop window retail street', 'store interior shelves'] },
  { slug: 'pets-and-vets', name: 'Pets & Vets', description: 'Care for the animals that live here too.', imageQueries: ['dog cat pet care', 'veterinary clinic animal'] },
];

export const TRADES: TradeProfile[] = [
  {
    slug: 'plumbers', name: 'Plumbers', self: 'licensed plumbing business', parent: 'home-services',
    description: 'Licensed plumbers for blocked drains, burst pipes, hot water, gas fitting and bathroom work.',
    imageQueries: ['plumber pipe repair', 'plumbing tools wrench', 'bathroom sink installation'],
    services: ['Blocked drains', 'Burst pipes', 'Hot water systems', 'Gas fitting', 'Bathroom plumbing', 'Emergency call-out'],
    nouns: ['Plumbing', 'Plumbing & Gas', 'Plumbing Services', 'Plumbers'],
    angles: [
      'The work is mostly blocked drains, leaking taps and hot water units that have given up overnight, with bathroom and laundry rough-ins for small renovations.',
      'Drain cameras and jetting equipment go out on every van, so a blockage is found rather than guessed at and cleared the same visit where it can be.',
      'Gas fitting is a licensed part of the business: cooktops, heaters and compliance certificates, alongside the day-to-day plumbing.',
    ],
    practice: [
      'Two vans cover the area, with a same-day slot held open each morning for emergencies.',
      'Every job is photographed before and after, and the certificate follows by email the same day.',
      'Fixed prices are given on the phone for the common jobs, so there is no meter running while you decide.',
    ],
    reviews: ['Came out within the hour for a burst pipe and charged exactly what was quoted.', 'Cleared a drain two other plumbers had given up on. Explained what caused it.', 'Replaced our hot water unit and took the old one away. Tidy and polite.', 'Booked for a Tuesday, arrived Tuesday, done by lunchtime.'],
    hours: 'trade',
  },
  {
    slug: 'electricians', name: 'Electricians', self: 'electrical contractor', parent: 'home-services',
    description: 'A-grade electricians for switchboards, safety switches, lighting, power points and EV chargers.',
    imageQueries: ['electrician switchboard wiring', 'electrician installing light', 'electrical tools cables'],
    services: ['Switchboard upgrades', 'Safety switches', 'Lighting', 'Power points', 'EV charger installation', 'Fault finding'],
    nouns: ['Electrical', 'Electrical Services', 'Electricians', 'Electrical Co'],
    angles: [
      'Switchboard upgrades and safety switches make up most of the work in the older terraces around here, alongside lighting, power points and ceiling fans.',
      'Fault finding is the speciality: intermittent trips, hot points and the circuits nobody has been able to map since the house was split into flats.',
      'EV charger installation has become a regular part of the week, including the load check that decides whether the board can take one.',
    ],
    practice: [
      'A certificate of electrical safety comes with every job, emailed the same day.',
      'Landlord compliance checks and pre-purchase inspections are booked in a single visit.',
      'Two electricians and an apprentice; most jobs are booked within the week.',
    ],
    reviews: ['Upgraded an ancient switchboard in a day and left the place spotless.', 'Found a fault three other sparkies had missed. Fair price, no drama.', 'Installed our EV charger, quote was accurate, certificate arrived that afternoon.', 'Punctual, explained the options, did not try to sell us anything extra.'],
    hours: 'trade',
  },
  {
    slug: 'roofing', name: 'Roofing', self: 'roofing business', parent: 'home-services',
    description: 'Roof repairs, restoration, gutters and leak detection on tile and metal roofs.',
    imageQueries: ['roofer roof tiles repair', 'metal roof installation', 'roof gutter cleaning'],
    services: ['Leak detection', 'Roof repairs', 'Roof restoration', 'Gutters and downpipes', 'Skylights', 'Storm damage'],
    nouns: ['Roofing', 'Roofing & Guttering', 'Roof Care', 'Roofing Co'],
    angles: [
      'Tile and metal roofs both, with leak detection first: the point the water enters is rarely the point it appears inside.',
      'Restoration work — rebedding and repointing ridge caps, replacing broken tiles, coating — on the Federation roofs the inner suburbs are full of.',
      'Gutters, downpipes and valley irons, including the leaf-guard work that stops the same blockage returning every autumn.',
    ],
    practice: [
      'Every roof is photographed from above before a quote, so you see what the quote is for.',
      'Storm work is triaged by phone: a tarp goes on first, the repair is booked after.',
      'Ten-year workmanship warranty on restorations, in writing.',
    ],
    reviews: ['Found the leak in twenty minutes after two others had guessed wrong.', 'Rebedded the whole ridge line and cleaned up every last tile.', 'Came out the morning after the storm and tarped it until they could fix it properly.', 'Photos from the drone made it obvious what needed doing.'],
    hours: 'trade',
  },
  {
    slug: 'painting-decorating', name: 'Painting & decorating', self: 'painting and decorating business', parent: 'home-services',
    description: 'Interior and exterior painting, plaster repair and wallpapering for homes and small commercial work.',
    imageQueries: ['painter painting wall roller', 'house painting exterior', 'paint brushes colour'],
    services: ['Interior painting', 'Exterior painting', 'Plaster repair', 'Wallpapering', 'Heritage colours', 'Commercial painting'],
    nouns: ['Painting', 'Painting & Decorating', 'Painters', 'Decorating Co'],
    angles: [
      'Interiors and exteriors, with the plaster and filler work done properly first — most of a good paint job happens before any paint is opened.',
      'Heritage colour work on the Victorian and Edwardian houses around here, including the lead-safe preparation that those jobs require.',
      'Wallpapering and feature walls alongside the whole-house repaints, and small commercial jobs out of hours.',
    ],
    practice: [
      'Dust sheets, cut-in by hand and a walk-through at the end of each day.',
      'Quotes list the number of coats and the products used, so two quotes can actually be compared.',
      'Most interiors are three to five days; the team works one house at a time.',
    ],
    reviews: ['The prep work was the difference — walls that had been patchy for years came up perfect.', 'Quiet, clean and finished a day early.', 'Matched a heritage colour from a chip off the weatherboard.', 'Quote was itemised and the final bill matched it.'],
    hours: 'trade',
  },
  {
    slug: 'flooring', name: 'Flooring', self: 'flooring business', parent: 'home-services',
    description: 'Timber, laminate, vinyl and carpet — supply, installation, sanding and polishing.',
    imageQueries: ['wooden floor installation', 'floor sanding polishing', 'carpet laying floor'],
    services: ['Timber flooring', 'Floor sanding', 'Polishing', 'Laminate and vinyl', 'Carpet', 'Repairs'],
    nouns: ['Flooring', 'Floors', 'Flooring Co', 'Floor Craft'],
    angles: [
      'Sanding and polishing the original boards is most of the work here: the inner-suburb terraces almost always have something worth saving under the carpet.',
      'Supply and installation of engineered timber, laminate and vinyl plank, with the subfloor levelling that decides whether a floor stays flat.',
      'Carpet for bedrooms and stairs, and repairs to boards damaged by leaks or past renovations.',
    ],
    practice: [
      'Dust-extracted sanding, so the rest of the house stays liveable.',
      'Samples are left with you for a few days to see in your own light.',
      'Rooms are handed back walkable the next morning and furniture-ready after four days.',
    ],
    reviews: ['The original boards came up beautifully. Barely any dust.', 'Levelled a subfloor that had defeated the last installer.', 'On time, on budget, and they moved the furniture back themselves.', 'Good advice about what finish to use with a dog in the house.'],
    hours: 'trade',
  },
  {
    slug: 'heating-cooling', name: 'Heating & cooling', self: 'heating and cooling business', parent: 'home-services',
    description: 'Split systems, ducted heating and evaporative cooling — installation, service and repair.',
    imageQueries: ['air conditioner installation technician', 'hvac technician unit', 'ducted heating vent'],
    services: ['Split system installation', 'Ducted heating', 'Evaporative cooling', 'Servicing', 'Repairs', 'Emergency call-out'],
    nouns: ['Heating & Cooling', 'Climate', 'Air', 'Air Conditioning'],
    angles: [
      'Split systems and ducted heating, installed and serviced, with the heat-load calculation that stops a unit being sold two sizes too big.',
      'Service work before each season: filters, gas pressure, drainage and the flue checks that a gas heater needs annually.',
      'Repairs on most brands, with common parts carried on the van so a first visit is often the only visit.',
    ],
    practice: [
      'Carbon monoxide testing is included with every gas heater service, not charged as an extra.',
      'Installation quotes state the model, the position and what the wall will look like afterwards.',
      'Booked within days outside the first cold snap; emergencies are triaged by phone.',
    ],
    reviews: ['Serviced the ducted heating and found a cracked flue we had no idea about.', 'Recommended a smaller unit than the last quote and explained why.', 'Two splits installed in a morning, no mess.', 'Came out on the first 38-degree day. That alone earns five stars.'],
    hours: 'trade',
  },
  {
    slug: 'locksmiths', name: 'Locksmiths', self: 'locksmith', parent: 'home-services',
    description: 'Lockouts, rekeying, deadlocks, restricted keys and security upgrades for homes and shops.',
    imageQueries: ['locksmith door lock key', 'door lock installation', 'keys locksmith workshop'],
    services: ['Emergency lockouts', 'Rekeying', 'Deadlocks', 'Restricted key systems', 'Shopfront locks', 'Safes'],
    nouns: ['Locksmiths', 'Lock & Key', 'Security Locksmiths', 'Locksmithing'],
    angles: [
      'Lockouts around the clock, and the unglamorous work that prevents them: rekeying after a move, deadlocks that actually meet the insurer’s wording, keys that cannot be copied at a kiosk.',
      'Restricted key systems for apartment buildings and shared houses, where a lost key should not mean recutting the whole block.',
      'Shopfront and office work — mortice locks, closers, panic bars and master key plans drawn up on paper first.',
    ],
    practice: [
      'Identification and proof of residence are checked on every lockout, without exception.',
      'Prices for the common jobs are published, so a 2 am call is not a blank cheque.',
      'Non-destructive entry wherever possible; a drilled lock is a last resort and is said so up front.',
    ],
    reviews: ['Locked out at midnight with a baby inside. Twenty minutes, no damage to the door.', 'Rekeyed the whole house after we moved in and explained the insurance wording.', 'Fitted a restricted system for our block; no more recutting for the whole building.', 'Quoted on the phone and the price did not change when he arrived.'],
    hours: 'trade',
  },
  {
    slug: 'handyman', name: 'Handyman services', self: 'handyman service', parent: 'home-services',
    description: 'The small jobs — shelves, doors, tiles, flat-pack, odd repairs — done in one visit.',
    imageQueries: ['handyman tools repair home', 'man repairing door', 'toolbox tools workbench'],
    services: ['Odd jobs', 'Door adjustments', 'Shelving', 'Flat-pack assembly', 'Tiling repairs', 'Picture hanging'],
    nouns: ['Handyman Services', 'Home Repairs', 'Maintenance', 'Odd Jobs'],
    angles: [
      'A list of small jobs is the speciality: the door that has not shut since winter, the shelf nobody has put up, the tile that came off behind the stove.',
      'Half-day and full-day bookings rather than a call-out fee per item, which is what makes a list of eight small things affordable.',
      'Rental and end-of-lease repairs for tenants and small landlords, with photographs for the agent.',
    ],
    practice: [
      'One tradesperson, the same one each visit, so nothing is re-explained.',
      'Anything that turns out to need a licensed plumber or electrician is said so plainly rather than attempted.',
      'Materials are bought on the way and itemised on the invoice at cost.',
    ],
    reviews: ['Worked through a list of nine jobs in a day. All of them done properly.', 'Honest about the two things that needed a licensed sparky.', 'Assembled and anchored a wall of flat-pack without a single leftover screw.', 'Turns up when he says he will, which is most of it.'],
    hours: 'trade',
  },
  {
    slug: 'masonry', name: 'Masonry & bricklaying', self: 'bricklaying and masonry business', parent: 'home-services',
    description: 'Brick and bluestone work — repointing, rebuilding, retaining walls and chimney repair.',
    imageQueries: ['bricklayer laying bricks', 'brick wall mortar trowel', 'stone wall masonry'],
    services: ['Repointing', 'Brick repairs', 'Retaining walls', 'Chimney repairs', 'Bluestone work', 'Rendering'],
    nouns: ['Masonry', 'Bricklaying', 'Brick & Stone', 'Stonework'],
    angles: [
      'Repointing and repair on the solid-brick and bluestone houses the inner suburbs are built from, matching the original mortar rather than sealing over it.',
      'Retaining walls, garden walls and letterboxes, engineered where the drop calls for it and drained properly behind.',
      'Chimney rebuilds and flashings, usually discovered after a leak has been chased back to the roof.',
    ],
    practice: [
      'Lime mortar where the building wants lime mortar; cement on a Victorian wall traps water and cracks the brick.',
      'A sample panel is built first on anything visible, so the colour and joint are agreed before the wall goes up.',
      'Small crew, one job at a time, and the site is swept every evening.',
    ],
    reviews: ['Matched hundred-year-old brickwork so well you cannot see the repair.', 'Rebuilt our chimney and finally stopped the leak.', 'Sample panel first was a great idea — we changed the joint colour before it was too late.', 'Left the laneway cleaner than they found it.'],
    hours: 'trade',
  },
  {
    slug: 'fencing', name: 'Fencing', self: 'fencing business', parent: 'home-services',
    description: 'Timber, colorbond and picket fencing, gates and retaining, including boundary work with neighbours.',
    imageQueries: ['wooden fence installation garden', 'fence panels backyard', 'metal fence gate'],
    services: ['Timber fencing', 'Colorbond fencing', 'Picket fencing', 'Gates', 'Repairs', 'Boundary fences'],
    nouns: ['Fencing', 'Fencing & Gates', 'Fence Co', 'Boundary Fencing'],
    angles: [
      'Timber paling, colorbond and heritage picket, with the posts set deep enough that the fence outlasts the argument about it.',
      'Boundary fences shared with a neighbour, including the written quote both parties need before the cost is split.',
      'Gates that keep working — hung on proper posts, with hardware chosen for the weight rather than the price.',
    ],
    practice: [
      'The old fence is removed and taken away in the same visit; nothing is left stacked in the driveway.',
      'Quotes are per metre with the post spacing and timber grade stated.',
      'Most suburban fences are done in a day, two with a retaining course.',
    ],
    reviews: ['Handled the neighbour conversation better than we would have.', 'Straight, solid, and the gate still swings true a year on.', 'Old fence gone the same day, no pile of rubbish left behind.', 'Picket matched the original profile from a photo.'],
    hours: 'trade',
  },
];

TRADES.push(
  {
    slug: 'glass-glazing', name: 'Glass & glazing', self: 'glazier', parent: 'home-services',
    description: 'Broken windows, double glazing, shower screens, mirrors and shopfront glass.',
    imageQueries: ['glazier window glass installation', 'broken window glass repair', 'glass shower screen'],
    services: ['Emergency board-up', 'Window replacement', 'Double glazing', 'Shower screens', 'Mirrors', 'Shopfront glass'],
    nouns: ['Glass', 'Glass & Glazing', 'Glaziers', 'Glazing Co'],
    angles: [
      'Broken windows boarded the same day and reglazed as soon as the pane is cut, including the heritage putty work the old sashes need.',
      'Double glazing retrofitted into existing timber frames, which keeps the street frontage and loses most of the traffic noise.',
      'Shower screens, splashbacks and mirrors measured on site, because almost nothing in an older house is square.',
    ],
    practice: [
      'Toughened and laminated glass to the standard the room requires, stated on the quote.',
      'Emergency board-ups within a couple of hours, with the reglaze booked before the van leaves.',
      'Old glass is taken away and recycled rather than left in the bin.',
    ],
    reviews: ['Boarded a smashed window within two hours of calling, reglazed two days later.', 'Retrofitted double glazing into our old sashes. The difference in noise is remarkable.', 'Measured twice, and the shower screen fits a very unsquare bathroom perfectly.', 'Explained why laminated was the right call next to the stairs.'],
    hours: 'trade',
  },
  {
    slug: 'appliance-repair', name: 'Appliance repair', self: 'appliance repair business', parent: 'home-services',
    description: 'Washing machines, dishwashers, ovens, fridges and dryers repaired rather than replaced.',
    imageQueries: ['appliance repair technician washing machine', 'repairing oven kitchen', 'dishwasher repair'],
    services: ['Washing machines', 'Dishwashers', 'Ovens and cooktops', 'Fridges', 'Dryers', 'Warranty repairs'],
    nouns: ['Appliance Repairs', 'Appliance Service', 'Whitegoods Repairs', 'Appliance Care'],
    angles: [
      'Washing machines, dishwashers, ovens and fridges, on the principle that most of them are worth one repair before they are worth replacing.',
      'Common parts for the major brands are carried on the van, so a good half of jobs are finished on the first visit.',
      'Warranty and insurance work alongside private jobs, with the report the insurer asks for.',
    ],
    practice: [
      'A call-out fee that comes off the repair if you go ahead, said plainly on the phone.',
      'If a repair costs more than the machine is worth, that is the advice you get.',
      'Three-month warranty on parts and labour, in writing.',
    ],
    reviews: ['Told us straight that the fridge was not worth fixing. Saved us the repair bill.', 'Had the part on the van and the machine was running the same afternoon.', 'Oven element replaced for a fraction of what a new oven would have cost.', 'Booked online, arrived in the window, no fuss.'],
    hours: 'trade',
  },
  {
    slug: 'renovations', name: 'Renovations', self: 'building and renovation business', parent: 'home-services',
    description: 'Kitchens, bathrooms and extensions, from design through to the final coat.',
    imageQueries: ['kitchen renovation construction', 'bathroom renovation tiles', 'home renovation interior'],
    services: ['Kitchens', 'Bathrooms', 'Extensions', 'Project management', 'Design and drafting', 'Permits'],
    nouns: ['Renovations', 'Building & Renovations', 'Construction', 'Builders'],
    angles: [
      'Kitchens and bathrooms mostly, with the trades coordinated by one person so the tiler is not waiting on the plumber who is waiting on the electrician.',
      'Rear extensions and reconfigurations on single-fronted terraces, where every centimetre and every permit matters.',
      'Design and drafting in-house, so what is drawn is what can actually be built for the budget discussed.',
    ],
    practice: [
      'A written program with dates, updated weekly, and one contact for the whole job.',
      'Fixed-price contracts with a documented allowance for anything that cannot be seen until the wall is open.',
      'Registered builder; insurance and warranty paperwork provided before any deposit.',
    ],
    reviews: ['Bathroom done in three weeks as promised, and the program was updated every Friday.', 'Found rot behind the shower and showed us before touching it.', 'One point of contact made the whole thing painless.', 'The drawings made the budget conversation honest from the start.'],
    hours: 'trade',
  },
  {
    slug: 'landscaping', name: 'Landscaping & gardens', self: 'landscaping business', parent: 'home-services',
    description: 'Garden design, paving, decking, irrigation and regular maintenance.',
    imageQueries: ['landscaping garden design backyard', 'gardener planting garden', 'garden paving stones'],
    services: ['Garden design', 'Paving', 'Decking', 'Irrigation', 'Planting', 'Maintenance'],
    nouns: ['Landscapes', 'Gardens', 'Landscaping', 'Garden Co'],
    angles: [
      'Courtyards and small gardens, which is what the inner suburbs mostly have: paving, a deck, a raised bed and something that survives an Adelaide February.',
      'Planting schemes built around drought-tolerant natives and the shade that a two-storey neighbour creates.',
      'Irrigation and drainage, because most failed gardens around here failed for water reasons rather than plant ones.',
    ],
    practice: [
      'A plan on paper before anything is dug, with the plant list priced separately.',
      'Maintenance visits monthly or seasonally, by the same gardener each time.',
      'Green waste is taken away and composted, not sent to landfill.',
    ],
    reviews: ['Turned a concrete courtyard into the best room of the house.', 'The plant choices have survived two summers without fuss.', 'Fixed the drainage first, which nobody else had suggested.', 'Monthly visits keep it looking like the day it was finished.'],
    hours: 'trade',
  },
  {
    slug: 'tree-services', name: 'Tree services', self: 'arborist practice', parent: 'home-services',
    description: 'Qualified arborists for pruning, removal, stump grinding and council permit reports.',
    imageQueries: ['arborist tree pruning climbing', 'tree removal chainsaw', 'tree stump grinding'],
    services: ['Pruning', 'Tree removal', 'Stump grinding', 'Arborist reports', 'Storm damage', 'Mulching'],
    nouns: ['Tree Services', 'Arborists', 'Tree Care', 'Trees'],
    angles: [
      'Pruning and removals by qualified arborists, with the council paperwork that most inner-Adelaide trees require before a saw is started.',
      'Arborist reports for permits, insurance and pre-purchase, written to the standard the council actually asks for.',
      'Storm work and emergency make-safe, with a crew on call through the windy months.',
    ],
    practice: [
      'Fully insured with a copy of the certificate sent with every quote.',
      'Everything is chipped on site and the mulch is left for you if you want it.',
      'Access over neighbouring fences and rooftops is agreed in writing before the day.',
    ],
    reviews: ['Removed a huge gum from a tight back garden without touching the fence.', 'The arborist report got our permit through first time.', 'Cleaned up so thoroughly you would not know they had been.', 'Came out the night of the storm to make a split limb safe.'],
    hours: 'trade',
  },
  {
    slug: 'pest-control', name: 'Pest control', self: 'pest control business', parent: 'home-services',
    description: 'Termites, rodents, ants, spiders and wasps — inspection, treatment and prevention.',
    imageQueries: ['pest control technician spraying', 'termite inspection wood', 'exterminator equipment'],
    services: ['Termite inspections', 'Termite treatment', 'Rodents', 'Ants and spiders', 'Wasps', 'Pre-purchase inspections'],
    nouns: ['Pest Control', 'Pest Management', 'Pest Services', 'Pest Co'],
    angles: [
      'Termite inspections and treatment, which in this part of Adelaide is the job that matters most and the one people leave longest.',
      'Rodents, ants, spiders and the occasional wasp nest, treated with the least product that will actually work.',
      'Pre-purchase timber pest inspections, with a report you can put in front of a conveyancer.',
    ],
    practice: [
      'Products, quantities and re-entry times are listed on the docket, including what is safe around pets.',
      'A twelve-month warranty on general treatments, with a free return visit if anything comes back.',
      'Inspections use moisture meters and thermal imaging rather than a torch and an opinion.',
    ],
    reviews: ['Found active termites the building inspector had missed.', 'Explained exactly what was sprayed and when the dog could come back inside.', 'Rodent problem gone after one visit and a lot of sensible advice about the roof.', 'Report was detailed enough for our conveyancer to act on.'],
    hours: 'sixDay',
  },
  {
    slug: 'pool-services', name: 'Pool services', self: 'pool servicing business', parent: 'home-services',
    description: 'Pool and spa servicing, water testing, equipment repair and green-pool recovery.',
    imageQueries: ['swimming pool cleaning service', 'pool maintenance equipment', 'pool water testing'],
    services: ['Regular servicing', 'Water testing', 'Pump and filter repair', 'Green pool recovery', 'Chlorinators', 'Leak detection'],
    nouns: ['Pool Services', 'Pool Care', 'Pools & Spas', 'Poolcare'],
    angles: [
      'Fortnightly and monthly servicing that keeps a pool swimmable without the owner learning water chemistry.',
      'Green pool recovery, usually after a summer away, with the filter run and the chemistry brought back over a week rather than in one dump of chlorine.',
      'Pumps, filters, chlorinators and heaters repaired or replaced, with the running cost of each option explained.',
    ],
    practice: [
      'Water is tested on site and the readings are left with you, not just the invoice.',
      'Service visits are the same day each fortnight, with a photograph if you are not home.',
      'Quotes for equipment state the energy rating, which is most of the cost over a pump’s life.',
    ],
    reviews: ['Brought a swamp back to swimmable in a week.', 'Left the test readings each visit so we could see it improving.', 'New pump halved the running cost and is far quieter.', 'Same day every fortnight without fail.'],
    hours: 'sixDay',
  },
  {
    slug: 'window-cleaning', name: 'Window cleaning', self: 'window cleaning business', parent: 'home-services',
    description: 'Interior and exterior window cleaning for homes, shopfronts and apartment buildings.',
    imageQueries: ['window cleaner cleaning glass', 'window washing squeegee', 'cleaning windows building'],
    services: ['Homes', 'Shopfronts', 'High windows', 'Tracks and sills', 'Solar panels', 'Regular schedules'],
    nouns: ['Window Cleaning', 'Window Care', 'Windows', 'Glass Cleaning'],
    angles: [
      'Inside and out, including the tracks and sills that are the reason windows look dirty again a week later.',
      'Water-fed poles for anything above the ground floor, so there is no ladder against your render and no boots on your roof.',
      'Shopfronts on a weekly or fortnightly round, early enough to be finished before opening.',
    ],
    practice: [
      'Purified water and no detergent on the exteriors, which is why they stay clear longer.',
      'Fixed price per house agreed on the first visit and held for the year.',
      'Fully insured, with the certificate available for body corporate paperwork.',
    ],
    reviews: ['First time in years we can see the garden properly.', 'Did the tracks without being asked. Enormous difference.', 'Shopfront done before we opened, every Monday.', 'No ladders, no mess, in and out in an hour.'],
    hours: 'sixDay',
  },
  {
    slug: 'house-cleaning', name: 'House cleaning', self: 'cleaning business', parent: 'home-services',
    description: 'Regular home cleaning, spring cleans and end-of-lease cleans with a bond-back guarantee.',
    imageQueries: ['house cleaning vacuum living room', 'cleaning kitchen surfaces', 'cleaning supplies bucket'],
    services: ['Regular cleaning', 'Spring cleans', 'End of lease', 'Oven cleaning', 'Carpet steam cleaning', 'Windows'],
    nouns: ['Cleaning', 'Home Cleaning', 'Cleaning Services', 'Clean Co'],
    angles: [
      'Weekly and fortnightly cleans by the same cleaner each visit, which is the only way a house actually stays on top of itself.',
      'End-of-lease cleans against the agent’s own checklist, with a return visit included if anything is queried.',
      'Spring cleans and post-renovation cleans, where the dust is in places a regular clean never reaches.',
    ],
    practice: [
      'Police-checked, insured cleaners, paid properly, which is why they stay.',
      'Products are low-fragrance by default, and anything you prefer can be used instead.',
      'A checklist is agreed on the first visit and left on the bench each time.',
    ],
    reviews: ['Same cleaner every fortnight and the house has never been better.', 'Got our full bond back after the end-of-lease clean.', 'Post-renovation dust that we had failed at twice, gone in a day.', 'Used our own products without being asked twice.'],
    hours: 'sixDay',
  },
  {
    slug: 'upholstery', name: 'Upholstery', self: 'upholstery workshop', siting: 'premises', parent: 'home-services',
    description: 'Reupholstery and repair for lounges, dining chairs, car seats and antiques.',
    imageQueries: ['upholstery furniture fabric chair', 'upholsterer workshop sofa', 'fabric sewing upholstery'],
    services: ['Lounge reupholstery', 'Dining chairs', 'Antique restoration', 'Foam replacement', 'Car and marine trim', 'Fabric supply'],
    nouns: ['Upholstery', 'Upholsterers', 'Furniture Upholstery', 'Trim & Upholstery'],
    angles: [
      'Reupholstery for lounges and dining chairs that were built well enough to be worth it, which is most furniture made before about 1990.',
      'Antique restoration with traditional springs and webbing, done the way the frame was built rather than stapled over.',
      'Car, motorcycle and marine trim alongside the domestic work, including seats a classic owner cannot buy new.',
    ],
    practice: [
      'Fabric samples are lent out so they can be seen in the room they are going in.',
      'The frame is assessed first: if it is not worth recovering, that is said before any fabric is chosen.',
      'Pickup and delivery across the inner suburbs, with the piece usually away two to three weeks.',
    ],
    reviews: ['My grandmother’s armchair came back better than new.', 'Honest that one of the two chairs was not worth doing.', 'Matched a fabric for a 1960s lounge that I thought was unfindable.', 'Picked up Tuesday, back a fortnight later, beautiful work.'],
    hours: 'shop',
  },
  {
    slug: 'home-security', name: 'Home security', self: 'security installer', parent: 'home-services',
    description: 'Alarms, cameras, intercoms and monitoring for homes and small businesses.',
    imageQueries: ['security camera installation house', 'alarm system keypad', 'cctv camera building'],
    services: ['Alarm systems', 'Cameras', 'Intercoms', 'Monitoring', 'Access control', 'Servicing'],
    nouns: ['Security', 'Security Systems', 'Alarms & Security', 'Protective Services'],
    angles: [
      'Alarms and cameras specified for the house rather than sold as a package: how many doors, which windows, and what you actually want to be told about.',
      'Intercoms and access control for apartment buildings and shopfronts, including the fobs and the plan for who holds them.',
      'Monitoring through an Australian-based centre, with self-monitoring offered as the cheaper option where it suits.',
    ],
    practice: [
      'Camera positions are agreed on site and the footage is shown to you before the installer leaves.',
      'Footage stays on a recorder in your house unless you ask for cloud storage; nothing is uploaded by default.',
      'Licensed installers, with the licence number on every quote.',
    ],
    reviews: ['Specified what we needed rather than what they wanted to sell.', 'Showed us the camera views before leaving and adjusted two of them.', 'Explained the privacy side properly, including the neighbour’s driveway.', 'Alarm has not had a false trigger in a year.'],
    hours: 'trade',
  },
);

TRADES.push(
  {
    slug: 'auto-repair', name: 'Auto repair', self: 'mechanical workshop', siting: 'premises', parent: 'auto-and-transport',
    description: 'Logbook servicing, brakes, batteries, diagnostics and roadworthy certificates.',
    imageQueries: ['mechanic repairing car engine', 'car workshop garage repair', 'car brake disc repair'],
    services: ['Logbook servicing', 'Brakes', 'Batteries', 'Diagnostics', 'Roadworthy certificates', 'Tyres'],
    nouns: ['Automotive', 'Motors', 'Auto Repairs', 'Mechanical'],
    angles: [
      'Logbook servicing that keeps a new-car warranty intact, alongside brakes, batteries and the diagnostics that follow a warning light.',
      'Roadworthy certificates and pre-purchase inspections, with the list of what failed and what it will cost given before anything is touched.',
      'European and Japanese makes both, with scan tools for each rather than a guess and a parts order.',
    ],
    practice: [
      'Photographs of worn parts are sent before replacement is authorised.',
      'A loan car or a lift to the bus stop, arranged when the booking is made.',
      'Prices quoted include parts, labour and disposal, so the invoice holds no surprises.',
    ],
    reviews: ['Sent photos of the brake pads before replacing them. No pressure either way.', 'Roadworthy done the same day with a clear list of what needed doing.', 'Found an intermittent fault two other places could not.', 'Booked in, done by 3, and the price matched the quote.'],
    hours: 'trade',
  },
  {
    slug: 'car-wash', name: 'Car wash & detailing', self: 'car wash and detailing business', siting: 'premises', parent: 'auto-and-transport',
    description: 'Hand washing, interior detailing, paint correction and ceramic coating.',
    imageQueries: ['car wash washing vehicle', 'car detailing polishing', 'car interior cleaning vacuum'],
    services: ['Hand wash', 'Interior detailing', 'Paint correction', 'Ceramic coating', 'Headlight restoration', 'Pre-sale detail'],
    nouns: ['Detailing', 'Car Care', 'Auto Detailing', 'Car Wash'],
    angles: [
      'Hand washing only — no brushes — with the two-bucket method that stops a wash putting the swirls in.',
      'Paint correction and ceramic coating for owners who intend to keep the car, with the panel-by-panel readings to show what was cut back.',
      'Pre-sale details that reliably return more than they cost, including the engine bay and the headlights.',
    ],
    practice: [
      'Booked in blocks rather than queued, so a full detail gets the day it needs.',
      'Water is recycled through a pit, which the council requires and most operators skip.',
      'Interior work includes the parts people forget: vents, seat rails and the boot well.',
    ],
    reviews: ['Ten-year-old paint looks closer to new than I thought possible.', 'Interior came up so well we stopped thinking about replacing the car.', 'No brushes, no swirls, and they explained why that matters.', 'Detailed before sale and it went for well above what we expected.'],
    hours: 'sixDay',
  },
  {
    slug: 'towing', name: 'Towing', self: 'towing and recovery business', parent: 'auto-and-transport',
    description: 'Breakdown recovery, accident towing, tilt-tray transport and machinery moves.',
    imageQueries: ['tow truck towing car', 'tow truck roadside', 'flatbed truck vehicle transport'],
    services: ['Breakdown recovery', 'Accident towing', 'Tilt tray', 'Machinery transport', 'Interstate transport', 'Roadside assistance'],
    nouns: ['Towing', 'Towing Services', 'Tow & Transport', 'Recovery'],
    angles: [
      'Breakdown and accident recovery around the clock, with tilt trays that carry a car rather than drag it.',
      'Low-clearance and prestige vehicles on soft straps, which is the difference between a tow and a repair bill.',
      'Machinery, forklifts and small plant moved between sites across the inner suburbs.',
    ],
    practice: [
      'A price and an arrival time are given on the phone, and the driver’s name is texted when they set off.',
      'Accredited for the accident towing allocation scheme, with the paperwork done at the scene.',
      'Vehicles are stored under cover, not in an open yard, while insurers decide.',
    ],
    reviews: ['On the South Eastern Freeway at 11pm with a blown tyre. Forty minutes and very reassuring.', 'Took a lowered car onto the tilt tray without a scrape.', 'Texted the driver’s name and ETA, which mattered at 2am.', 'Moved a forklift between sites at short notice.'],
    hours: 'sixDay',
  },
  {
    slug: 'removalists', name: 'Removalists', self: 'removals business', parent: 'auto-and-transport',
    description: 'House and office moves, packing, storage and single-item deliveries.',
    imageQueries: ['movers carrying furniture truck', 'moving boxes house', 'removal truck loading'],
    services: ['House moves', 'Office moves', 'Packing', 'Storage', 'Single items', 'Piano moves'],
    nouns: ['Removals', 'Removalists', 'Moving Co', 'Transport'],
    angles: [
      'House moves across the inner suburbs, where the job is usually the stairs, the laneway and the permit rather than the distance.',
      'Office and studio moves out of hours, so nobody loses a working day.',
      'Packing and unpacking as an option, with materials supplied and taken away afterwards.',
    ],
    practice: [
      'Quotes are by the hour with a written estimate of hours, or fixed price if you prefer certainty.',
      'Blankets, straps and floor runners as standard, not as an extra line.',
      'Insurance cover is explained before the day, including what it does not cover.',
    ],
    reviews: ['Three flights of stairs and not a mark on anything.', 'Arrived on time, worked hard, finished under the estimate.', 'Packed the kitchen better than we would have.', 'Sorted the parking permit for us, which we had not thought about.'],
    hours: 'sixDay',
  },
  {
    slug: 'dentists', name: 'Dentists', self: 'dental practice', siting: 'premises', parent: 'health-and-wellness',
    description: 'General dentistry — check-ups, fillings, crowns, whitening and emergency appointments.',
    imageQueries: ['dentist examining patient clinic', 'dental chair clinic room', 'dental hygienist cleaning'],
    services: ['Check-ups and cleans', 'Fillings', 'Crowns', 'Whitening', 'Emergency appointments', 'Children’s dentistry'],
    nouns: ['Dental', 'Dental Care', 'Dental Surgery', 'Dentistry'],
    angles: [
      'General dentistry for families and for people who work in the city, with early and late appointments most days.',
      'Digital x-rays and intra-oral cameras, so you see what the dentist sees before deciding anything.',
      'Emergency slots held each day for pain, a broken tooth or a lost filling.',
    ],
    practice: [
      'Treatment plans are given in writing with costs and item numbers before work starts.',
      'Preferred provider for the major funds, with on-the-spot claiming.',
      'Payment plans for larger treatment, explained without pressure.',
    ],
    reviews: ['Gentle, unhurried, and the first dentist I have not dreaded.', 'Showed me the photos and let me decide. No upselling.', 'Fitted me in the same morning with a broken tooth.', 'Written quote before the crown, and it did not change.'],
    hours: 'clinic',
  },
  {
    slug: 'chiropractors', name: 'Chiropractors', self: 'chiropractic clinic', siting: 'premises', parent: 'health-and-wellness',
    description: 'Chiropractic care for back and neck pain, headaches and sports injuries.',
    // Deliberately several, and not physiotherapy: the physio trade takes those
    // files first, and a photograph is never used twice, which left this trade
    // with nothing at all on the first run.
    imageQueries: [
      'chiropractor patient treatment',
      'massage table therapist back',
      'osteopath manual therapy',
      'spine anatomy model',
      'back treatment clinic',
      'manual therapy shoulder',
      'treatment room couch clinic',
      'vertebral column model',
      'therapist treating patient neck',
      'rehabilitation exercise band',
    ],
    services: ['Back and neck pain', 'Headaches', 'Sports injuries', 'Posture assessment', 'Dry needling', 'Rehabilitation'],
    nouns: ['Chiropractic', 'Chiropractic Clinic', 'Spine & Health', 'Chiropractors'],
    angles: [
      'Back and neck pain, headaches and the shoulder problems that come from a desk and a laptop.',
      'A first appointment of forty-five minutes that includes an examination and a plan, rather than an adjustment and a booking for Thursday.',
      'Work with local gyms and running groups on load management and return from injury.',
    ],
    practice: [
      'Every patient leaves with exercises, and the plan says how many visits are expected.',
      'Referral to a GP or imaging when that is the right answer, said plainly.',
      'Health fund claiming on the spot; no lock-in packages.',
    ],
    reviews: ['First place that gave me exercises instead of a standing appointment.', 'Headaches I had had for years are basically gone.', 'Told me honestly when to see my GP instead.', 'Explained what was happening rather than just cracking my back.'],
    hours: 'clinic',
  },
  {
    slug: 'optometrists', name: 'Optometrists', self: 'optometry practice', siting: 'premises', parent: 'health-and-wellness',
    description: 'Eye tests, glasses, contact lenses and retinal imaging, bulk billed where eligible.',
    imageQueries: ['optometrist eye examination patient', 'glasses optician shop frames', 'eye test equipment'],
    services: ['Eye tests', 'Glasses', 'Contact lenses', 'Retinal imaging', 'Children’s vision', 'Dry eye treatment'],
    nouns: ['Optical', 'Optometrists', 'Eyecare', 'Vision'],
    angles: [
      'Bulk-billed eye tests where Medicare applies, with retinal imaging included rather than charged as an extra.',
      'An unhurried frame fitting: the measurement matters more than the label, particularly with a strong prescription.',
      'Contact lens fitting including the trial pairs and the follow-up that a first-time wearer needs.',
    ],
    practice: [
      'Test results and images are kept and shown alongside the previous visit, so change is visible.',
      'Frames across a wide price range, with the lens options explained in plain English.',
      'Glasses are usually ready in a week and adjusted free for as long as you have them.',
    ],
    reviews: ['Most thorough eye test I have had, and bulk billed.', 'Spent half an hour on the fitting and the glasses are perfect.', 'Picked up something on the retinal scan and referred me quickly.', 'Adjusted my frames months later without charging.'],
    hours: 'shop',
  },
  {
    slug: 'gyms-fitness', name: 'Gyms & fitness', self: 'gym', siting: 'premises', parent: 'health-and-wellness',
    description: 'Gyms, personal training and small-group classes with month-to-month memberships.',
    imageQueries: ['gym weights training', 'fitness class group exercise', 'personal trainer gym'],
    services: ['Gym membership', 'Personal training', 'Small group classes', 'Strength programs', 'Beginner programs', 'Nutrition guidance'],
    nouns: ['Fitness', 'Strength & Fitness', 'Training', 'Gym'],
    angles: [
      'Strength training with coaching on the floor, not a room of machines and nobody watching.',
      'Small-group classes capped at eight, which is the point where a coach can still correct a lift.',
      'Beginner programs that start with an assessment and a plan for the first eight weeks.',
    ],
    practice: [
      'Month-to-month memberships with no lock-in and no exit fee.',
      'Programs are written down and reviewed every six weeks.',
      'Staffed hours cover early mornings and evenings, when most members actually train.',
    ],
    reviews: ['Coached properly from day one. No lock-in contract either.', 'Small classes mean my technique actually got fixed.', 'Program reviewed every six weeks and it shows.', 'Friendly without being intense. Rare combination.'],
    hours: 'sixDay',
  },
  {
    slug: 'day-spas', name: 'Day spas', self: 'day spa', siting: 'premises', parent: 'health-and-wellness',
    description: 'Massage, facials and treatments, individually or as half-day packages.',
    imageQueries: ['spa massage treatment room', 'facial treatment spa', 'spa candles relaxation'],
    services: ['Massage', 'Facials', 'Body treatments', 'Couples packages', 'Gift vouchers', 'Waxing'],
    nouns: ['Day Spa', 'Spa', 'Wellness Spa', 'Retreat'],
    angles: [
      'Massage and facials booked by the treatment rather than sold as a course of ten.',
      'Half-day packages that combine a treatment, a break and somewhere quiet to sit afterwards.',
      'Therapists trained in remedial as well as relaxation work, so a knot gets attention if you want it to.',
    ],
    practice: [
      'A short consultation before each treatment, including anything you would rather was not used.',
      'Gift vouchers valid for three years, not the legal minimum.',
      'Rooms are booked with a gap either side, so nothing feels rushed.',
    ],
    reviews: ['Actually relaxing rather than a conveyor belt.', 'The remedial massage sorted a shoulder that had bothered me for months.', 'Voucher was valid for three years, which is unusually decent.', 'Quiet, clean, and nobody tried to sell me a package.'],
    hours: 'shop',
  },
  {
    slug: 'barbers', name: 'Barbers', self: 'barbershop', siting: 'premises', parent: 'personal-care',
    description: 'Cuts, fades, beard trims and hot-towel shaves, walk-ins welcome.',
    imageQueries: ['barber cutting hair shop', 'barber beard trim', 'barbershop chair interior'],
    services: ['Haircuts', 'Skin fades', 'Beard trims', 'Hot towel shaves', 'Children’s cuts', 'Head shaves'],
    nouns: ['Barbers', 'Barber Shop', 'Barbershop', 'Grooming Co'],
    angles: [
      'Classic cuts and skin fades, with walk-ins usually seated inside twenty minutes.',
      'Beard work and hot-towel shaves by barbers who were trained on a cut-throat rather than a trimmer.',
      'Children’s cuts on weekday mornings, when the shop is quiet enough for a first haircut.',
    ],
    practice: [
      'Book online for a particular barber, or walk in and take whoever is free.',
      'The price list is on the wall and there is one price for a cut, whoever does it.',
      'Open late one evening a week for people who cannot get in before six.',
    ],
    reviews: ['Consistently good fades and never any upselling.', 'First barber my son has not cried in.', 'Walked in on a Saturday and was out in half an hour.', 'The hot towel shave is worth the extra twenty minutes.'],
    hours: 'shop',
  },
  {
    slug: 'dry-cleaning', name: 'Dry cleaning & laundry', self: 'dry cleaner', siting: 'premises', parent: 'personal-care',
    description: 'Dry cleaning, laundry, alterations and specialist care for suits and wedding dresses.',
    imageQueries: ['dry cleaning clothes rack', 'laundry service ironing', 'clothes steaming garment'],
    services: ['Dry cleaning', 'Laundry', 'Alterations', 'Wedding dresses', 'Curtains and doonas', 'Same-day service'],
    nouns: ['Dry Cleaners', 'Laundry & Dry Cleaning', 'Garment Care', 'Cleaners'],
    angles: [
      'Everyday dry cleaning and shirt laundry, with a same-day option for anything in before nine.',
      'Suits, coats and formal wear pressed by hand, and alterations done on site rather than sent away.',
      'Wedding dress cleaning and boxing, and the curtains and doonas nobody has room to wash at home.',
    ],
    practice: [
      'Solvent-free wet cleaning for anything that can take it, which is most things.',
      'Repairs and missing buttons are done as a matter of course, not charged separately.',
      'Pickup and delivery across the inner suburbs twice a week.',
    ],
    reviews: ['Got a stain out of a suit that two other cleaners had given up on.', 'Alterations done on site and ready the next day.', 'Replaced a missing button without being asked or charging.', 'Pickup and delivery makes the whole thing effortless.'],
    hours: 'shop',
  },
  {
    slug: 'bakeries', name: 'Bakeries', self: 'bakery', siting: 'premises', parent: 'food-and-drink',
    description: 'Sourdough, pastries, pies and celebration cakes, baked on the premises.',
    imageQueries: ['bakery bread loaves display', 'croissant pastry bakery', 'baker kneading dough'],
    services: ['Sourdough', 'Pastries', 'Pies', 'Celebration cakes', 'Coffee', 'Wholesale'],
    nouns: ['Bakery', 'Bakehouse', 'Bakers', 'Bread & Pastry'],
    angles: [
      'Baked overnight on the premises: a country sourdough, a seeded rye, baguettes and whatever the weekend special turns out to be.',
      'Pastry is the other half of the business — croissants, cardamom buns and a fruit danish — and it goes by mid-morning.',
      'Pies, sausage rolls and a short lunch menu, with celebration cakes to order.',
    ],
    practice: [
      'Flour is milled in South Australia and the starter is older than the shop.',
      'Bread can be reserved by phone the day before, which regulars do for Saturdays.',
      'Whatever is left at close goes to a food rescue service rather than the bin.',
    ],
    reviews: ['The rye is the best bread I have had in Adelaide. Get there early.', 'Cardamom buns are dangerous.', 'Ordered a birthday cake and it was beautiful and not too sweet.', 'Reserved a loaf by phone and it was waiting for me.'],
    hours: 'earlyTrade',
  },
  {
    slug: 'catering', name: 'Catering', self: 'catering business', parent: 'food-and-drink',
    description: 'Catering for offices, weddings and parties, with dietary requirements handled properly.',
    imageQueries: ['catering buffet food table', 'catering platter food', 'chef preparing catering food'],
    services: ['Office catering', 'Weddings', 'Parties', 'Grazing tables', 'Canapés', 'Staff and hire'],
    nouns: ['Catering', 'Catering Co', 'Kitchen & Catering', 'Food Co'],
    angles: [
      'Office catering on a standing order — breakfast, sandwich lunches and boardroom platters — delivered before the meeting rather than during it.',
      'Weddings and parties from canapés to seated dinners, with staff and hire arranged as part of the same booking.',
      'Grazing tables and share platters, which is what most people actually want at a party.',
    ],
    practice: [
      'Dietary requirements are labelled on every platter, not listed on an email nobody reads.',
      'Tastings for weddings and larger events, credited against the booking.',
      'Everything is cooked in a registered kitchen, and the certificate is on the quote.',
    ],
    reviews: ['Fed sixty people with four different dietary requirements and nobody felt like an afterthought.', 'Arrived early, set up, cleared away. Faultless.', 'The grazing table was the talking point of the party.', 'Standing office order that has never once been late.'],
    hours: 'sixDay',
  },
  {
    slug: 'photographers', name: 'Photographers', self: 'photography studio', siting: 'premises', parent: 'professional-services',
    description: 'Weddings, portraits, events and commercial photography.',
    imageQueries: ['photographer camera portrait session', 'wedding photographer couple', 'photography studio lighting'],
    services: ['Weddings', 'Portraits', 'Events', 'Commercial', 'Headshots', 'Prints and albums'],
    nouns: ['Photography', 'Photographic', 'Studio', 'Images'],
    angles: [
      'Weddings photographed documentary-style, with as little arranging as the couple can bear.',
      'Portraits and headshots in a small studio or on location, with the images back within a week.',
      'Commercial work for local businesses — food, interiors and the product shots a website needs.',
    ],
    practice: [
      'Full-resolution files supplied, with printing rights included rather than sold back to you.',
      'Two photographers on weddings, so the ceremony is covered from both ends.',
      'Albums and prints made locally, and you see a proof before anything is bound.',
    ],
    reviews: ['Barely noticed him all day and the photos are extraordinary.', 'Headshots done in an hour and back within the week.', 'Full-resolution files included, which nobody else offered.', 'Photographed our café and the bookings went up. Genuinely.'],
    hours: 'shop',
  },
  {
    slug: 'pet-grooming', name: 'Pet grooming', self: 'grooming salon', siting: 'premises', parent: 'pets-and-vets',
    description: 'Dog and cat grooming — full grooms, baths, nail trims and hand-stripping.',
    imageQueries: ['dog grooming salon groomer', 'dog bath washing', 'cat grooming brush'],
    services: ['Full grooms', 'Baths', 'Nail trims', 'De-shedding', 'Hand stripping', 'Puppy introductions'],
    nouns: ['Pet Grooming', 'Dog Grooming', 'Grooming Salon', 'Pet Salon'],
    angles: [
      'One groomer per animal from start to finish, so a nervous dog is not passed between three people.',
      'Hand-stripping for wire coats and de-shedding for the double-coated breeds that struggle through February.',
      'Puppy introductions: a short, free first visit that is only a hello and a treat.',
    ],
    practice: [
      'Anxious animals are booked into the quiet hours and never left crated for the day.',
      'Nails, ears and pads are included in a full groom rather than added on.',
      'You are sent a photograph when the groom is finished, before pickup.',
    ],
    reviews: ['Our rescue greyhound actually enjoys going now.', 'Hand-stripped properly rather than clipped. The coat is transformed.', 'Booked into a quiet slot because he is nervous. It made all the difference.', 'Sends a photo when she is done, which is a lovely touch.'],
    hours: 'sixDay',
  },
  {
    slug: 'cafes', name: 'Cafes', self: 'café', siting: 'premises', parent: 'food-and-drink', count: 2,
    description: 'Coffee, breakfast and lunch, from espresso bars to all-day kitchens.',
    imageQueries: ['cafe interior coffee counter', 'barista coffee latte art', 'breakfast plate cafe'],
    services: ['Coffee', 'Breakfast', 'Lunch', 'Takeaway', 'Catering', 'Outdoor seating'],
    nouns: ['Coffee', 'Espresso Bar', 'Coffee House', 'Roasters'],
    angles: [
      'A short breakfast menu done properly and coffee from a roaster twenty minutes away.',
      'All-day kitchen with a counter of toasties and salads from eleven, and a courtyard that catches the afternoon.',
      'An espresso bar first: twelve seats, filter on batch, and pastries from the bakery up the road.',
    ],
    practice: [
      'Single-origin on filter changes fortnightly, and the staff will talk about it only if you want them to.',
      'Half the seating is walk-in only, so regulars can always get in.',
      'Milk from one Adelaide Hills dairy, and four alternatives at no extra charge.',
    ],
    reviews: ['Best coffee within a short walk of here, and the staff remember your order.', 'The breakfast menu is short and every item on it is good.', 'Courtyard in the afternoon is the best seat in the suburb.', 'No surcharge on oat milk, which should be normal and is not.'],
    hours: 'earlyTrade',
  },
  {
    slug: 'bars', name: 'Bars', self: 'bar', siting: 'premises', parent: 'food-and-drink', count: 1,
    description: 'Wine bars, cocktail bars and pubs across the inner suburbs.',
    imageQueries: ['cocktail bar interior counter', 'wine bar bottles glasses', 'bartender pouring drink'],
    services: ['Cocktails', 'Wine list', 'Bar snacks', 'Function room', 'Live music', 'Takeaway bottles'],
    nouns: ['Wine Bar', 'Bar', 'Cocktail Bar', 'Wine Room'],
    angles: [
      'A hundred and fifty wines, mostly South Australian and mostly from small growers, with twenty by the glass that change weekly.',
      'Cocktails made properly and a non-alcoholic list that is not an afterthought.',
      'A neighbourhood bar with a charcoal grill and a short menu of things to share.',
    ],
    practice: [
      'Bottles can be bought to take away at retail prices after dinner.',
      'Walk-ins for most of the room; tables of six or more should book.',
      'Staff know the list and will pour you something you would not have chosen.',
    ],
    reviews: ['Exactly what the neighbourhood needed. The staff know the list inside out.', 'Great by the glass, and the snacks are better than they need to be.', 'Non-alcoholic options that are actually interesting.', 'Bought two bottles to take home at shop prices. Lovely people.'],
    hours: 'hospitality',
  },
  {
    slug: 'restaurants', name: 'Restaurants', self: 'restaurant', siting: 'premises', parent: 'food-and-drink', count: 2,
    description: 'Dining rooms across Adelaide, from neighbourhood kitchens to the East End.',
    imageQueries: ['restaurant dining room tables', 'chef plating dish kitchen', 'restaurant food plate'],
    services: ['Dine-in', 'Takeaway', 'Functions', 'Set menu', 'Delivery', 'Bar'],
    nouns: ['Kitchen', 'Dining', 'Trattoria', 'Table'],
    angles: [
      'A short menu built around South Australian produce, changed every few weeks as the season moves.',
      'A neighbourhood dining room with a wood grill, open from lunch through to a late supper on weekends.',
      'Family-run, with a set menu for larger tables and a pasta made in the kitchen each morning.',
    ],
    practice: [
      'A quarter of the room is held for walk-ins every night.',
      'Private dining for up to twenty-four with a set menu agreed in advance.',
      'Dietary requirements are handled on the night without a fortnight of notice.',
    ],
    reviews: ['The set menu was faultless and the service was attentive without hovering.', 'Handled four dietary requirements without making a thing of it.', 'Produce is clearly the real thing. Worth the price.', 'Booked the private room for a work lunch and it was seamless.'],
    hours: 'hospitality',
  },
  {
    slug: 'independent-shops', name: 'Independent shops', self: 'independent shop', siting: 'premises', parent: 'shopping', count: 2,
    description: 'Booksellers, record shops, gift shops and the specialists worth crossing town for.',
    imageQueries: ['bookshop interior shelves books', 'record shop vinyl browsing', 'gift shop interior display'],
    services: ['Books', 'Vinyl records', 'Gifts', 'Special orders', 'Gift wrapping', 'Events'],
    nouns: ['Books', 'Records', 'Gifts & Homewares', 'Trading Co'],
    angles: [
      'Two floors, with the staff picks written by hand and a children’s section that people travel for.',
      'New and secondhand vinyl, listening decks at the back, and a monthly in-store from a local act.',
      'Gifts, cards and homewares from makers within a day’s drive, most of whom the owner has met.',
    ],
    practice: [
      'Special orders usually arrive within the week; anything in print can be ordered.',
      'A loyalty card that is a piece of cardboard, and a stamp per visit.',
      'Events most Thursday evenings, and the chairs come out at six.',
    ],
    reviews: ['Recommended something I would never have picked and was completely right.', 'Tracked down an out-of-print title in four days.', 'The kind of shop you go in for one thing and leave with three.', 'Lovely staff, and the Thursday events are worth turning up for.'],
    hours: 'shop',
  },
);
