/**
 * Fills the search appearance of every public record in a demonstration
 * database (SRS SEO 001): businesses, directory categories, local areas,
 * articles, the policy pages and the route settings for Home, Businesses, Blog,
 * FAQs, About and Contact.
 *
 * Only empty fields are written — anything an editor has typed is left alone —
 * and every value is composed from the record's own data: its name, category,
 * area, description and photographs. Nothing states a number, a rating or a
 * claim the record does not make, because stored metadata is not recounted
 * and a figure written today would be wrong tomorrow.
 *
 * Local areas had no photograph and no introduction, which also kept their
 * landing pages out of the index (`landingRobots`). Each gets a licensed
 * Wikimedia Commons photograph of the suburb, chosen by exact file name and
 * processed by the worker, and a short factual introduction.
 *
 *   pnpm --filter api exec tsx --env-file=.env scripts/seed-search-appearance.ts
 *
 * Blog categories are included since they gained search appearance: each
 * takes the cover of one of its own published articles as its share image.
 *
 * The worker must be running (`pnpm dev:worker`) for the area photographs.
 */
import { Redis } from 'ioredis';
import { SEO_ROUTES } from '@adelaide-sphere/domain';
import { DEFAULT_SEO_SETTINGS, EMPTY_ROUTE_SEO, SEO_SETTINGS_KEY, validateSeoSettings, type RouteSeo } from '../src/settings/seo-settings.js';
import { databaseName, db, resolveCommonsFile, uploadImage, waitUntilReady } from './seed-commons.js';

const SITE = 'Adelaide Sphere';
const TITLE_MAX = 60;
const DESCRIPTION_MAX = 160;
const KEYWORDS_MAX = 255;

/** Plain text cut at a word boundary, never mid-word. */
function clip(text: string, max: number): string {
  const plain = text.replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.–—-]+$/, '')}…`;
}

/** The first sentence, or as much of the text as fits. */
function firstSentence(text: string, max: number): string {
  const plain = text.replace(/\s+/g, ' ').trim();
  const sentence = plain.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? plain;
  return clip(sentence, max);
}

/** The first title that fits, else the last clipped. */
function fitTitle(...candidates: string[]): string {
  return candidates.find((candidate) => candidate.length <= TITLE_MAX) ?? clip(candidates.at(-1)!, TITLE_MAX);
}

/** Comma-separated, de-duplicated case-insensitively, within the column limit. */
function keywords(values: (string | null | undefined)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const word = (raw ?? '').replace(/\s+/g, ' ').trim();
    if (!word || seen.has(word.toLowerCase())) continue;
    if ([...out, word].join(', ').length > KEYWORDS_MAX) break;
    seen.add(word.toLowerCase());
    out.push(word);
  }
  return out.join(', ');
}

const lower = (value: string) => value.charAt(0).toLowerCase() + value.slice(1);

/** "Norwood, Adelaide", but "North Adelaide" and "Adelaide" as they are. */
const place = (area: string) => (/adelaide/i.test(area) ? area : `${area}, Adelaide`);

// ---- local areas: introduction and photograph -------------------------------

/**
 * Established, verifiable facts about each suburb only — landmarks and
 * shopping streets that are there today — so the introduction is true without
 * anyone having to vouch for it.
 */
const AREA_INTROS: Record<string, string> = {
  adelaide:
    'The Adelaide city centre is laid out on a grid around Victoria Square and surrounded by the Park Lands, taking in Rundle Mall, the East End around Rundle Street, the Central Market and the cultural institutions of North Terrace.',
  'north-adelaide':
    'North Adelaide sits across the River Torrens from the city centre, with heritage streets of bluestone villas and terraces, the cafés and shops of O’Connell Street, and the Park Lands on every side.',
  norwood:
    'Norwood, east of the city, is centred on The Parade, a long main street of cafés, restaurants and shops, with Norwood Oval a short walk away.',
  unley:
    'Unley is an inner southern suburb along Unley Road, a main street of shops and cafés, with the City of Unley civic centre and older homes on the tree-lined side streets.',
  prospect:
    'Prospect lies north of the city centre, with the shops, cafés and eateries of Prospect Road and residential streets of villas and bungalows either side.',
  walkerville:
    'Walkerville is a small residential suburb north-east of the city near the River Torrens, with heritage homes, St Andrew’s Anglican Church and the Walkerville Terrace shops.',
  thebarton:
    'Thebarton, west of the city centre across the Park Lands, mixes older houses with small shops and businesses along West Thebarton Road, with the River Torrens to the north.',
  'kent-town':
    'Kent Town sits on the eastern edge of the city beside the Park Lands, home to Prince Alfred College, offices and apartments, and a short walk from Rundle Street.',
  parkside:
    'Parkside is a residential suburb south-east of the city, bordering the Park Lands along Greenhill Road, with streets of cottages and villas.',
  'mile-end':
    'Mile End lies west of the city along Henley Beach Road, with a mix of houses and businesses and the former Thomas Hardy & Sons wine cellars.',
  stepney:
    'Stepney is a small suburb east of the city along Payneham Road and Magill Road, with Holy Name Catholic Church, local shops and The Avenues shopping centre.',
  goodwood:
    'Goodwood is an inner southern suburb along Goodwood Road, home to the Art Deco Capri Theatre and a strip of shops and cafés.',
  'st-peters':
    'St Peters is a leafy residential suburb north-east of the city, known for its wide avenues of heritage homes, St Peters Town Hall and the River Torrens Linear Park.',
  wayville:
    'Wayville sits just south of the city centre beside the Park Lands and is home to the Adelaide Showground and quiet residential streets.',
  glenside:
    'Glenside is a suburb south-east of the city, home to the Burnside Village shopping centre and to the Adelaide Studios on the grounds of the former Glenside Hospital.',
  kensington:
    'Kensington, east of the city, is one of Adelaide’s older villages, with historic buildings at the corner of High Street and Bridge Street and the Pioneer Park reserve.',
};

/**
 * Photographs of each suburb, by exact Commons file name, checked by hand
 * against the file's own description. `resolveCommonsFile` refuses any file
 * whose licence is not attribution-only or public domain. Two areas use a
 * photograph the project already holds.
 */
const AREA_PHOTOS: Record<string, { file?: string; existingSourceName?: string; alt: string }> = {
  adelaide: { existingSourceName: 'first-timers-guide-to-the-east-end.jpg', alt: 'A street in Adelaide’s East End, in the city centre' },
  norwood: { existingSourceName: 'the-parade-after-dark.jpg', alt: 'The Parade, Norwood, in the evening' },
  'north-adelaide': { file: "File:O'Connell Street in North Adelaide, South Australia (028A1099).jpg", alt: 'Shops and buildings along O’Connell Street, North Adelaide' },
  prospect: { file: 'File:Prospect Rd N from Victoria.jpg', alt: 'Prospect Road, looking north from Victoria Street, Prospect' },
  walkerville: { file: "File:St. Andrew's Anglican Church in Walkerville, Adelaide.jpg", alt: 'St Andrew’s Anglican Church, Walkerville' },
  thebarton: { file: 'File:Thebarton shops WT Road.jpg', alt: 'Small shops along West Thebarton Road, Thebarton' },
  'kent-town': { file: 'File:OIC alfred college from dequetteville.jpg', alt: 'Prince Alfred College seen from Dequetteville Terrace, Kent Town' },
  parkside: { file: 'File:OIC parkside street 3.jpg', alt: 'Houses along Fuller Street, Parkside' },
  'mile-end': { file: 'File:Thomas Hardy & Sons Wine Cellars, Mile End.JPG', alt: 'The former Thomas Hardy & Sons wine cellars on Henley Beach Road, Mile End' },
  stepney: { file: 'File:OIC stepney holy name catholic 1.jpg', alt: 'Holy Name Catholic Church on Payneham Road, Stepney' },
  goodwood: { file: 'File:Capri Theatre, Goodwood.JPG', alt: 'The Art Deco Capri Theatre on Goodwood Road, Goodwood' },
};

async function areaPhotos(): Promise<Map<string, string>> {
  const bySlug = new Map<string, string>();
  const pending: string[] = [];
  for (const [slug, photo] of Object.entries(AREA_PHOTOS)) {
    // Already uploaded by an earlier run: no need to ask Commons again.
    const uploaded = await db.mediaAsset.findFirst({ where: { sourceName: `area-${slug}.jpg`, status: 'ready' }, select: { id: true } });
    if (uploaded) {
      bySlug.set(slug, uploaded.id);
      continue;
    }
    if (photo.existingSourceName) {
      const asset = await db.mediaAsset.findFirst({ where: { sourceName: photo.existingSourceName, status: 'ready' }, select: { id: true } });
      if (asset) bySlug.set(slug, asset.id);
      else console.log(`  ${slug}: ${photo.existingSourceName} is not in the library; skipped`);
      continue;
    }
    try {
      const file = await resolveCommonsFile(photo.file!, 1600);
      const credit = file.artist ? `${file.artist} via Wikimedia Commons` : 'Wikimedia Commons';
      const id = await uploadImage({ file, sourceName: `area-${slug}.jpg`, alt: photo.alt, credit, rightsNote: `${file.licence} — ${file.pageUrl}` });
      bySlug.set(slug, id);
      pending.push(id);
    } catch (error) {
      console.log(`  ${slug}: ${(error as Error).message}; left without a photograph`);
    }
  }
  if (pending.length > 0) await waitUntilReady(pending);
  return bySlug;
}

// ---- runners ---------------------------------------------------------------

async function seedAreas(photos: Map<string, string>) {
  const areas = await db.localArea.findMany({
    include: { businesses: { where: { status: 'published' }, select: { primaryCategory: { select: { name: true } } } } },
  });
  let written = 0;
  for (const area of areas) {
    const counts = new Map<string, number>();
    for (const business of area.businesses) counts.set(business.primaryCategory.name, (counts.get(business.primaryCategory.name) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([name]) => name);
    const photo = photos.get(area.slug) ?? null;
    const intro = AREA_INTROS[area.slug] ?? null;
    const lead = top.length > 0 ? `${top.map(lower).join(', ')} and more` : 'local services';
    const data = {
      ...(area.editorialIntro ? {} : intro ? { editorialIntro: intro } : {}),
      ...(area.imageMediaId || !photo ? {} : { imageMediaId: photo }),
      ...(area.ogImageMediaId || !(area.imageMediaId ?? photo) ? {} : { ogImageMediaId: area.imageMediaId ?? photo }),
      ...(area.seoTitle ? {} : { seoTitle: fitTitle(`Businesses in ${place(area.name)}`, `${area.name} businesses`) }),
      ...(area.seoDescription ? {} : { seoDescription: clip(`Local businesses in ${place(area.name)}: ${lead}, with contact details, opening hours and locations.`, DESCRIPTION_MAX) }),
      ...(area.seoKeywords
        ? {}
        : { seoKeywords: keywords([`${area.name} businesses`, ...(/adelaide/i.test(area.name) ? [] : [`${area.name} Adelaide`]), `businesses in ${area.name}`, ...top.map((name) => `${name} ${area.name}`), `${area.name} SA`, 'inner Adelaide']) }),
    };
    if (Object.keys(data).length === 0) continue;
    await db.localArea.update({ where: { id: area.id }, data: { ...data, version: { increment: 1 } } });
    written += 1;
  }
  console.log(`  local areas: ${written} of ${areas.length} updated`);
}

/**
 * The categories that shipped without a description. A landing page without
 * one is `noindex` (`landingRobots`), so these are written like the others:
 * what the category holds, with no claim about any listing in it.
 */
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  cafes: 'Cafés for coffee, breakfast and lunch, from laneway espresso bars to neighbourhood all-day kitchens.',
  restaurants: 'Restaurants for lunch and dinner across the city, from casual local favourites to places for a longer meal.',
  bars: 'Bars, wine bars and pubs for an after-work drink, a cocktail or a late night out.',
  'independent-shops': 'Independently owned shops — bookshops, gift and homewares stores, fashion and specialty retailers.',
};

async function seedCategories() {
  const categories = await db.category.findMany({
    include: {
      parent: { select: { name: true } },
      primaryOf: { where: { status: 'published' }, select: { localArea: { select: { name: true } } } },
    },
  });
  let written = 0;
  for (const category of categories) {
    const areas = new Map<string, number>();
    for (const business of category.primaryOf) areas.set(business.localArea.name, (areas.get(business.localArea.name) ?? 0) + 1);
    const topAreas = [...areas.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([name]) => name);
    const where = topAreas.length > 0 ? ` in ${topAreas.join(', ')} and across inner Adelaide` : ' across inner Adelaide';
    const composed = category.description
      ? `${firstSentence(category.description, 110)} Find listings${where}.`
      : `Find ${lower(category.name)}${where}, with contact details, opening hours and locations.`;
    const data = {
      ...(category.description || !CATEGORY_DESCRIPTIONS[category.slug] ? {} : { description: CATEGORY_DESCRIPTIONS[category.slug] }),
      ...(category.seoTitle ? {} : { seoTitle: fitTitle(`${category.name} in Adelaide`, category.name) }),
      ...(category.seoDescription ? {} : { seoDescription: clip(composed, DESCRIPTION_MAX) }),
      ...(category.seoKeywords
        ? {}
        : { seoKeywords: keywords([category.name, `${category.name} Adelaide`, category.parent?.name, ...topAreas.map((area) => `${category.name} ${area}`), `${lower(category.name)} in Adelaide city centre`]) }),
      ...(category.ogImageMediaId || !category.imageMediaId ? {} : { ogImageMediaId: category.imageMediaId }),
    };
    if (Object.keys(data).length === 0) continue;
    await db.category.update({ where: { id: category.id }, data: { ...data, version: { increment: 1 } } });
    written += 1;
  }
  console.log(`  categories: ${written} of ${categories.length} updated`);
}

async function seedBusinesses() {
  const businesses = await db.business.findMany({
    include: {
      primaryCategory: { select: { name: true } },
      localArea: { select: { name: true } },
      categories: { select: { category: { select: { name: true } } } },
      services: { select: { service: { select: { name: true } } } },
      media: { where: { media: { status: 'ready' } }, orderBy: { sortOrder: 'asc' }, select: { mediaId: true }, take: 1 },
    },
  });
  let written = 0;
  for (const business of businesses) {
    const category = business.primaryCategory.name;
    const area = business.localArea.name;
    // The listing's own opening sentence with where it is, when both fit; a
    // sentence too long for that leads with the place instead, so the cut (if
    // any) falls at the end rather than in the middle of the description.
    const sentence = firstSentence(business.description, DESCRIPTION_MAX);
    const placed = `${sentence} ${category} in ${place(area)}.`;
    const description = !sentence.endsWith('…') && placed.length <= DESCRIPTION_MAX ? placed : clip(`${category} in ${place(area)}. ${business.description}`, DESCRIPTION_MAX);
    const data = {
      ...(business.seoTitle ? {} : { seoTitle: fitTitle(`${business.name} – ${category} in ${area}`, `${business.name} – ${place(area)}`, `${business.name} – ${area}`, business.name) }),
      ...(business.seoDescription ? {} : { seoDescription: description }),
      ...(business.seoKeywords
        ? {}
        : {
            seoKeywords: keywords([
              business.name,
              `${category} ${area}`,
              `${category} Adelaide`,
              `${business.name} ${area}`,
              area,
              ...business.categories.map((entry) => entry.category.name),
              ...business.services.slice(0, 4).map((entry) => entry.service.name),
            ]),
          }),
      ...(business.ogImageMediaId || !business.media[0] ? {} : { ogImageMediaId: business.media[0].mediaId }),
    };
    if (Object.keys(data).length === 0) continue;
    await db.business.update({ where: { id: business.id }, data: { ...data, version: { increment: 1 } } });
    written += 1;
  }
  console.log(`  businesses: ${written} of ${businesses.length} updated`);
}

async function seedPosts() {
  const posts = await db.post.findMany({ include: { category: { select: { name: true } }, tags: { select: { tag: { select: { name: true } } } } } });
  let written = 0;
  for (const post of posts) {
    const data = {
      ...(post.seoTitle ? {} : { seoTitle: fitTitle(post.title, post.title) }),
      ...(post.seoDescription ? {} : { seoDescription: clip(post.excerpt, DESCRIPTION_MAX) }),
      ...(post.seoKeywords ? {} : { seoKeywords: keywords([...post.tags.map((entry) => entry.tag.name), post.category.name, `${post.category.name} Adelaide`, 'Adelaide guide']) }),
      ...(post.ogImageMediaId || !post.coverMediaId ? {} : { ogImageMediaId: post.coverMediaId }),
    };
    if (Object.keys(data).length === 0) continue;
    await db.post.update({ where: { id: post.id }, data: { ...data, version: { increment: 1 } } });
    written += 1;
  }
  console.log(`  articles: ${written} of ${posts.length} updated`);
}

/**
 * Blog categories, written from the articles each one actually holds. The share
 * image is the cover of one of those articles, by its stored file name.
 */
const BLOG_CATEGORY_SEO: Record<string, { title: string; description: string; keywords: string[]; image: string }> = {
  'city-guides': {
    title: 'Adelaide City Guides: Walks, Gardens & the East End',
    description: 'Walking routes and neighbourhood guides across Adelaide, from the East End laneways to the Botanic Garden and the heritage streets of North Adelaide.',
    keywords: ['Adelaide city guides', 'Adelaide walking routes', 'Adelaide East End', 'Rundle Street', 'Adelaide Botanic Garden', 'North Adelaide walk', 'Adelaide Park Lands'],
    image: 'first-timers-guide-to-the-east-end.jpg',
  },
  'food-and-drink': {
    title: 'Adelaide Food & Drink Guides: Markets & Dining',
    description: 'Where to eat, drink and shop for food in Adelaide, from the stalls of the Adelaide Central Market to the cafés and restaurants of The Parade, Norwood.',
    keywords: ['Adelaide food guide', 'Adelaide dining', 'Adelaide Central Market', 'The Parade Norwood', 'Adelaide markets', 'where to eat in Adelaide'],
    image: 'central-market-without-the-queue.jpg',
  },
  'getting-around': {
    title: 'Getting Around Adelaide: Trams & Transport Tips',
    description: 'Practical guides to getting around Adelaide by tram: the Glenelg line, the free city tram zone and the habits that make public transport simple.',
    keywords: ['getting around Adelaide', 'Adelaide trams', 'Glenelg tram', 'Adelaide free tram', 'Adelaide Metro', 'Adelaide travel tips'],
    image: 'getting-around-adelaide-by-tram.jpg',
  },
};

async function seedBlogCategories() {
  const categories = await db.blogCategory.findMany({ select: { id: true, name: true, slug: true, seoTitle: true, seoDescription: true, seoKeywords: true, ogImageMediaId: true } });
  let written = 0;
  for (const category of categories) {
    const seo = BLOG_CATEGORY_SEO[category.slug];
    if (!seo) {
      console.log(`  blog category ${category.slug}: no copy written for it; left as it is`);
      continue;
    }
    const image = category.ogImageMediaId ? null : await db.mediaAsset.findFirst({ where: { sourceName: seo.image, status: 'ready' }, select: { id: true } });
    const data = {
      ...(category.seoTitle ? {} : { seoTitle: clip(seo.title, TITLE_MAX) }),
      ...(category.seoDescription ? {} : { seoDescription: clip(seo.description, DESCRIPTION_MAX) }),
      ...(category.seoKeywords ? {} : { seoKeywords: keywords(seo.keywords) }),
      ...(image ? { ogImageMediaId: image.id } : {}),
    };
    if (Object.keys(data).length === 0) continue;
    await db.blogCategory.update({ where: { id: category.id }, data: { ...data, version: { increment: 1 } } });
    written += 1;
  }
  console.log(`  blog categories: ${written} of ${categories.length} updated`);
}

const POLICY_SEO: Record<string, { title: string; description: string; keywords: string[] }> = {
  privacy: {
    title: 'Privacy Policy',
    description: `How ${SITE} collects, uses, stores and protects personal information from reviews, comments and enquiries, and how to ask for access or deletion.`,
    keywords: [`${SITE} privacy policy`, 'privacy policy', 'personal information', 'data protection', 'Australian Privacy Principles'],
  },
  terms: {
    title: 'Terms of Use',
    description: `The terms that apply when you use ${SITE}, including listing accuracy, reviews and comments, acceptable use and the limits of our liability.`,
    keywords: [`${SITE} terms of use`, 'terms of use', 'website terms', 'directory terms and conditions'],
  },
  'review-guidelines': {
    title: 'Review Guidelines',
    description: `What makes a review or comment acceptable on ${SITE}, what moderators remove and how to report content that breaks the guidelines.`,
    keywords: [`${SITE} review guidelines`, 'review guidelines', 'review moderation', 'comment guidelines', 'report a review'],
  },
};

async function seedPages(shareImage: string | null) {
  let written = 0;
  for (const [slug, seo] of Object.entries(POLICY_SEO)) {
    const page = await db.staticPage.findUnique({ where: { slug } });
    if (!page) continue;
    const data = {
      ...(page.seoTitle ? {} : { seoTitle: seo.title }),
      ...(page.seoDescription ? {} : { seoDescription: clip(seo.description, DESCRIPTION_MAX) }),
      ...(page.seoKeywords ? {} : { seoKeywords: keywords(seo.keywords) }),
      ...(page.ogImageMediaId || !shareImage ? {} : { ogImageMediaId: shareImage }),
    };
    if (Object.keys(data).length === 0) continue;
    await db.staticPage.update({ where: { id: page.id }, data: { ...data, version: { increment: 1 } } });
    written += 1;
  }
  console.log(`  policy pages: ${written} updated`);
}

/**
 * The routes with no record of their own; the image is the project photograph
 * that best fits each. Titles leave out the site name: the layout's title
 * template appends it to every page, so including it here would repeat it.
 */
const ROUTE_SEO: Record<string, { title: string; description: string; keywords: string[]; image: string }> = {
  home: {
    // The home page title is used as written, without the template, so it carries the name itself.
    title: `${SITE} – Local Businesses & Guides in Adelaide`,
    description: 'An independently edited directory of local businesses across inner Adelaide, with contact details, opening hours, reviews and neighbourhood guides.',
    keywords: [SITE, 'Adelaide business directory', 'local businesses Adelaide', 'Adelaide services', 'inner Adelaide', 'Adelaide guides'],
    image: 'about-hero.jpg',
  },
  directory: {
    title: 'Businesses in Adelaide | Local Directory',
    description: 'Browse published businesses across inner Adelaide by category and local area, with contact details, opening hours and moderated reviews.',
    keywords: ['Adelaide businesses', 'business directory Adelaide', 'local services Adelaide', 'Adelaide shops', 'Adelaide trades'],
    image: 'central-market-without-the-queue.jpg',
  },
  blog: {
    title: 'Adelaide Guides & Local Stories',
    description: 'Guides to Adelaide’s neighbourhoods, markets, main streets and city life, written and checked by the Adelaide Sphere editors.',
    keywords: ['Adelaide blog', 'Adelaide guides', 'things to do in Adelaide', 'Adelaide neighbourhoods', 'Adelaide East End'],
    image: 'first-timers-guide-to-the-east-end.jpg',
  },
  faqs: {
    title: 'Frequently Asked Questions',
    description: 'Answers about adding or correcting a business listing, how reviews are moderated and how to contact the Adelaide Sphere editors.',
    keywords: [`${SITE} FAQ`, 'add a business Adelaide', 'correct a business listing', 'review moderation', 'directory help'],
    image: 'about-editing.jpg',
  },
  about: {
    title: `About ${SITE} – Independent Adelaide Directory`,
    description: `How ${SITE} works: an independently edited guide to Adelaide’s local businesses, where every listing is checked by an editor before it is published.`,
    keywords: [`about ${SITE}`, 'independent business directory', 'Adelaide local directory', 'edited business listings'],
    image: 'about-hero.jpg',
  },
  contact: {
    title: `Contact ${SITE}`,
    description: `Contact the ${SITE} editors to request a business listing, correct listing details, report a review or ask a general question.`,
    keywords: [`contact ${SITE}`, 'request a business listing', 'correct a business listing', 'Adelaide directory contact'],
    image: 'about-city.jpg',
  },
};

async function seedRoutes() {
  const row = await db.setting.findUnique({ where: { group_key: { group: 'website', key: SEO_SETTINGS_KEY } } });
  const stored = row ? validateSeoSettings(row.data).value : structuredClone(DEFAULT_SEO_SETTINGS);
  let filled = 0;
  for (const route of SEO_ROUTES) {
    const seo = ROUTE_SEO[route.key];
    if (!seo) continue;
    const current: RouteSeo = stored.routes[route.key] ?? { ...EMPTY_ROUTE_SEO };
    const image = current.ogImageMediaId ? null : await db.mediaAsset.findFirst({ where: { sourceName: seo.image, status: 'ready' }, select: { id: true } });
    const next: RouteSeo = {
      ...current,
      metaTitle: current.metaTitle ?? clip(seo.title, 70),
      metaDescription: current.metaDescription ?? clip(seo.description, DESCRIPTION_MAX),
      metaKeywords: current.metaKeywords ?? keywords(seo.keywords),
      ogImageMediaId: current.ogImageMediaId ?? image?.id ?? null,
    };
    if (JSON.stringify(next) !== JSON.stringify(current)) filled += 1;
    stored.routes[route.key] = next;
  }
  const { errors, value } = validateSeoSettings(stored);
  if (Object.keys(errors).length > 0) throw new Error(`Route SEO did not validate: ${JSON.stringify(errors)}`);
  const data = JSON.parse(JSON.stringify(value));
  if (row) await db.setting.update({ where: { group_key: { group: 'website', key: SEO_SETTINGS_KEY } }, data: { data, version: { increment: 1 } } });
  else await db.setting.create({ data: { group: 'website', key: SEO_SETTINGS_KEY, data, version: 1 } });
  console.log(`  routes: ${filled} of ${SEO_ROUTES.length} filled`);
}

/** Retires every cached public read, as a publication does, so the API serves the new values at once. */
async function retireApiCache() {
  const url = process.env.REDIS_URL;
  if (!url) return console.log('  REDIS_URL is not set; cached reads expire on their own within five minutes');
  const redis = new Redis(url, { keyPrefix: 'ms:', lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    await redis.incr('cache:public:ns');
    console.log('  API read cache retired');
  } catch {
    console.log('  Redis was unreachable; cached reads expire on their own within five minutes');
  } finally {
    redis.disconnect();
  }
}

async function main() {
  console.log(`Filling search appearance in ${databaseName}\n`);
  console.log('Local area photographs');
  const photos = await areaPhotos();
  console.log('\nRecords');
  await seedAreas(photos);
  await seedCategories();
  await seedBusinesses();
  await seedPosts();
  await seedBlogCategories();
  const skyline = await db.mediaAsset.findFirst({ where: { sourceName: 'about-hero.jpg', status: 'ready' }, select: { id: true } });
  await seedPages(skyline?.id ?? null);
  await seedRoutes();
  await retireApiCache();
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
