/**
 * Article generation contract, fact coverage and cost arithmetic (AI SRS
 * §10–11, §19; plan §G steps 6–7, §I). Pure and provider-neutral: no vendor,
 * model or API concept appears here. The worker's provider adapter turns this
 * contract into a request; the database seam stores and settles it.
 */

// ---------------------------------------------------------------------------
// Structured intermediate output (plan §G step 6)
// ---------------------------------------------------------------------------

export const GENERATION_SCHEMA_VERSION = 'article.v1';
export const METADATA_SCHEMA_VERSION = 'metadata.v1';
export const GENERATION_PROMPT_VERSION = 'article-prompt.v1';
export const METADATA_PROMPT_VERSION = 'metadata-prompt.v1';

export const GENERATION_LIMITS = {
  title: 180,
  slug: 160,
  excerpt: 500,
  seoTitle: 180,
  seoDescription: 300,
  seoKeywords: 10,
  keyword: 40,
  sections: 12,
  minSections: 2,
  heading: 120,
  paragraphs: 8,
  paragraph: 1500,
  faqs: 6,
  question: 200,
  answer: 800,
  imageBriefs: 3,
  imageText: 400,
  anchor: 80,
  tags: 5,
} as const;

const str = { type: 'string' } as const;
const strings = { type: 'array', items: str } as const;
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });

/**
 * JSON Schema for a full article. Every property is required and no extra
 * property is allowed, as strict structured output requires; bounds are
 * enforced by `parseGeneratedArticle`, not trusted from the model.
 */
export const ARTICLE_OUTPUT_SCHEMA = obj({
  title: str,
  slug: str,
  excerpt: str,
  seoTitle: str,
  seoDescription: str,
  seoKeywords: strings,
  tagIds: strings,
  sections: { type: 'array', items: obj({ id: str, heading: str, paragraphs: { type: 'array', items: obj({ text: str, claimIds: strings }) } }) },
  faqs: { type: 'array', items: obj({ question: str, answer: str, claimIds: strings }) },
  internalLinks: { type: 'array', items: obj({ postId: str, sectionId: str, anchor: str, reason: str }) },
  imageBriefs: {
    type: 'array',
    items: obj({ placement: { type: 'string', enum: ['featured', 'inline'] }, prompt: str, aspectRatio: { type: 'string', enum: ['16:9', '4:3', '1:1', '3:2'] }, altDraft: str, captionDraft: str }),
  },
});

/** Title, summary and search metadata only (partial regeneration). */
export const METADATA_OUTPUT_SCHEMA = obj({ title: str, excerpt: str, seoTitle: str, seoDescription: str, seoKeywords: strings });

export interface GeneratedParagraph {
  text: string;
  claimIds: string[];
}
export interface GeneratedSection {
  id: string;
  heading: string;
  paragraphs: GeneratedParagraph[];
}
export interface GeneratedFaq {
  question: string;
  answer: string;
  claimIds: string[];
}
export interface GeneratedLink {
  postId: string;
  sectionId: string;
  anchor: string;
  reason: string;
}
export interface GeneratedImageBrief {
  placement: 'featured' | 'inline';
  prompt: string;
  aspectRatio: '16:9' | '4:3' | '1:1' | '3:2';
  altDraft: string;
  captionDraft: string;
}
export interface GeneratedMetadata {
  title: string;
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string[];
}
export interface GeneratedArticle extends GeneratedMetadata {
  slug: string;
  tagIds: string[];
  sections: GeneratedSection[];
  faqs: GeneratedFaq[];
  internalLinks: GeneratedLink[];
  imageBriefs: GeneratedImageBrief[];
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number, min = 1) => typeof v === 'string' && v.trim().length >= min && v.length <= max;
const idList = (v: unknown, max = 20) => Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'string' && /^[a-z0-9]{1,40}$/.test(x));

function metadataProblems(v: Record<string, unknown>): string[] {
  const p: string[] = [];
  if (!text(v.title, GENERATION_LIMITS.title, 3)) p.push('title');
  if (!text(v.excerpt, GENERATION_LIMITS.excerpt, 20)) p.push('excerpt');
  if (!text(v.seoTitle, GENERATION_LIMITS.seoTitle)) p.push('seoTitle');
  if (!text(v.seoDescription, GENERATION_LIMITS.seoDescription)) p.push('seoDescription');
  if (!Array.isArray(v.seoKeywords) || v.seoKeywords.length > GENERATION_LIMITS.seoKeywords || !v.seoKeywords.every((k) => text(k, GENERATION_LIMITS.keyword))) p.push('seoKeywords');
  return p;
}

/** Structural and bound validation of model output; never trusted before this passes. */
export function parseGeneratedMetadata(value: unknown): { ok: true; metadata: GeneratedMetadata } | { ok: false; problems: string[] } {
  if (!isObj(value)) return { ok: false, problems: ['output'] };
  const problems = metadataProblems(value);
  return problems.length > 0 ? { ok: false, problems } : { ok: true, metadata: value as unknown as GeneratedMetadata };
}

export function parseGeneratedArticle(value: unknown): { ok: true; article: GeneratedArticle } | { ok: false; problems: string[] } {
  if (!isObj(value)) return { ok: false, problems: ['output'] };
  const p = metadataProblems(value);
  if (typeof value.slug !== 'string' || value.slug.length > GENERATION_LIMITS.slug || !SLUG.test(value.slug)) p.push('slug');
  if (!idList(value.tagIds, GENERATION_LIMITS.tags)) p.push('tagIds');
  const sections = value.sections;
  if (!Array.isArray(sections) || sections.length < GENERATION_LIMITS.minSections || sections.length > GENERATION_LIMITS.sections) p.push('sections');
  else {
    const ids = new Set<string>();
    for (const s of sections) {
      if (!isObj(s) || typeof s.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(s.id) || ids.has(s.id) || !text(s.heading, GENERATION_LIMITS.heading) || !Array.isArray(s.paragraphs) || s.paragraphs.length === 0 || s.paragraphs.length > GENERATION_LIMITS.paragraphs) {
        p.push('sections');
        break;
      }
      ids.add(s.id);
      if (!s.paragraphs.every((para) => isObj(para) && text(para.text, GENERATION_LIMITS.paragraph) && idList(para.claimIds))) {
        p.push('sections.paragraphs');
        break;
      }
    }
  }
  if (!Array.isArray(value.faqs) || value.faqs.length > GENERATION_LIMITS.faqs || !value.faqs.every((f) => isObj(f) && text(f.question, GENERATION_LIMITS.question) && text(f.answer, GENERATION_LIMITS.answer) && idList(f.claimIds))) p.push('faqs');
  if (!Array.isArray(value.internalLinks) || value.internalLinks.length > 10 || !value.internalLinks.every((l) => isObj(l) && typeof l.postId === 'string' && typeof l.sectionId === 'string' && text(l.anchor, GENERATION_LIMITS.anchor) && typeof l.reason === 'string' && l.reason.length <= 300)) p.push('internalLinks');
  if (
    !Array.isArray(value.imageBriefs) ||
    value.imageBriefs.length > GENERATION_LIMITS.imageBriefs ||
    value.imageBriefs.filter((b) => isObj(b) && b.placement === 'featured').length > 1 ||
    !value.imageBriefs.every((b) => isObj(b) && ['featured', 'inline'].includes(String(b.placement)) && ['16:9', '4:3', '1:1', '3:2'].includes(String(b.aspectRatio)) && text(b.prompt, GENERATION_LIMITS.imageText) && text(b.altDraft, 250) && typeof b.captionDraft === 'string' && b.captionDraft.length <= 300)
  ) {
    p.push('imageBriefs');
  }
  return p.length > 0 ? { ok: false, problems: p } : { ok: true, article: value as unknown as GeneratedArticle };
}

// ---------------------------------------------------------------------------
// Fact coverage (plan §G step 6: "every factual assertion is checked")
// ---------------------------------------------------------------------------

/** A verified, non-excluded claim of the research packet, as generation may cite it. */
export interface CoverageClaim {
  id: string;
  subject: string;
  value: string;
  excerpts: string[];
}

export interface CoverageContext {
  claims: readonly CoverageClaim[];
  /** Names the article may use without a claim: topic, location, taxonomy, related article and evidence titles. */
  names: readonly string[];
}

export interface CoverageViolation {
  field: string;
  token: string;
  reason: 'unsupported_value' | 'unsupported_name' | 'uncited_fact' | 'unknown_claim';
}

const DAYS = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun';
const MONTHS_RE = 'january|february|march|april|may|june|july|august|september|october|november|december';
const VALUE_PATTERNS: RegExp[] = [
  /https?:\/\/[^\s)\]]+/gi,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  /\$\s?\d[\d,]*(?:\.\d+)?/g,
  /\b\d{1,2}(?:[:.]\d{2})?\s?(?:am|pm)\b/gi,
  /\b\d+(?:[.,]\d+)?\s?%/g,
  /\+?\d[\d\s()-]{6,}\d/g,
  new RegExp(`\\b(?:${DAYS})s?\\b`, 'gi'),
  new RegExp(`\\b(?:${MONTHS_RE})\\b`, 'gi'),
  /\b\d[\d:.,]*\b/g,
];
/** Capitalised words that are ordinary language, not claims about a specific place or business. */
const COMMON_NAMES = new Set(
  'I A An The This That These Those It Its You Your We Our They Their There Here What When Where Why How Who Which If For And But Or So Yes No Also Plus Many Most Some Every Each Both All Any Many Visitors Locals Families Guests Readers Parking Tip Tips Note FAQ FAQs Australian Australia Italian Greek Asian English French Japanese Chinese Vietnamese Thai Indian Korean Mexican Spanish European Christmas Easter New Year'.split(' '),
);

const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const digitsOnly = (s: string) => s.replace(/\D/g, '');

/** Values the text asserts: numbers, times, prices, dates, days, contacts, links. */
export function factualValues(input: string): string[] {
  const found = new Set<string>();
  let rest = input;
  for (const pattern of VALUE_PATTERNS) {
    rest = rest.replace(pattern, (match) => {
      found.add(match.trim());
      return ' ';
    });
  }
  return [...found];
}

/**
 * Capitalised name runs: the places, businesses and events a text names. Runs
 * are split at lowercase connecting words ("Example Cafe on The Parade" is two
 * names). A run that starts a sentence loses its first word, which may be
 * ordinary capitalisation ("Call Example Cafe" names "Example Cafe"); a
 * single capitalised word that only starts a sentence is not a name.
 */
export function namePhrases(input: string): string[] {
  const found = new Set<string>();
  const re = /[A-Z][\p{L}'’&-]*(?:\s+[A-Z][\p{L}'’&-]*)*/gu;
  for (const m of input.matchAll(re)) {
    let words = m[0].split(/\s+/);
    const before = input.slice(0, m.index).trimEnd();
    if (before.length === 0 || /[.!?:\n]$/.test(before)) words = words.slice(1);
    if (words.every((w) => COMMON_NAMES.has(w.replace(/(?:[’']s)$/u, '')))) continue;
    const phrase = words.join(' ');
    if (new RegExp(`^(?:${DAYS}|${MONTHS_RE})$`, 'i').test(phrase)) continue;
    found.add(phrase);
  }
  return [...found];
}

function supportedValue(value: string, corpus: string, corpusDigits: string): boolean {
  const v = norm(value);
  if (corpus.includes(v)) return true;
  const d = digitsOnly(value);
  // A phone number or amount written with different spacing is the same value.
  return d.length >= 3 && corpusDigits.includes(d);
}

/**
 * A name run is supported when it can be split, left to right, into known
 * names: "Example Cafe Norwood" is two supported names side by side, while
 * "Joe Bloggs Bakery" has no known part. Every word must be covered.
 */
function nameSupported(run: string, corpus: string): boolean {
  const words = run.split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < words.length) {
    let matched = 0;
    for (let j = words.length; j > i; j -= 1) {
      const segment = norm(words.slice(i, j).join(' '));
      if (new RegExp(`(^|[^\\p{L}\\p{N}])${segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u').test(corpus)) {
        matched = j - i;
        break;
      }
    }
    if (matched === 0) {
      if (COMMON_NAMES.has(words[i]!.replace(/(?:[’']s)$/u, ''))) {
        i += 1;
        continue;
      }
      return false;
    }
    i += matched;
  }
  return true;
}

function corpusOf(parts: readonly string[]) {
  const joined = norm(parts.join(' \n '));
  return { text: joined, digits: parts.map(digitsOnly).join('|') };
}

/**
 * Checks each text unit against evidence. A unit with explicit claim IDs may
 * state only what those claims support; a unit without (title, summary, SEO,
 * headings, link anchors, image drafts) may state only what some verified
 * claim supports. Any factual value or name without support is a violation:
 * the draft then goes to fact review, never to ready-for-review.
 */
export function coverageViolations(units: readonly { field: string; text: string; claimIds?: readonly string[] }[], ctx: CoverageContext): CoverageViolation[] {
  const byId = new Map(ctx.claims.map((c) => [c.id, c]));
  const claimParts = (c: CoverageClaim) => [c.subject, c.value, ...c.excerpts];
  const all = corpusOf(ctx.claims.flatMap(claimParts));
  const names = corpusOf([...ctx.names, ...ctx.claims.flatMap(claimParts)]);
  const violations: CoverageViolation[] = [];
  for (const unit of units) {
    const values = factualValues(unit.text);
    let corpus = all;
    if (unit.claimIds) {
      const cited = unit.claimIds.map((id) => byId.get(id));
      for (const [i, c] of cited.entries()) if (!c) violations.push({ field: unit.field, token: unit.claimIds[i]!, reason: 'unknown_claim' });
      const known = cited.filter((c): c is CoverageClaim => Boolean(c));
      if (values.length > 0 && known.length === 0) {
        violations.push({ field: unit.field, token: values[0]!, reason: 'uncited_fact' });
        continue;
      }
      corpus = corpusOf(known.flatMap(claimParts));
    }
    for (const value of values) if (!supportedValue(value, corpus.text, corpus.digits)) violations.push({ field: unit.field, token: value, reason: 'unsupported_value' });
    for (const name of namePhrases(unit.text)) if (!nameSupported(name, names.text)) violations.push({ field: unit.field, token: name, reason: 'unsupported_name' });
  }
  return violations.slice(0, 100);
}

/** Every text unit of a generated article, with the claims it cites where it cites any. */
export function articleUnits(a: GeneratedArticle): { field: string; text: string; claimIds?: string[] }[] {
  return [
    ...metadataUnits(a),
    ...a.sections.flatMap((s) => [{ field: `sections.${s.id}.heading`, text: s.heading }, ...s.paragraphs.map((p, i) => ({ field: `sections.${s.id}.${i}`, text: p.text, claimIds: p.claimIds }))]),
    ...a.faqs.flatMap((f, i) => [{ field: `faqs.${i}.question`, text: f.question }, { field: `faqs.${i}.answer`, text: f.answer, claimIds: f.claimIds }]),
    ...a.internalLinks.map((l, i) => ({ field: `internalLinks.${i}.anchor`, text: l.anchor })),
    ...a.imageBriefs.flatMap((b, i) => [
      { field: `imageBriefs.${i}.prompt`, text: b.prompt },
      { field: `imageBriefs.${i}.altDraft`, text: b.altDraft },
      { field: `imageBriefs.${i}.captionDraft`, text: b.captionDraft },
    ]),
  ];
}

export function metadataUnits(m: GeneratedMetadata): { field: string; text: string }[] {
  return [
    { field: 'title', text: m.title },
    { field: 'excerpt', text: m.excerpt },
    { field: 'seoTitle', text: m.seoTitle },
    { field: 'seoDescription', text: m.seoDescription },
    ...m.seoKeywords.map((k, i) => ({ field: `seoKeywords.${i}`, text: k })),
  ];
}

// ---------------------------------------------------------------------------
// Rendering onto the existing Post body format (markdown)
// ---------------------------------------------------------------------------

/** Model text is plain text: markdown and HTML control characters are escaped, so only links we add exist. */
export function escapeMarkdown(input: string): string {
  return input.replace(/[\\`*_{}[\]()<>#|!]/g, (c) => `\\${c}`);
}

/**
 * Renders the article body as markdown for the existing editor and sanitiser
 * (which stays the final authority). Internal links are added only for
 * resolved published targets whose anchor text occurs in the named section.
 */
export function renderArticleMarkdown(a: GeneratedArticle, links: readonly { sectionId: string; anchor: string; path: string }[]): { markdown: string; linked: number } {
  const out: string[] = [];
  let linked = 0;
  for (const section of a.sections) {
    out.push(`## ${escapeMarkdown(section.heading)}`, '');
    const pending = links.filter((l) => l.sectionId === section.id);
    for (const paragraph of section.paragraphs) {
      let rendered = escapeMarkdown(paragraph.text);
      for (const link of [...pending]) {
        const anchor = escapeMarkdown(link.anchor);
        const at = rendered.indexOf(anchor);
        if (at < 0) continue;
        rendered = `${rendered.slice(0, at)}[${anchor}](${link.path})${rendered.slice(at + anchor.length)}`;
        pending.splice(pending.indexOf(link), 1);
        linked += 1;
      }
      out.push(rendered, '');
    }
  }
  if (a.faqs.length > 0) {
    out.push('## Frequently asked questions', '');
    for (const faq of a.faqs) out.push(`### ${escapeMarkdown(faq.question)}`, '', escapeMarkdown(faq.answer), '');
  }
  return { markdown: out.join('\n').trim(), linked };
}

// ---------------------------------------------------------------------------
// Cost arithmetic (plan §I): integer micro-units, ceilings, fail closed
// ---------------------------------------------------------------------------

/** Prices per million tokens, in millionths of the billing currency. */
export interface TokenRates {
  inputMicrosPerMTok: number;
  cachedInputMicrosPerMTok: number;
  outputMicrosPerMTok: number;
  /** Above this many input tokens a different price applies; such a call is refused rather than guessed. */
  longContextThresholdTokens: number;
}

export interface TokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

const ceilDiv = (a: number, b: number) => Math.ceil(a / b);
const MTOK = 1_000_000;

/**
 * The most a call can cost. Every token covers at least one byte of UTF-8,
 * so the input's byte length bounds its token count; output is bounded by the
 * request's maximum (which includes reasoning tokens). Null when the call
 * could leave the approved price band: then it must not be made.
 */
export function maxCallCostMicros(rates: TokenRates, inputBytes: number, maxOutputTokens: number): number | null {
  if (!Number.isInteger(inputBytes) || !Number.isInteger(maxOutputTokens) || inputBytes < 0 || maxOutputTokens <= 0) return null;
  if (inputBytes > rates.longContextThresholdTokens) return null;
  return ceilDiv(inputBytes * rates.inputMicrosPerMTok, MTOK) + ceilDiv(maxOutputTokens * rates.outputMicrosPerMTok, MTOK);
}

/** The cost of reported usage, or null when it cannot be priced with these rates (never zero by default). */
export function usageCostMicros(rates: TokenRates, usage: TokenUsage): number | null {
  const valid = [usage.inputTokens, usage.cachedInputTokens, usage.outputTokens].every((n) => Number.isInteger(n) && n >= 0);
  if (!valid || usage.cachedInputTokens > usage.inputTokens || usage.inputTokens > rates.longContextThresholdTokens) return null;
  const uncached = usage.inputTokens - usage.cachedInputTokens;
  return ceilDiv(uncached * rates.inputMicrosPerMTok, MTOK) + ceilDiv(usage.cachedInputTokens * rates.cachedInputMicrosPerMTok, MTOK) + ceilDiv(usage.outputTokens * rates.outputMicrosPerMTok, MTOK);
}

/** Minor currency units (cents) to micro-units. */
export const minorToMicros = (minor: number) => minor * 10_000;

/** The configured-timezone day and month a charge belongs to (caps are business periods). */
export function billingPeriods(at: Date, timeZone: string): { day: string; month: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  return { day, month: day.slice(0, 7) };
}
