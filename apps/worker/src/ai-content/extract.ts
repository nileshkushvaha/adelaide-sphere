import { htmlToPlainText, type ClaimKind } from '@adelaide-sphere/domain';

/**
 * Deterministic evidence extraction (AI plan §G steps 3–4). Page content is
 * untrusted data: it is parsed as text and JSON only, never executed, and any
 * instruction it contains is just more text. Claims come only from what a
 * page states in schema.org structured data; nothing is inferred or completed
 * from memory, and a page without structured data yields evidence text but no
 * claims (an editor may then add evidence-backed claims).
 */
export const MAX_TEXT = 20_000;
const MAX_STRUCTURED_BYTES = 50_000;
const MAX_JSONLD_BLOCK = 200_000;
const MAX_CLAIMS = 100;

export interface ExtractedClaim {
  kind: ClaimKind;
  subject: string;
  value: string;
  excerpt: string;
  location: string;
  validUntil: Date | null;
}

export interface ExtractedPage {
  title: string | null;
  sourceDate: Date | null;
  text: string;
  structuredData: Record<string, unknown>[];
  claims: ExtractedClaim[];
}

const decode = (value: string) => htmlToPlainText(value);

function metaContent(html: string, key: string): string | null {
  const re = new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`, 'i');
  const tag = re.exec(html)?.[0];
  const content = tag ? /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(tag) : null;
  return content ? decode(content[1] ?? content[2] ?? '') || null : null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.length > 64) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const BUSINESS_TYPES = /^(LocalBusiness|Organization|Restaurant|CafeOrCoffeeShop|FoodEstablishment|Bakery|BarOrPub|Winery|Brewery|Store|ShoppingCenter|TouristAttraction|Museum|Park|Beach|Zoo|Library|Place|LandmarksOrHistoricalBuildings|MovieTheater|PerformingArtsTheater|StadiumOrArena|SportsActivityLocation|HealthAndBeautyBusiness|ProfessionalService|LodgingBusiness|Hotel|EntertainmentBusiness|CivicStructure|GovernmentOffice|GovernmentOrganization)$/;
const EVENT_TYPES = /(Event|Festival)$/;

const typesOf = (node: Record<string, unknown>): string[] => (Array.isArray(node['@type']) ? node['@type'] : [node['@type']]).filter((t): t is string => typeof t === 'string');
const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.replace(/\s+/g, ' ').trim().slice(0, 500) : null);

function address(value: unknown): string | null {
  if (typeof value === 'string') return str(value);
  if (!value || typeof value !== 'object') return null;
  const a = value as Record<string, unknown>;
  const parts = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].map(str).filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

const DAY = (value: unknown) => (typeof value === 'string' ? value.replace(/^https?:\/\/schema\.org\//, '') : null);
function openingHours(node: Record<string, unknown>): string | null {
  if (typeof node.openingHours === 'string') return str(node.openingHours);
  if (Array.isArray(node.openingHours)) return str(node.openingHours.filter((h) => typeof h === 'string').join('; '));
  const specs = Array.isArray(node.openingHoursSpecification) ? node.openingHoursSpecification : node.openingHoursSpecification ? [node.openingHoursSpecification] : [];
  const lines = specs
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
    .map((s) => {
      const days = (Array.isArray(s.dayOfWeek) ? s.dayOfWeek : [s.dayOfWeek]).map(DAY).filter(Boolean).join(',');
      return days && typeof s.opens === 'string' && typeof s.closes === 'string' ? `${days} ${s.opens}-${s.closes}` : null;
    })
    .filter(Boolean);
  return lines.length > 0 ? str(lines.join('; ')) : null;
}

function offer(node: Record<string, unknown>): Record<string, unknown> | null {
  const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
  return offers && typeof offers === 'object' ? (offers as Record<string, unknown>) : null;
}

function flatten(value: unknown, out: Record<string, unknown>[], depth = 0): void {
  if (depth > 4 || out.length > 50) return;
  if (Array.isArray(value)) for (const v of value) flatten(v, out, depth + 1);
  else if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>;
    if (node['@graph']) flatten(node['@graph'], out, depth + 1);
    if (node['@type']) out.push(node);
  }
}

function claimsFrom(node: Record<string, unknown>): ExtractedClaim[] {
  const types = typesOf(node);
  const name = str(node.name);
  if (!name) return [];
  const claims: ExtractedClaim[] = [];
  const push = (kind: ClaimKind, value: string | null, property: string, validUntil: Date | null = null) => {
    if (!value) return;
    claims.push({ kind, subject: name.slice(0, 200), value, excerpt: `${property}: ${value}`.slice(0, 1000), location: `json-ld ${types[0] ?? 'Thing'}.${property}`, validUntil });
  };
  if (types.some((t) => EVENT_TYPES.test(t))) {
    const start = parseDate(node.startDate);
    const end = parseDate(node.endDate);
    if (start) push('event_datetime', `${String(node.startDate)}${end ? ` to ${String(node.endDate)}` : ''}`, 'startDate', end ?? start);
    const location = node.location && typeof node.location === 'object' ? (node.location as Record<string, unknown>) : null;
    if (location) push('event_location', [str(location.name), address(location.address)].filter(Boolean).join(', ') || null, 'location');
    const o = offer(node);
    if (o && (typeof o.price === 'string' || typeof o.price === 'number')) push('price', `${String(o.price)}${typeof o.priceCurrency === 'string' ? ` ${o.priceCurrency}` : ''}`, 'offers.price');
    const status = DAY(node.eventStatus);
    if (status && status !== 'EventScheduled') push('availability', status, 'eventStatus');
    else if (o && typeof o.availability === 'string') push('availability', DAY(o.availability), 'offers.availability');
    return claims;
  }
  if (types.some((t) => BUSINESS_TYPES.test(t)) || node.address || node.telephone || node.openingHours || node.openingHoursSpecification) {
    push('business_identity', name, 'name');
    push('address', address(node.address), 'address');
    push('phone', str(node.telephone), 'telephone');
    const url = str(node.url);
    if (url && /^https:\/\//i.test(url)) push('website', url, 'url');
    push('opening_hours', openingHours(node), 'openingHours');
    push('price', str(node.priceRange), 'priceRange');
  }
  return claims;
}

export function extractPage(html: string): ExtractedPage {
  const nodes: Record<string, unknown>[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = match[1] ?? '';
    if (raw.length > MAX_JSONLD_BLOCK) continue;
    try {
      flatten(JSON.parse(raw.trim()), nodes);
    } catch {
      // Malformed structured data is ignored, never repaired or guessed at.
    }
  }
  const visible = html.replace(/<(script|style|noscript|template|svg|iframe)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const bodyStart = visible.search(/<body\b/i);
  const text = decode(bodyStart >= 0 ? visible.slice(bodyStart) : visible).slice(0, MAX_TEXT);
  const title = metaContent(html, 'og:title') ?? (decode(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '') || null);
  const sourceDate =
    parseDate(metaContent(html, 'article:modified_time')) ??
    parseDate(metaContent(html, 'article:published_time')) ??
    nodes.map((n) => parseDate(n.dateModified) ?? parseDate(n.datePublished)).find(Boolean) ??
    null;
  const relevant = nodes.filter((n) => claimsFrom(n).length > 0);
  const structuredData: Record<string, unknown>[] = [];
  let bytes = 0;
  for (const node of relevant) {
    const size = JSON.stringify(node).length;
    if (bytes + size > MAX_STRUCTURED_BYTES) break;
    structuredData.push(node);
    bytes += size;
  }
  const claims = relevant.flatMap(claimsFrom).slice(0, MAX_CLAIMS);
  return { title: title?.slice(0, 300) ?? null, sourceDate, text, structuredData, claims };
}

export interface FeedItem {
  title: string;
  link: string;
  publishedAt: Date | null;
}

const tagText = (block: string, tag: string): string | null => {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
  if (!m) return null;
  const raw = (m[1] ?? '').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');
  return decode(raw) || null;
};

/** RSS 2.0 and Atom items: title, link and date only; bounded. */
export function parseFeed(xml: string, max = 50): FeedItem[] {
  const items: FeedItem[] = [];
  for (const match of xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)) {
    if (items.length >= max) break;
    const block = match[0];
    const title = tagText(block, 'title');
    const atomLink = /<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i.exec(block)?.[1];
    const link = tagText(block, 'link') ?? (atomLink ? decode(atomLink) : null);
    const date = parseDate(tagText(block, 'pubDate') ?? tagText(block, 'dc:date') ?? tagText(block, 'updated') ?? tagText(block, 'published'));
    if (title && link) items.push({ title: title.slice(0, 300), link: link.trim(), publishedAt: date });
  }
  return items;
}
