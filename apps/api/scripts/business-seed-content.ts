/**
 * Demonstration listings for a development database: twenty Adelaide
 * businesses, each with a description, services, hours, address, contact
 * routes, social links, photographs and approved reviews.
 *
 * Every business here is fictional. The suburbs, streets and postcodes are
 * real — the directory is scoped to the City of Adelaide and the Inner
 * Adelaide local areas around it — but the names, the people in the reviews
 * and every contact route are invented: phone numbers are in the (08) 5550
 * range that ACMA reserves for fiction, and the email and web addresses are on
 * domains that belong to nobody. Nothing here describes a real trader, so
 * nothing here can misdescribe one.
 *
 * Photographs are found on Wikimedia Commons at seed time from the queries
 * below, and only files under an attribution-only licence are used; the alt
 * text is taken from the file's own description, so it describes the picture
 * that was actually chosen.
 */

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** `[weekdays, open, close]`, times as "HH:MM" in Adelaide local time. */
export type HoursRule = [Weekday[], string, string];

export interface SeedReview {
  name: string;
  rating: 1 | 2 | 3 | 4 | 5;
  text: string;
  /** Days before now that the review was left, so the list is not one date. */
  daysAgo: number;
}

export interface SeedBusiness {
  slug: string;
  name: string;
  category: string;
  /** Secondary category slugs, when the listing straddles two. */
  alsoIn?: string[];
  area: string;
  description: string;
  services: string[];
  phone: string;
  email: string;
  website: string;
  address: { line1: string; line2?: string; suburb: string; postcode: string; lat: number; lng: number };
  hours: HoursRule[];
  links: { kind: 'facebook' | 'instagram' | 'x' | 'linkedin' | 'youtube' | 'tiktok' | 'pinterest'; url: string }[];
  /** Commons search queries; the first finds the cover, the rest the gallery. */
  images: string[];
  reviews: SeedReview[];
  /** The year trading began; shown as "n years in business". */
  established: number;
}

/** Services grouped by the category they belong to; upserted before the listings. */
export const SEED_SERVICES: Record<string, string[]> = {
  cafes: ['Coffee', 'Breakfast', 'Lunch', 'Takeaway', 'Catering'],
  restaurants: ['Dine-in', 'Takeaway', 'Delivery', 'Functions', 'Set menu'],
  bars: ['Cocktails', 'Wine list', 'Live music', 'Function room', 'Bar snacks'],
  'pets-and-vets': ['Vaccinations', 'Surgery', 'Dental care', 'Grooming', 'Boarding', 'Microchipping'],
  'home-services': ['Plumbing', 'Gas fitting', 'Electrical', 'Mobile mechanic', 'Emergency call-out', 'Hot water systems'],
  'health-and-wellness': ['Physiotherapy', 'Remedial massage', 'Yoga classes', 'Pilates', 'Dental check-ups', 'Teeth whitening'],
  'independent-shops': ['Books', 'Gifts', 'Haircuts', 'Beard trims', 'Vinyl records'],
  'food-and-drink': ['Bread', 'Pastries', 'Fresh seafood', 'Fruit and vegetables', 'Wholesale supply'],
  shopping: ['Flowers', 'Wedding arrangements', 'Same-day delivery', 'Gift hampers'],
  'professional-services': ['Accounting', 'Tax returns', 'Bookkeeping', 'Conveyancing', 'Wills and estates', 'Business advice'],
};

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];
const ALL: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export const SEED_BUSINESSES: SeedBusiness[] = [
  {
    slug: 'wakefield-lane-espresso',
    established: 2013,
    name: 'Wakefield Lane Espresso',
    category: 'cafes',
    area: 'adelaide',
    description:
      'A twelve-seat espresso bar at the eastern end of Wakefield Street, run by the same two owners since 2013. The beans are roasted in the inner west and change with the season; the milk comes from a single Fleurieu dairy. Breakfast is small and done properly — eggs, a good sourdough, a rotating bircher — and the lunch counter fills with toasties and salads by eleven. Most of the trade is regulars from the offices and law firms nearby and the terraces around Hutt Street, and the staff know their orders.',
    services: ['Coffee', 'Breakfast', 'Lunch', 'Takeaway'],
    phone: '(08) 5550 1201',
    email: 'hello@wakefieldlaneespresso.com.au',
    website: 'https://wakefieldlaneespresso.com.au',
    address: { line1: 'Shop 2, 131 Wakefield Street', suburb: 'Adelaide', postcode: '5000', lat: -34.9291, lng: 138.6046 },
    hours: [[WEEKDAYS, '06:30', '15:30'], [[6, 7], '07:30', '14:00']],
    links: [{ kind: 'instagram', url: 'https://www.instagram.com/wakefieldlaneespresso' }, { kind: 'facebook', url: 'https://www.facebook.com/wakefieldlaneespresso' }],
    images: ['barista latte art espresso', 'cafe interior coffee counter', 'sourdough toast breakfast plate', 'espresso machine coffee shop'],
    reviews: [
      { name: 'Priya N.', rating: 5, text: 'Best flat white on the east side of the city and I have tried most of them. The bircher is worth getting up for.', daysAgo: 12 },
      { name: 'Tom R.', rating: 4, text: 'Tiny, busy, and the coffee is consistently excellent. Hard to get a seat after nine on a weekend.', daysAgo: 40 },
      { name: 'Hannah L.', rating: 5, text: 'They remembered my order on my second visit. Toasties are generous and the staff are lovely.', daysAgo: 71 },
    ],
  },
  {
    slug: 'torrens-bank-kitchen',
    established: 2016,
    name: 'Torrens Bank Kitchen',
    category: 'restaurants',
    area: 'north-adelaide',
    description:
      'A riverbank restaurant on War Memorial Drive looking back across the Torrens to the city, with a menu built around South Australian seafood — Spencer Gulf prawns, King George whiting, Coffin Bay oysters — and lamb and vegetables from the Adelaide Hills. The dining room seats ninety with a covered terrace for another forty, and the kitchen is open from lunch through to a late supper on Fridays and Saturdays. A four-course set menu changes fortnightly; the à la carte is shorter and leans on the grill. Private dining for up to twenty-four is available with notice, and the room fills early on match days at the Oval across the river.',
    services: ['Dine-in', 'Functions', 'Set menu', 'Takeaway'],
    phone: '(08) 5550 1202',
    email: 'bookings@torrensbankkitchen.com.au',
    website: 'https://torrensbankkitchen.com.au',
    address: { line1: '20 War Memorial Drive', suburb: 'North Adelaide', postcode: '5006', lat: -34.9161, lng: 138.5882 },
    hours: [[[2, 3, 4], '12:00', '22:00'], [[5, 6], '12:00', '23:30'], [[7], '12:00', '21:00']],
    links: [{ kind: 'instagram', url: 'https://www.instagram.com/torrensbankkitchen' }, { kind: 'facebook', url: 'https://www.facebook.com/torrensbankkitchen' }],
    images: ['restaurant dining room interior tables', 'grilled fish seafood plate', 'River Torrens Adelaide', 'chef plating restaurant kitchen'],
    reviews: [
      { name: 'Marcus D.', rating: 5, text: 'The set menu was faultless and the view over the river at sunset made the evening. Service was attentive without hovering.', daysAgo: 9 },
      { name: 'Elena V.', rating: 4, text: 'Excellent whiting, slightly slow between courses on a busy Saturday. Would go back for the terrace alone.', daysAgo: 33 },
      { name: 'Chris O.', rating: 5, text: 'Booked the private room for a work lunch — they handled dietary requirements for twenty people without a fuss.', daysAgo: 58 },
      { name: 'Aisha K.', rating: 4, text: 'Pricey, but the produce is clearly the real thing. Good wine list with plenty by the glass.', daysAgo: 95 },
    ],
  },
  {
    slug: 'the-eastside-rooftop',
    established: 2018,
    name: 'The Eastside Rooftop',
    category: 'bars',
    area: 'adelaide',
    description:
      'A rooftop bar four floors above Rundle Street in the East End, with a view west over the city and north across the parklands. The list is cocktail-led — a dozen house drinks, a good negroni and a sensible non-alcoholic section — alongside wines from McLaren Vale and the Adelaide Hills and South Australian beers on tap. There is a small kitchen doing bar snacks and share plates until late. The space is partly covered and heated, so it runs through winter, and a section can be booked for groups of up to sixty. Live music on Sunday afternoons from local acts, and late nights through the Fringe.',
    services: ['Cocktails', 'Wine list', 'Live music', 'Function room', 'Bar snacks'],
    phone: '(08) 5550 1203',
    email: 'hello@eastsiderooftop.com.au',
    website: 'https://eastsiderooftop.com.au',
    address: { line1: 'Level 4, 262 Rundle Street', suburb: 'Adelaide', postcode: '5000', lat: -34.9226, lng: 138.6079 },
    hours: [[[3, 4], '16:00', '23:00'], [[5], '16:00', '01:00'], [[6], '14:00', '01:00'], [[7], '14:00', '22:00']],
    links: [{ kind: 'instagram', url: 'https://www.instagram.com/theeastsiderooftop' }, { kind: 'facebook', url: 'https://www.facebook.com/theeastsiderooftop' }, { kind: 'tiktok', url: 'https://www.tiktok.com/@theeastsiderooftop' }],
    images: ['rooftop bar city skyline evening', 'bartender cocktail shaker', 'rooftop terrace bar heaters night', 'negroni cocktail glass bar'],
    reviews: [
      { name: 'Jade W.', rating: 5, text: 'Went for sunset drinks and stayed for the band. The view is genuinely great and the cocktails are properly made.', daysAgo: 6 },
      { name: 'Ben S.', rating: 3, text: 'Good drinks, but it took twenty minutes to get served on a Friday night in Fringe season. Get there early.', daysAgo: 27 },
      { name: 'Sofia M.', rating: 4, text: 'Heaters make it comfortable even in July. The non-alcoholic list is better than most.', daysAgo: 64 },
    ],
  },
  {
    slug: 'unley-park-veterinary-clinic',
    established: 2004,
    name: 'Unley Park Veterinary Clinic',
    category: 'pets-and-vets',
    area: 'unley-park',
    description:
      'A small-animal practice on Cross Road with three vets and two nurses, treating dogs, cats, rabbits and the occasional guinea pig. The clinic does consultations, vaccinations, desexing, dental work and routine surgery on site, with digital x-ray and in-house pathology so most results are back the same day. Emergency cases outside hours are referred to the nearest 24-hour animal hospital, and the phone message says where. Appointments can be booked online, and a nurse-run clinic on Saturday mornings handles vaccinations and weight checks.',
    services: ['Vaccinations', 'Surgery', 'Dental care', 'Microchipping'],
    phone: '(08) 5550 1204',
    email: 'reception@unleyparkvet.com.au',
    website: 'https://unleyparkvet.com.au',
    address: { line1: '206 Cross Road', suburb: 'Unley Park', postcode: '5061', lat: -34.9697, lng: 138.6031 },
    hours: [[WEEKDAYS, '08:00', '18:30'], [[6], '08:30', '13:00']],
    links: [{ kind: 'facebook', url: 'https://www.facebook.com/unleyparkvet' }, { kind: 'instagram', url: 'https://www.instagram.com/unleyparkvet' }],
    images: ['veterinarian examining dog clinic', 'veterinary clinic reception', 'cat veterinary examination', 'veterinarian with puppy'],
    reviews: [
      { name: 'Louise F.', rating: 5, text: 'They have looked after our two dogs for eight years. Honest about what is needed and what can wait.', daysAgo: 15 },
      { name: 'Daniel P.', rating: 5, text: 'Our cat needed surgery at short notice and they fitted her in the same day. Clear explanation of the costs up front.', daysAgo: 48 },
      { name: 'Mei C.', rating: 4, text: 'Kind, thorough vets. Getting in and out of the car park on Cross Road at peak hour is the only difficulty.', daysAgo: 102 },
    ],
  },
  {
    slug: 'thebarton-plumbing-and-gas',
    established: 2009,
    name: 'Thebarton Plumbing & Gas',
    category: 'home-services',
    area: 'thebarton',
    description:
      'A licensed plumbing and gas-fitting business working across the inner west from a base on South Road. Two vans cover blocked drains, burst pipes, hot water replacements, gas appliance installation and compliance certificates, with a same-day response for emergencies across the western suburbs and the city. Quotes are fixed before work starts and every job is documented with photographs. The team also does the plumbing on small renovations — kitchens, bathrooms and laundries — and rainwater tank connections, working alongside the owner’s own builder or yours.',
    services: ['Plumbing', 'Gas fitting', 'Hot water systems', 'Emergency call-out'],
    phone: '(08) 5550 1205',
    email: 'jobs@thebartonplumbing.com.au',
    website: 'https://thebartonplumbing.com.au',
    address: { line1: '97 South Road', suburb: 'Thebarton', postcode: '5031', lat: -34.9176, lng: 138.5718 },
    hours: [[WEEKDAYS, '07:00', '17:00'], [[6], '08:00', '12:00']],
    links: [{ kind: 'facebook', url: 'https://www.facebook.com/thebartonplumbinggas' }],
    images: ['plumber working under sink pipes', 'hot water system installation', 'plumber van tools', 'gas cooktop installation kitchen'],
    reviews: [
      { name: 'Grant H.', rating: 5, text: 'Burst pipe on a Sunday; they were here within the hour and the bill was exactly what they quoted on the phone.', daysAgo: 4 },
      { name: 'Rebecca T.', rating: 5, text: 'Replaced our hot water unit and took the old one away. Tidy, polite, and explained the new system.', daysAgo: 36 },
      { name: 'Sam K.', rating: 4, text: 'Good work on our bathroom. A day later than planned but they kept us informed.', daysAgo: 80 },
    ],
  },
  {
    slug: 'norwood-parade-physio',
    established: 2011,
    name: 'Norwood Parade Physio',
    category: 'health-and-wellness',
    area: 'norwood',
    description:
      'A physiotherapy practice on The Parade with four physiotherapists and a remedial massage therapist. Most patients come with sports injuries, back and neck pain or post-surgical rehabilitation; the practice also runs small-group clinical Pilates classes in a studio at the back. Initial consultations are forty-five minutes and every patient leaves with a written exercise plan. The clinic is registered with all major health funds for on-the-spot claiming, and works with local GPs and the football and netball clubs in the eastern suburbs.',
    services: ['Physiotherapy', 'Remedial massage', 'Pilates'],
    phone: '(08) 5550 1206',
    email: 'appointments@norwoodparadephysio.com.au',
    website: 'https://norwoodparadephysio.com.au',
    address: { line1: '118 The Parade', suburb: 'Norwood', postcode: '5067', lat: -34.9214, lng: 138.6311 },
    hours: [[WEEKDAYS, '07:00', '19:00'], [[6], '08:00', '13:00']],
    links: [{ kind: 'instagram', url: 'https://www.instagram.com/norwoodparadephysio' }, { kind: 'facebook', url: 'https://www.facebook.com/norwoodparadephysio' }],
    images: ['physiotherapist treating patient knee', 'physiotherapy clinic treatment room', 'pilates reformer studio', 'massage therapy treatment'],
    reviews: [
      { name: 'Oliver B.', rating: 5, text: 'Sorted a shoulder problem two other places had not. The exercise plan actually made sense.', daysAgo: 11 },
      { name: 'Nadia R.', rating: 4, text: 'Great Pilates classes, small groups, properly supervised. Booking system could be simpler.', daysAgo: 45 },
    ],
  },
  {
    slug: 'east-end-books',
    established: 1998,
    name: 'East End Books',
    category: 'independent-shops',
    alsoIn: ['shopping'],
    area: 'adelaide',
    description:
      'An independent bookshop that has been on Ebenezer Place, just off Rundle Street, since 1998, on two floors with fiction, Australian writing and a large children’s section downstairs and art, design and secondhand upstairs. The staff read what they sell and the shelf notes are written by hand. There is a small events programme — launches and author talks most Thursday evenings, and a busy fortnight around Writers’ Week — and a loyalty card that is a piece of cardboard. Special orders usually arrive within a week; anything in print can be ordered.',
    services: ['Books', 'Gifts'],
    phone: '(08) 5550 1207',
    email: 'shop@eastendbooks.com.au',
    website: 'https://eastendbooks.com.au',
    address: { line1: '14 Ebenezer Place', suburb: 'Adelaide', postcode: '5000', lat: -34.9221, lng: 138.6093 },
    hours: [[[1, 2, 3, 5], '09:00', '18:00'], [[4], '09:00', '20:00'], [[6], '10:00', '17:00'], [[7], '11:00', '16:00']],
    links: [{ kind: 'instagram', url: 'https://www.instagram.com/eastendbooksadl' }, { kind: 'x', url: 'https://x.com/eastendbooksadl' }],
    images: ['bookshop interior shelves', 'bookstore books display table', 'secondhand bookshop stairs shelves', 'reading books children library'],
    reviews: [
      { name: 'Imogen S.', rating: 5, text: 'The kind of bookshop that recommends something you would never have picked and is right.', daysAgo: 8 },
      { name: 'Raj P.', rating: 5, text: 'Ordered an out-of-print title and they tracked down a secondhand copy in four days.', daysAgo: 52 },
      { name: 'Fiona G.', rating: 4, text: 'Lovely shop, great children’s section. Upstairs is a bit cramped on a Saturday.', daysAgo: 88 },
    ],
  },
  {
    slug: 'mile-end-fish-market',
    established: 1987,
    name: 'Railway Terrace Fish Market',
    category: 'food-and-drink',
    area: 'mile-end',
    description:
      'A fishmonger on Railway Terrace that has been in the same family for three generations. Fish comes in daily from the wholesale auction and direct from boats working the Spencer Gulf and out of Port Lincoln; the counter usually holds twenty or so species — King George whiting, snapper, garfish and Coorong mullet in season — plus Gulf prawns, blue swimmer crabs and oysters from the West Coast. Staff will fillet, scale and pin-bone anything on request, and there is a small range of house-made smoked fish and pâté. Wholesale supply to a dozen local restaurants runs from the same premises before the shop opens.',
    services: ['Fresh seafood', 'Wholesale supply'],
    phone: '(08) 5550 1208',
    email: 'orders@railwayterracefish.com.au',
    website: 'https://railwayterracefish.com.au',
    address: { line1: '42 Railway Terrace', suburb: 'Mile End', postcode: '5031', lat: -34.9243, lng: 138.5812 },
    hours: [[[2, 3, 4, 5], '08:00', '18:00'], [[6], '07:30', '16:00'], [[7], '09:00', '14:00']],
    links: [{ kind: 'facebook', url: 'https://www.facebook.com/railwayterracefishmarket' }, { kind: 'instagram', url: 'https://www.instagram.com/railwayterracefish' }],
    images: ['fish market counter fresh fish ice', 'fishmonger filleting fish', 'oysters on ice seafood', 'prawns seafood display'],
    reviews: [
      { name: 'Angela M.', rating: 5, text: 'Freshest fish in the area by a distance. They filleted a whole snapper for me and gave me the frame for stock.', daysAgo: 5 },
      { name: 'Peter W.', rating: 5, text: 'Family business that knows its fish. The smoked trout is excellent and the whiting is always spot on.', daysAgo: 41 },
      { name: 'Kim L.', rating: 4, text: 'Great range. Gets very busy before Christmas, so order your prawns ahead.', daysAgo: 120 },
    ],
  },
  {
    slug: 'hyde-park-florist',
    established: 2014,
    name: 'Hyde Park Flower Room',
    category: 'shopping',
    area: 'hyde-park',
    description:
      'A florist on King William Road doing everyday bunches, weekly arrangements for offices and restaurants, and weddings. Flowers are bought at the wholesale flower market four mornings a week and the shop favours growers in the Adelaide Hills and on the Adelaide Plains where the season allows. Same-day delivery covers the City of Unley, the city and the inner south for orders placed before midday, and there is a small range of pots, vases and locally made candles. Wedding consultations are by appointment and usually start six months out.',
    services: ['Flowers', 'Wedding arrangements', 'Same-day delivery', 'Gift hampers'],
    phone: '(08) 5550 1209',
    email: 'orders@hydeparkflowerroom.com.au',
    website: 'https://hydeparkflowerroom.com.au',
    address: { line1: '171 King William Road', suburb: 'Hyde Park', postcode: '5061', lat: -34.9546, lng: 138.6004 },
    hours: [[WEEKDAYS, '08:00', '18:00'], [[6], '08:00', '16:00'], [[7], '09:00', '14:00']],
    links: [{ kind: 'instagram', url: 'https://www.instagram.com/hydeparkflowerroom' }, { kind: 'pinterest', url: 'https://www.pinterest.com/hydeparkflowerroom' }, { kind: 'facebook', url: 'https://www.facebook.com/hydeparkflowerroom' }],
    images: ['florist shop flowers buckets', 'wedding bouquet flowers', 'flower arrangement vase', 'peonies roses bouquet'],
    reviews: [
      { name: 'Charlotte E.', rating: 5, text: 'Did the flowers for our wedding and they were exactly what we asked for, on budget, and stunning.', daysAgo: 21 },
      { name: 'Michael A.', rating: 5, text: 'Same-day delivery to my mother in Parkside, arrived by three, she was delighted.', daysAgo: 60 },
      { name: 'Yuki T.', rating: 4, text: 'Beautiful arrangements. A little more expensive than the supermarket buckets but worth it.', daysAgo: 99 },
    ],
  },
  {
    slug: 'prospect-accounting',
    established: 2006,
    name: 'Brandon & Hale Accounting',
    category: 'professional-services',
    area: 'prospect',
    description:
      'A chartered accounting firm on Prospect Road working mainly with small businesses, sole traders and family trusts across the inner north — cafés, tradespeople, medical practices and creative studios. The firm does tax returns, BAS and bookkeeping, sets up cloud accounting, and gives plain-English advice on structure, cash flow and what the numbers mean. Fees are quoted as fixed annual packages rather than by the hour. Two partners and five staff; the partners still do the client meetings.',
    services: ['Accounting', 'Tax returns', 'Bookkeeping', 'Business advice'],
    phone: '(08) 5550 1210',
    email: 'enquiries@brandonhale.com.au',
    website: 'https://brandonhale.com.au',
    address: { line1: 'Suite 3, 172 Prospect Road', suburb: 'Prospect', postcode: '5082', lat: -34.8871, lng: 138.5956 },
    hours: [[WEEKDAYS, '08:30', '17:30']],
    links: [{ kind: 'linkedin', url: 'https://www.linkedin.com/company/brandon-hale-accounting' }],
    images: ['accountant office desk laptop documents', 'business meeting office professionals', 'calculator financial documents', 'modern office reception'],
    reviews: [
      { name: 'Lucy H.', rating: 5, text: 'They took over from a firm that never returned calls. Fixed fee, clear advice, and my BAS is now done a week early.', daysAgo: 18 },
      { name: 'Dev S.', rating: 4, text: 'Helped restructure our café business sensibly. Professional and approachable.', daysAgo: 74 },
    ],
  },
  {
    slug: 'goodwood-bakehouse',
    established: 2015,
    name: 'Half Loaf Bakehouse',
    category: 'food-and-drink',
    alsoIn: ['cafes'],
    area: 'goodwood',
    description:
      'A sourdough bakery on Goodwood Road baking overnight for a 7 am opening. The core range is a country loaf, a seeded rye and a baguette, with croissants, cardamom buns and a fruit danish on the pastry side; specials appear on the board on weekends. Flour is stone-milled from Mid North wheat and the starter is nine years old. There are a few tables out the front, filter coffee from a local roaster, and the bread usually sells out by early afternoon — regulars know to order ahead for Saturdays.',
    services: ['Bread', 'Pastries', 'Coffee', 'Takeaway'],
    phone: '(08) 5550 1211',
    email: 'bread@halfloafbakehouse.com.au',
    website: 'https://halfloafbakehouse.com.au',
    address: { line1: '164 Goodwood Road', suburb: 'Goodwood', postcode: '5034', lat: -34.9512, lng: 138.5874 },
    hours: [[[3, 4, 5], '07:00', '15:00'], [[6, 7], '07:00', '14:00']],
    links: [{ kind: 'instagram', url: 'https://www.instagram.com/halfloafbakehouse' }],
    images: ['sourdough bread loaves bakery', 'croissants pastries bakery display', 'baker kneading dough', 'bakery shop counter bread'],
    reviews: [
      { name: 'Jonas K.', rating: 5, text: 'The seeded rye is the best bread I have had in Adelaide. Get there before ten.', daysAgo: 3 },
      { name: 'Amelia R.', rating: 5, text: 'Cardamom buns are dangerous. Friendly staff and the coffee is good too.', daysAgo: 29 },
      { name: 'Hugo B.', rating: 3, text: 'Excellent bread but sold out by 1 pm twice when I went. Order ahead.', daysAgo: 66 },
    ],
  },
  {
    slug: 'kent-town-dental',
    established: 2001,
    name: 'Kentish Dental',
    category: 'health-and-wellness',
    area: 'kent-town',
    description:
      'A general dental practice on Rundle Street in Kent Town with three dentists and a hygienist, treating families from Kent Town, Norwood, College Park and the city. The practice does check-ups and cleans, fillings, crowns, whitening, and early-morning and Saturday appointments for people who work in town. Digital x-rays and intra-oral cameras mean patients see what the dentist sees. The practice is a preferred provider for several health funds and offers interest-free payment plans for larger treatment.',
    services: ['Dental check-ups', 'Teeth whitening'],
    phone: '(08) 5550 1212',
    email: 'reception@kentishdental.com.au',
    website: 'https://kentishdental.com.au',
    address: { line1: '24 Rundle Street', suburb: 'Kent Town', postcode: '5067', lat: -34.9219, lng: 138.6181 },
    hours: [[[1, 3, 5], '07:30', '17:00'], [[2, 4], '07:30', '19:00'], [[6], '08:00', '13:00']],
    links: [{ kind: 'facebook', url: 'https://www.facebook.com/kentishdental' }],
    images: ['dentist examining patient dental clinic', 'dental clinic treatment room chair', 'dental hygienist cleaning teeth', 'dentist office reception'],
    reviews: [
      { name: 'Karen J.', rating: 5, text: 'Gentle, thorough, and they explain everything before doing it. First dentist I have not dreaded.', daysAgo: 14 },
      { name: 'Liam O.', rating: 4, text: 'Good practice, easy to book early appointments before work. Parking is street only.', daysAgo: 57 },
    ],
  },
  {
    slug: 'torrensville-electrical',
    established: 2013,
    name: 'Torrensville Electrical',
    category: 'home-services',
    area: 'torrensville',
    description:
      'A licensed electrical contractor based on Ashwin Parade doing domestic and light commercial work across the inner west: switchboard upgrades, safety switches, lighting, power points, ceiling fans, EV charger installation and fault finding. All work comes with a certificate of compliance and a written quote before starting. The business also does safety checks for landlords and pre-purchase electrical inspections on the older villas and cottages the western suburbs are full of. Two electricians and an apprentice; most jobs are booked within the week.',
    services: ['Electrical', 'Emergency call-out'],
    phone: '(08) 5550 1213',
    email: 'bookings@torrensvilleelectrical.com.au',
    website: 'https://torrensvilleelectrical.com.au',
    address: { line1: 'Unit 4, 31 Ashwin Parade', suburb: 'Torrensville', postcode: '5031', lat: -34.9189, lng: 138.5647 },
    hours: [[WEEKDAYS, '07:00', '16:30']],
    links: [{ kind: 'facebook', url: 'https://www.facebook.com/torrensvilleelectrical' }, { kind: 'instagram', url: 'https://www.instagram.com/torrensvilleelectrical' }],
    images: ['electrician working switchboard', 'electrician installing light fixture', 'electrical tools wiring', 'electric vehicle charger home installation'],
    reviews: [
      { name: 'Natalie C.', rating: 5, text: 'Upgraded our ancient switchboard in a day. Explained what the safety switches do and left the place spotless.', daysAgo: 7 },
      { name: 'Andrew F.', rating: 5, text: 'Installed an EV charger, quote was accurate, certificate emailed the same day.', daysAgo: 49 },
      { name: 'Zoe P.', rating: 4, text: 'Reliable and fairly priced. Took a couple of days to get a call back initially.', daysAgo: 110 },
    ],
  },
  {
    slug: 'stepney-pizzeria',
    established: 2019,
    name: 'Forno Stepney',
    category: 'restaurants',
    alsoIn: ['food-and-drink'],
    area: 'stepney',
    description:
      'A Neapolitan pizzeria on Magill Road with a wood-fired oven brought over from Naples and a dough that proves for forty-eight hours. The menu is a dozen pizzas, a few antipasti, one pasta of the day and a short list of Italian wines and McLaren Vale and Barossa reds. Tables spill onto the footpath in warm weather. Takeaway and delivery run every night, and the whole room can be booked for functions on Sunday and Monday evenings when it is otherwise closed.',
    services: ['Dine-in', 'Takeaway', 'Delivery', 'Functions'],
    phone: '(08) 5550 1214',
    email: 'ciao@fornostepney.com.au',
    website: 'https://fornostepney.com.au',
    address: { line1: '112 Magill Road', suburb: 'Stepney', postcode: '5069', lat: -34.9116, lng: 138.6291 },
    hours: [[[2, 3, 4], '17:00', '22:00'], [[5, 6], '12:00', '23:00'], [[7], '12:00', '21:00']],
    links: [{ kind: 'instagram', url: 'https://www.instagram.com/fornostepney' }, { kind: 'facebook', url: 'https://www.facebook.com/fornostepney' }],
    images: ['pizza wood fired oven', 'margherita pizza neapolitan', 'pizzaiolo stretching dough', 'pizzeria interior tables'],
    reviews: [
      { name: 'Giulia F.', rating: 5, text: 'Proper Neapolitan crust, leopard-spotted and soft. As close to Naples as Adelaide gets.', daysAgo: 10 },
      { name: 'Ethan M.', rating: 4, text: 'Great pizza and a nice spot on Magill Road. Delivery took a while on a Friday.', daysAgo: 38 },
      { name: 'Olivia N.', rating: 5, text: 'Booked the room for a birthday. They did a set pizza menu for thirty and everyone was fed and happy.', daysAgo: 85 },
    ],
  },
  {
    slug: 'o-connell-street-barbers',
    established: 2017,
    name: "O'Connell Street Barbers",
    category: 'independent-shops',
    alsoIn: ['health-and-wellness'],
    area: 'north-adelaide',
    description:
      'A four-chair barbershop on O’Connell Street doing classic cuts, skin fades, beard trims and hot-towel shaves. Walk-ins are welcome and usually seated within twenty minutes; bookings can be made online for a particular barber. The shop keeps a small range of its own pomade and beard oil, made in Adelaide, and there is a record player and a decent coffee from the café next door if you are waiting. Children’s cuts on weekday mornings; the shop is open late on Thursdays.',
    services: ['Haircuts', 'Beard trims'],
    phone: '(08) 5550 1215',
    email: 'hello@oconnellstreetbarbers.com.au',
    website: 'https://oconnellstreetbarbers.com.au',
    address: { line1: "94 O'Connell Street", suburb: 'North Adelaide', postcode: '5006', lat: -34.9061, lng: 138.5953 },
    hours: [[[1, 2, 3, 5], '09:00', '18:00'], [[4], '09:00', '20:00'], [[6], '08:30', '16:00']],
    links: [{ kind: 'instagram', url: 'https://www.instagram.com/oconnellstreetbarbers' }, { kind: 'tiktok', url: 'https://www.tiktok.com/@oconnellstreetbarbers' }],
    images: ['barber shop haircut chair', 'barber trimming beard', 'barbershop interior vintage', 'straight razor shave barber'],
    reviews: [
      { name: 'Jack T.', rating: 5, text: 'Consistently good fades and no upselling. Been going for two years.', daysAgo: 13 },
      { name: 'Noah W.', rating: 4, text: 'Great cut, relaxed atmosphere. Thursday evenings get busy.', daysAgo: 50 },
    ],
  },
  {
    slug: 'grote-street-greengrocer',
    established: 1994,
    name: 'Grote Street Greengrocer',
    category: 'food-and-drink',
    alsoIn: ['shopping'],
    area: 'adelaide',
    description:
      'A greengrocer on Grote Street a few doors from the Central Market, open six days with fruit and vegetables bought each morning at the wholesale produce market and from growers on the Adelaide Plains and in the Adelaide Hills. The range follows the season — Riverland stone fruit in summer, brassicas and citrus in winter — with a good line of herbs, Asian vegetables, eggs and local honey. Boxes can be ordered online for pick-up or delivery within the city, and the shop supplies several nearby cafés.',
    services: ['Fruit and vegetables', 'Wholesale supply', 'Same-day delivery'],
    phone: '(08) 5550 1216',
    email: 'shop@grotestreetgreengrocer.com.au',
    website: 'https://grotestreetgreengrocer.com.au',
    address: { line1: '71 Grote Street', suburb: 'Adelaide', postcode: '5000', lat: -34.9298, lng: 138.5968 },
    hours: [[[2, 4, 5], '07:00', '16:00'], [[3], '07:00', '14:00'], [[6], '06:30', '16:00'], [[7], '09:00', '16:00']],
    links: [{ kind: 'instagram', url: 'https://www.instagram.com/grotestreetgreengrocer' }, { kind: 'facebook', url: 'https://www.facebook.com/grotestreetgreengrocer' }],
    images: ['greengrocer fruit vegetables display shop', 'Adelaide Central Market', 'fresh vegetables market stall', 'apples fruit crates market'],
    reviews: [
      { name: 'Helen G.', rating: 5, text: 'Fresher and cheaper than the supermarket, and they know where everything came from.', daysAgo: 6 },
      { name: 'Vikram R.', rating: 4, text: 'Great produce boxes. Occasionally a substitution I did not want, but always good quality.', daysAgo: 43 },
      { name: 'Bella C.', rating: 5, text: 'Lovely family shop. The Riverland peaches in January were unbelievable.', daysAgo: 230 },
    ],
  },
  {
    slug: 'parkside-yoga-studio',
    established: 2020,
    name: 'Parkside Yoga Studio',
    category: 'health-and-wellness',
    area: 'parkside',
    description:
      'A yoga and Pilates studio on the first floor of a converted shopfront on Glen Osmond Road, with two rooms and a timetable of around forty classes a week — vinyasa, yin, slow flow, mat Pilates and a beginners’ course that starts every six weeks. Early-morning and lunchtime classes are pitched at people who work in the city and along Greenhill Road; evenings and weekends are slower. Mats and props are provided, there are showers, and the first class is free. Memberships are month-to-month with no lock-in.',
    services: ['Yoga classes', 'Pilates'],
    phone: '(08) 5550 1217',
    email: 'hello@parksideyogastudio.com.au',
    website: 'https://parksideyogastudio.com.au',
    address: { line1: 'First floor, 104 Glen Osmond Road', suburb: 'Parkside', postcode: '5063', lat: -34.9433, lng: 138.6171 },
    hours: [[WEEKDAYS, '06:00', '20:30'], [[6, 7], '07:30', '13:00']],
    links: [{ kind: 'instagram', url: 'https://www.instagram.com/parksideyogastudio' }, { kind: 'youtube', url: 'https://www.youtube.com/@parksideyogastudio' }],
    images: ['yoga class studio group', 'yoga studio interior mats', 'pilates mat class', 'yoga pose sunrise'],
    reviews: [
      { name: 'Sarah D.', rating: 5, text: 'The beginners’ course was patient and well structured. I have kept going for a year.', daysAgo: 16 },
      { name: 'Tomás L.', rating: 4, text: 'Good teachers, convenient before work. Lunchtime classes fill up fast.', daysAgo: 62 },
    ],
  },
  {
    slug: 'walkerville-legal',
    established: 2008,
    name: 'Walkerville Legal',
    category: 'professional-services',
    area: 'walkerville',
    description:
      'A small law firm on Walkerville Terrace doing conveyancing, wills and estates, and commercial work for owner-operated businesses. Conveyancing is quoted as a fixed fee that includes searches; wills and powers of attorney are prepared in a single appointment where the paperwork is straightforward. The commercial practice covers leases, shareholder agreements and business sales for cafés, clinics and small agencies around Walkerville, Prospect and the city. Two principals and a paralegal; initial consultations are thirty minutes and free.',
    services: ['Conveyancing', 'Wills and estates', 'Business advice'],
    phone: '(08) 5550 1218',
    email: 'reception@walkervillelegal.com.au',
    website: 'https://walkervillelegal.com.au',
    address: { line1: 'Suite 2, 48 Walkerville Terrace', suburb: 'Walkerville', postcode: '5081', lat: -34.8936, lng: 138.6166 },
    hours: [[WEEKDAYS, '09:00', '17:30']],
    links: [{ kind: 'linkedin', url: 'https://www.linkedin.com/company/walkerville-legal' }],
    images: ['lawyer office desk documents', 'law office meeting room', 'signing contract documents pen', 'modern office building lobby'],
    reviews: [
      { name: 'Margaret O.', rating: 5, text: 'Handled the sale of my unit and the purchase of the next one without a hitch. Fixed fee as promised.', daysAgo: 22 },
      { name: 'Harry N.', rating: 5, text: 'Wills for both of us done in one visit, clearly explained, reasonably priced.', daysAgo: 77 },
      { name: 'Ingrid S.', rating: 4, text: 'Sound advice on our shop lease. Took a while to get the first appointment.', daysAgo: 140 },
    ],
  },
  {
    slug: 'burnside-pet-grooming',
    established: 2016,
    name: 'Burnside Pet Grooming',
    category: 'pets-and-vets',
    area: 'burnside',
    description:
      'A dog and cat grooming salon on Glynburn Road, a short drive from Hazelwood Park. Full grooms, baths, nail trims, de-shedding and hand-stripping for wire-coated breeds, with one groomer per animal from start to finish. Anxious dogs are booked for quiet times and never left in a cage for hours. The salon stocks a small range of natural shampoos and treats, and runs a monthly nail-trim clinic with a local vet. Bookings are online or by phone; Saturdays fill three weeks ahead.',
    services: ['Grooming'],
    phone: '(08) 5550 1219',
    email: 'bookings@burnsidepetgrooming.com.au',
    website: 'https://burnsidepetgrooming.com.au',
    address: { line1: '528 Glynburn Road', suburb: 'Burnside', postcode: '5066', lat: -34.9396, lng: 138.6469 },
    hours: [[[2, 3, 4, 5], '08:30', '17:00'], [[6], '08:30', '15:00']],
    links: [{ kind: 'instagram', url: 'https://www.instagram.com/burnsidepetgrooming' }, { kind: 'facebook', url: 'https://www.facebook.com/burnsidepetgrooming' }],
    images: ['dog grooming salon groomer', 'dog bath grooming', 'groomed poodle dog', 'cat grooming brush'],
    reviews: [
      { name: 'Claire B.', rating: 5, text: 'Our nervous rescue greyhound actually enjoys going. They are patient and gentle.', daysAgo: 9 },
      { name: 'Matt J.', rating: 4, text: 'Good groom, sensible prices. Book well ahead for a Saturday.', daysAgo: 54 },
    ],
  },
  {
    slug: 'maylands-wine-bar',
    established: 2021,
    name: 'Maylands Wine Room',
    category: 'bars',
    alsoIn: ['restaurants'],
    area: 'maylands',
    description:
      'A neighbourhood wine bar on Phillis Street in the small Maylands shopping strip, with forty seats, a list of around a hundred and fifty wines — mostly South Australian and mostly from small producers in the Clare, the Barossa, the Adelaide Hills and McLaren Vale — and twenty by the glass that change weekly. The kitchen does a short menu of snacks and share plates built around a charcoal grill; there is always a cheese board and something for vegetarians. Bottles can be bought to take away at retail prices. Walk-ins are the norm; tables of six or more should book.',
    services: ['Wine list', 'Bar snacks', 'Dine-in'],
    phone: '(08) 5550 1220',
    email: 'hello@maylandswineroom.com.au',
    website: 'https://maylandswineroom.com.au',
    address: { line1: '38 Phillis Street', suburb: 'Maylands', postcode: '5069', lat: -34.9119, lng: 138.6361 },
    hours: [[[3, 4], '17:00', '23:00'], [[5, 6], '16:00', '00:00'], [[7], '15:00', '22:00']],
    links: [{ kind: 'instagram', url: 'https://www.instagram.com/maylandswineroom' }],
    images: ['wine bar interior bottles shelves', 'wine glasses pouring red wine', 'cheese board charcuterie', 'small bar evening candles'],
    reviews: [
      { name: 'Rosie K.', rating: 5, text: 'Exactly what the neighbourhood needed. Staff know the list and pour you something you would not have picked.', daysAgo: 4 },
      { name: 'Will D.', rating: 4, text: 'Great wines by the glass, small but good menu. Loud when full.', daysAgo: 31 },
      { name: 'Anna M.', rating: 5, text: 'Bought two bottles of Clare riesling to take home at shop prices after dinner. Lovely people.', daysAgo: 70 },
    ],
  },
];

/**
 * Detail for the listings that were already in the database with little
 * more than a name. Matched on slug and filled in where a field is empty;
 * nothing an editor has already written is overwritten.
 */
export const SEED_ENRICHMENT: Record<string, Partial<SeedBusiness> & Pick<SeedBusiness, 'description' | 'services' | 'hours' | 'links' | 'images' | 'reviews' | 'established'>> = {
  'runtime-check-cafe': {
    established: 2014,
    description:
      'A daytime café and evening bar on Payneham Road in St Peters, with coffee and breakfast until three and wine, beer and a short list of cocktails from five. The room is long and narrow with a courtyard at the back that catches the afternoon sun. The kitchen does a small menu that runs across both halves of the day — eggs and toasties in the morning, bar snacks and a couple of larger plates at night — and there is a quiz on Tuesday evenings that has run for years.',
    services: ['Coffee', 'Breakfast', 'Cocktails', 'Wine list', 'Bar snacks'],
    phone: '(08) 5550 1101',
    email: 'hello@runtimecheck.com.au',
    website: 'https://runtimecheck.com.au',
    address: { line1: '150 Payneham Road', suburb: 'St Peters', postcode: '5069', lat: -34.9056, lng: 138.6249 },
    hours: [[WEEKDAYS, '07:00', '23:00'], [[6], '08:00', '00:00'], [[7], '08:00', '21:00']],
    links: [{ kind: 'instagram', url: 'https://www.instagram.com/runtimecheckcafe' }, { kind: 'facebook', url: 'https://www.facebook.com/runtimecheckcafe' }],
    images: ['cafe bar interior courtyard', 'coffee cup cafe table', 'cocktail bar evening', 'toastie sandwich cafe'],
    reviews: [
      { name: 'Ellie P.', rating: 4, text: 'Good coffee by day and a surprisingly good negroni by night. The courtyard is the spot.', daysAgo: 17 },
      { name: 'Sean M.', rating: 5, text: 'Tuesday quiz is a St Peters institution. Food is better than it needs to be.', daysAgo: 63 },
    ],
  },
  'beulah-road-bakery': {
    established: 2010,
    description:
      'A corner bakery on Beulah Road in Norwood doing bread, pies and pastries from a wood-fired oven at the back of the shop, with a handful of tables and coffee from an Adelaide roaster. The bread is mostly sourdough — a white, a wholemeal and a fruit loaf on weekends — and the pies change with the season. The bakery supplies a couple of local cafés and takes orders for celebration cakes with a week’s notice. Opens early and usually sells through the pastries by mid-morning.',
    services: ['Bread', 'Pastries', 'Coffee', 'Takeaway', 'Catering'],
    phone: '(08) 5550 1102',
    email: 'orders@beulahroadbakery.com.au',
    website: 'https://beulahroadbakery.com.au',
    address: { line1: '72 Beulah Road', suburb: 'Norwood', postcode: '5067', lat: -34.9196, lng: 138.6341 },
    hours: [[WEEKDAYS, '06:30', '16:00'], [[6, 7], '07:00', '14:00']],
    links: [{ kind: 'instagram', url: 'https://www.instagram.com/beulahroadbakery' }, { kind: 'facebook', url: 'https://www.facebook.com/beulahroadbakery' }],
    images: ['bakery bread display counter', 'meat pie bakery', 'wood fired oven bread baking', 'pastries croissants tray'],
    reviews: [
      { name: 'Georgia W.', rating: 5, text: 'The fruit loaf on a Saturday is the reason I get up. Pies are excellent too.', daysAgo: 8 },
      { name: 'Luca R.', rating: 4, text: 'Reliable, friendly, good bread. Coffee is fine but not the point.', daysAgo: 46 },
      { name: 'Priya S.', rating: 5, text: 'Ordered a birthday cake and it was beautiful and not too sweet.', daysAgo: 91 },
    ],
  },
  'keswick-mobile-mechanics': {
    established: 2017,
    description:
      'A mobile mechanic based in Keswick covering the city, the inner west and the inner south, working from a fully equipped van so the car never has to leave the driveway or the office car park. Logbook services, brakes, batteries, diagnostics and pre-purchase inspections are the bulk of the work; anything needing a hoist is referred to a partner workshop in Mile End. Quotes are given before the job starts and parts are itemised on the invoice. Bookings are usually available within two working days.',
    services: ['Mobile mechanic', 'Emergency call-out'],
    phone: '(08) 5550 1103',
    email: 'bookings@keswickmobilemechanics.com.au',
    website: 'https://keswickmobilemechanics.com.au',
    address: { line1: 'Unit 6, 70 Richmond Road', suburb: 'Keswick', postcode: '5035', lat: -34.9421, lng: 138.5776 },
    hours: [[WEEKDAYS, '07:30', '17:30'], [[6], '08:00', '13:00']],
    links: [{ kind: 'facebook', url: 'https://www.facebook.com/keswickmobilemechanics' }],
    images: ['mechanic working car engine', 'mechanic van tools roadside', 'car brake repair mechanic', 'car diagnostic tool mechanic'],
    reviews: [
      { name: 'Dylan H.', rating: 5, text: 'Serviced my car in the office car park while I worked. Sent photos of the worn brake pads before replacing them.', daysAgo: 11 },
      { name: 'Meg T.', rating: 4, text: 'Flat battery at home, replaced within two hours of calling. Fair price.', daysAgo: 39 },
    ],
  },
};

/**
 * What to look for on Commons for each category the product ships with.
 *
 * Keyed by slug rather than derived from the name: "Shopping" and "Home
 * Services" find nothing useful on their own, and a category is a broad idea
 * that needs a concrete subject before a photo search can answer it. A
 * category that is not listed here falls back to its own name, which is worse
 * but never wrong — and an editor can always choose a different picture.
 */
export const CATEGORY_IMAGE_QUERIES: Record<string, string> = {
  cafes: 'cafe coffee shop counter',
  restaurants: 'restaurant dining room table',
  bars: 'cocktail bar counter',
  'food-and-drink': 'food market produce stall',
  shopping: 'shopping street storefront',
  'independent-shops': 'bookshop interior shelves',
  'pets-and-vets': 'veterinarian dog examination',
  'home-services': 'plumber tools repair',
  'health-and-wellness': 'physiotherapy treatment clinic',
  'professional-services': 'office meeting desk documents',
};
