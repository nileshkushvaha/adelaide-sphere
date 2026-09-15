/**
 * The service-icon library (SRS BUS 001): every icon a service can carry, with
 * a label for the picker and the words in a service's name that suggest it.
 *
 * One list, read by three things — the admin's picker, the API's validation
 * of a chosen key, and the public page's fallback when nothing was chosen —
 * so the set of icons cannot drift between them. The pictures themselves are
 * not here: each app draws a key with its own icon set.
 */
export type ServiceIconKey =
  | 'coffee' | 'breakfast' | 'lunch' | 'takeaway' | 'catering' | 'dining' | 'delivery' | 'functions' | 'menu'
  | 'cocktails' | 'wine' | 'beer' | 'music' | 'room' | 'snacks'
  | 'vaccination' | 'surgery' | 'dental' | 'grooming' | 'boarding' | 'microchip' | 'pets'
  | 'plumbing' | 'gas' | 'electrical' | 'mechanic' | 'emergency' | 'water' | 'cleaning' | 'painting' | 'building' | 'locks' | 'garden'
  | 'physio' | 'massage' | 'yoga' | 'pilates' | 'whitening' | 'health'
  | 'books' | 'gifts' | 'haircut' | 'records' | 'clothing'
  | 'bread' | 'pastries' | 'seafood' | 'produce' | 'wholesale' | 'cake'
  | 'flowers' | 'wedding'
  | 'accounting' | 'tax' | 'bookkeeping' | 'conveyancing' | 'wills' | 'advice' | 'legal'
  | 'wifi' | 'parking' | 'accessible' | 'kids' | 'outdoor' | 'online' | 'hours' | 'photography' | 'education'
  | 'generic';

/** Subjects in the order they are tried; the first whose words appear wins. */
export const SUBJECTS: [ServiceIconKey, string[]][] = [
  ['wifi', ['wifi', 'wi-fi', 'internet']],
  ['parking', ['parking', 'car park']],
  ['accessible', ['wheelchair', 'accessible', 'accessibility', 'step-free']],
  ['kids', ['kids', 'children', 'child', 'family', 'baby']],
  ['emergency', ['emergency', '24 hour', '24/7', 'after hours', 'call-out', 'callout']],
  ['wholesale', ['wholesale', 'supply', 'bulk']],
  ['delivery', ['delivery', 'deliveries', 'courier']],
  ['takeaway', ['takeaway', 'take away', 'pick-up', 'pickup', 'click and collect']],
  ['catering', ['catering']],
  ['breakfast', ['breakfast', 'brunch', 'eggs']],
  ['lunch', ['lunch', 'sandwich', 'toastie']],
  ['snacks', ['snacks', 'share plates', 'tapas']],
  ['functions', ['function', 'functions', 'events', 'party', 'parties', 'celebration']],
  ['room', ['room hire', 'private room', 'venue']],
  ['menu', ['set menu', 'tasting menu', 'degustation', 'menu']],
  ['dining', ['dine-in', 'dine in', 'dining', 'restaurant', 'table service']],
  ['coffee', ['coffee', 'espresso', 'barista', 'latte']],
  ['cocktails', ['cocktail', 'cocktails', 'spirits', 'gin', 'whisky']],
  ['wine', ['wine', 'wines', 'cellar']],
  ['beer', ['beer', 'beers', 'brewery', 'craft beer', 'tap']],
  ['music', ['music', 'live band', 'dj', 'gigs']],
  ['vaccination', ['vaccination', 'vaccinations', 'vaccine', 'injections']],
  ['surgery', ['surgery', 'surgical', 'operations', 'desexing']],
  // Before dental: "teeth whitening" is whitening, not a check-up.
  ['whitening', ['whitening']],
  ['dental', ['dental', 'dentist', 'teeth', 'tooth', 'orthodontic']],
  ['grooming', ['grooming', 'groomer', 'clipping']],
  ['boarding', ['boarding', 'kennel', 'cattery', 'day care', 'daycare']],
  ['microchip', ['microchip', 'microchipping']],
  ['pets', ['pet', 'pets', 'dog', 'dogs', 'cat', 'cats', 'puppy', 'kitten', 'animal']],
  ['water', ['hot water', 'water heater', 'water system']],
  ['gas', ['gas', 'gas fitting', 'heating', 'heater']],
  ['plumbing', ['plumbing', 'plumber', 'drain', 'drains', 'pipes', 'leak']],
  ['electrical', ['electrical', 'electrician', 'wiring', 'switchboard', 'lighting', 'ev charger']],
  ['mechanic', ['mechanic', 'mechanics', 'car service', 'brakes', 'roadworthy', 'vehicle']],
  ['cleaning', ['cleaning', 'cleaner', 'housekeeping']],
  ['painting', ['painting', 'painter', 'decorating']],
  ['building', ['building', 'builder', 'renovation', 'renovations', 'carpentry', 'carpenter']],
  ['locks', ['lock', 'locks', 'locksmith', 'security']],
  ['garden', ['garden', 'gardening', 'landscaping', 'lawn']],
  ['physio', ['physio', 'physiotherapy', 'rehab', 'rehabilitation', 'sports injury']],
  ['massage', ['massage', 'remedial', 'myotherapy']],
  ['yoga', ['yoga', 'meditation']],
  ['pilates', ['pilates', 'gym', 'fitness', 'training', 'classes']],
  ['health', ['health', 'medical', 'clinic', 'consultation', 'consultations', 'check-up', 'check-ups', 'checkup']],
  ['books', ['book', 'books', 'bookshop', 'reading']],
  ['records', ['vinyl', 'records', 'music shop']],
  ['gifts', ['gift', 'gifts', 'hamper', 'hampers', 'homewares']],
  ['haircut', ['haircut', 'haircuts', 'hair', 'beard', 'shave', 'barber']],
  ['clothing', ['clothing', 'clothes', 'fashion', 'alterations', 'tailoring']],
  ['bread', ['bread', 'sourdough', 'loaf', 'loaves', 'bakery']],
  ['pastries', ['pastry', 'pastries', 'croissant', 'croissants', 'buns']],
  ['cake', ['cake', 'cakes', 'desserts', 'sweets']],
  ['seafood', ['seafood', 'fish', 'oysters', 'prawns']],
  ['produce', ['fruit', 'vegetables', 'produce', 'greengrocer', 'organic']],
  ['flowers', ['flower', 'flowers', 'florist', 'bouquet', 'bouquets', 'plants']],
  ['wedding', ['wedding', 'weddings', 'bridal']],
  ['accounting', ['accounting', 'accountant', 'accounts', 'audit']],
  ['tax', ['tax', 'taxes', 'bas', 'returns']],
  ['bookkeeping', ['bookkeeping', 'payroll', 'invoicing']],
  ['conveyancing', ['conveyancing', 'property', 'settlement', 'leases', 'lease']],
  ['wills', ['will', 'wills', 'estates', 'estate', 'probate', 'power of attorney']],
  ['legal', ['legal', 'lawyer', 'solicitor', 'contracts', 'litigation']],
  ['advice', ['advice', 'consulting', 'strategy', 'planning', 'coaching']],
  ['online', ['online', 'website', 'app', 'digital', 'booking']],
  ['photography', ['photography', 'photographer', 'photos']],
  ['education', ['course', 'courses', 'lesson', 'lessons', 'tuition', 'workshop', 'workshops', 'class']],
  ['outdoor', ['outdoor', 'courtyard', 'terrace', 'rooftop', 'garden seating']],
  ['hours', ['late night', 'open late', 'weekend', 'weekends']],
];

const fold = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** Whether `phrase` occurs in `text` as whole words. */
function hasPhrase(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}(s|es)?($|[^a-z0-9])`).test(text);
}

export function serviceIconKey(name: string): ServiceIconKey {
  const text = ` ${fold(name)} `;
  for (const [key, phrases] of SUBJECTS) {
    if (phrases.some((phrase) => hasPhrase(text, phrase))) return key;
  }
  return 'generic';
}

/** The picker's label for a key: the key itself, said properly. */
const LABELS: Partial<Record<ServiceIconKey, string>> = {
  wifi: 'Wi-Fi', dining: 'Dine-in', menu: 'Set menu', room: 'Function room', snacks: 'Bar snacks', vaccination: 'Vaccinations', microchip: 'Microchipping', pets: 'Pets', water: 'Hot water', physio: 'Physiotherapy', whitening: 'Teeth whitening', records: 'Vinyl records', produce: 'Fruit and vegetables', wills: 'Wills and estates', advice: 'Business advice', kids: 'Children and families', online: 'Online booking', hours: 'Opening late', generic: 'Plain tick',
};

/** Every key with its label, for a picker. */
export const SERVICE_ICON_LIBRARY: { key: ServiceIconKey; label: string }[] = [...SUBJECTS.map(([key]) => key), 'generic' as const].map((key) => ({
  key,
  label: LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1),
}));

export const SERVICE_ICON_KEYS: ServiceIconKey[] = SERVICE_ICON_LIBRARY.map((entry) => entry.key);

export function isServiceIconKey(value: unknown): value is ServiceIconKey {
  return typeof value === 'string' && (SERVICE_ICON_KEYS as string[]).includes(value);
}
