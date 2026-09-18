import {
  billingPeriods,
  coverageViolations,
  factualValues,
  maxCallCostMicros,
  minorToMicros,
  namePhrases,
  parseGeneratedArticle,
  renderArticleMarkdown,
  usageCostMicros,
  articleUnits,
  type CoverageContext,
  type GeneratedArticle,
} from './ai-generation.js';

const ctx: CoverageContext = {
  claims: [
    { id: 'c1', subject: 'Example Cafe', value: 'Mo-Fr 07:00-15:00', excerpts: ['openingHours: Mo-Fr 07:00-15:00'] },
    { id: 'c2', subject: 'Example Cafe', value: '1 Example St, Norwood SA 5067', excerpts: ['address: 1 Example St, Norwood SA 5067'] },
    { id: 'c3', subject: 'Example Cafe', value: '+61 8 8000 0000', excerpts: [] },
  ],
  names: ['Norwood espresso guide', 'Adelaide, South Australia', 'Food guides', 'The Parade'],
};

describe('factual values and names in text', () => {
  it('finds times, prices, numbers, days, contacts and links', () => {
    expect(factualValues('Open Monday to Friday from 7am, coffee costs $4.50, call +61 8 8000 0000 or visit https://cafe.example.org.').sort()).toEqual(
      ['$4.50', '+61 8 8000 0000', '7am', 'Friday', 'Monday', 'https://cafe.example.org.'].sort(),
    );
  });
  it('finds names but not ordinary sentence-initial words', () => {
    expect(namePhrases('Arrive early. The queue at Example Cafe moves fast, and Joe Bloggs Bakery is next door on The Parade.')).toEqual(['Example Cafe', 'Joe Bloggs Bakery', 'The Parade']);
    expect(namePhrases('Call Example Cafe first.')).toEqual(['Example Cafe']);
    expect(namePhrases('Parking is easy. Visitors love it.')).toEqual([]);
  });
});

describe('fact coverage (unsupported additions never reach review as ready)', () => {
  it('accepts cited facts stated exactly as the evidence states them', () => {
    expect(coverageViolations([{ field: 'p', text: 'Example Cafe opens Mo-Fr 07:00-15:00 at 1 Example St, Norwood SA 5067.', claimIds: ['c1', 'c2'] }], ctx)).toEqual([]);
    expect(coverageViolations([{ field: 'p', text: 'Call Example Cafe on +61 8 8000 0000.', claimIds: ['c3'] }], ctx)).toEqual([]);
  });

  it('flags an invented value, a value from an uncited claim, an uncited fact, an unknown claim and an invented name', () => {
    expect(coverageViolations([{ field: 'p', text: 'Example Cafe opens at 6am.', claimIds: ['c1'] }], ctx)).toEqual([{ field: 'p', token: '6am', reason: 'unsupported_value' }]);
    expect(coverageViolations([{ field: 'p', text: 'Call +61 8 8000 0000.', claimIds: ['c1'] }], ctx)[0]).toMatchObject({ reason: 'unsupported_value' });
    expect(coverageViolations([{ field: 'p', text: 'It has 40 seats.', claimIds: [] }], ctx)[0]).toMatchObject({ reason: 'uncited_fact', token: '40' });
    expect(coverageViolations([{ field: 'p', text: 'Nice place.', claimIds: ['zz'] }], ctx)[0]).toMatchObject({ reason: 'unknown_claim' });
    expect(coverageViolations([{ field: 'p', text: 'Next door, Joe Bloggs Bakery sells pies.', claimIds: ['c1'] }], ctx)[0]).toMatchObject({ reason: 'unsupported_name', token: 'Joe Bloggs Bakery' });
  });

  it('checks titles, summaries and SEO against the whole verified packet', () => {
    expect(coverageViolations([{ field: 'title', text: 'Example Cafe on The Parade: open Mo-Fr 07:00-15:00' }], ctx)).toEqual([]);
    expect(coverageViolations([{ field: 'seoDescription', text: 'Rated 4.8 stars by locals' }], ctx)[0]).toMatchObject({ field: 'seoDescription', token: '4.8' });
  });

  it('supports a run made of known names side by side, but not a run with an unknown part', () => {
    expect(coverageViolations([{ field: 'seoTitle', text: 'Example Cafe Norwood' }], ctx)).toEqual([]);
    expect(coverageViolations([{ field: 'seoTitle', text: 'Example Cafe Glenelg' }], ctx)[0]).toMatchObject({ reason: 'unsupported_name' });
  });

  it('allows advice without facts and without citations', () => {
    expect(coverageViolations([{ field: 'p', text: 'Arrive early on weekends and bring a keep cup.' }], ctx)).toEqual([]);
  });
});

const article: GeneratedArticle = {
  title: 'Example Cafe in Norwood',
  slug: 'example-cafe-norwood',
  excerpt: 'Where to find Example Cafe and when it is open, from its own site.',
  seoTitle: 'Example Cafe Norwood',
  seoDescription: 'Example Cafe opening hours and address.',
  seoKeywords: ['norwood cafe'],
  tagIds: [],
  sections: [
    { id: 'hours', heading: 'When to go', paragraphs: [{ text: 'Example Cafe opens Mo-Fr 07:00-15:00. See our guide to espresso.', claimIds: ['c1'] }] },
    { id: 'where', heading: 'Finding it', paragraphs: [{ text: 'It is at 1 Example St, Norwood SA 5067 <script>x</script> [evil](https://evil.example).', claimIds: ['c2'] }] },
  ],
  faqs: [{ question: 'Is it open on weekends?', answer: 'The cafe lists weekday hours only.', claimIds: [] }],
  internalLinks: [{ postId: 'p1', sectionId: 'hours', anchor: 'guide to espresso', reason: 'related' }],
  imageBriefs: [{ placement: 'featured', prompt: 'An illustrative cafe counter scene, not a real venue', aspectRatio: '16:9', altDraft: 'Illustration of a cafe counter', captionDraft: '' }],
};

describe('generated article validation and rendering', () => {
  it('accepts a bounded article and rejects malformed ones', () => {
    expect(parseGeneratedArticle(article)).toMatchObject({ ok: true });
    expect(parseGeneratedArticle({ ...article, slug: 'Bad Slug' })).toMatchObject({ ok: false, problems: ['slug'] });
    expect(parseGeneratedArticle({ ...article, sections: [article.sections[0]] })).toMatchObject({ ok: false, problems: ['sections'] });
    expect(parseGeneratedArticle({ ...article, imageBriefs: [article.imageBriefs[0], article.imageBriefs[0]] })).toMatchObject({ ok: false, problems: ['imageBriefs'] });
    expect(parseGeneratedArticle(null)).toMatchObject({ ok: false });
  });

  it('covers every text unit of an article, including links and image drafts', () => {
    const fields = articleUnits(article).map((u) => u.field);
    expect(fields).toEqual(expect.arrayContaining(['title', 'excerpt', 'seoTitle', 'seoDescription', 'seoKeywords.0', 'sections.hours.heading', 'sections.hours.0', 'faqs.0.answer', 'internalLinks.0.anchor', 'imageBriefs.0.altDraft']));
  });

  it('renders onto markdown with only our own links; model markup is escaped', () => {
    const { markdown, linked } = renderArticleMarkdown(article, [{ sectionId: 'hours', anchor: 'guide to espresso', path: '/blog/espresso-guide' }]);
    expect(linked).toBe(1);
    expect(markdown).toContain('[guide to espresso](/blog/espresso-guide)');
    expect(markdown).toContain('\\<script\\>');
    expect(markdown).toContain('\\[evil\\]\\(https://evil.example\\)');
    expect(markdown).toContain('## Frequently asked questions');
  });
});

describe('cost arithmetic (integer micro-units, fail closed)', () => {
  const terra = { inputMicrosPerMTok: 2_000_000, cachedInputMicrosPerMTok: 200_000, outputMicrosPerMTok: 12_000_000, longContextThresholdTokens: 272_000 };
  it('bounds a call by input bytes and the output cap, and refuses the long-context band', () => {
    expect(maxCallCostMicros(terra, 30_000, 8_000)).toBe(60_000 + 96_000);
    expect(maxCallCostMicros(terra, 300_000, 8_000)).toBeNull();
    expect(maxCallCostMicros(terra, 10, 0)).toBeNull();
  });
  it('prices reported usage with cached input, rounding up, and never prices the unpriceable as zero', () => {
    expect(usageCostMicros(terra, { inputTokens: 10_000, cachedInputTokens: 2_000, outputTokens: 3_000 })).toBe(16_000 + 400 + 36_000);
    expect(usageCostMicros(terra, { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 })).toBe(2 + 12);
    expect(usageCostMicros(terra, { inputTokens: 5, cachedInputTokens: 9, outputTokens: 1 })).toBeNull();
    expect(usageCostMicros(terra, { inputTokens: 300_000, cachedInputTokens: 0, outputTokens: 1 })).toBeNull();
  });
  it('converts owner caps and dates charges to the configured timezone', () => {
    expect(minorToMicros(50)).toBe(500_000);
    expect(billingPeriods(new Date('2026-09-30T15:00:00Z'), 'Australia/Adelaide')).toEqual({ day: '2026-10-01', month: '2026-10' });
    expect(billingPeriods(new Date('2026-09-30T15:00:00Z'), 'UTC')).toEqual({ day: '2026-09-30', month: '2026-09' });
  });
});
