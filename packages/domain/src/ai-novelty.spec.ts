import { classifyNovelty, locationStopwords, matchesNiche, parseTermList, tokenSimilarity, topicFingerprint, type NoveltyCandidate } from './ai-novelty.js';

const place = locationStopwords('Adelaide, South Australia');
const fp = (title: string) => topicFingerprint(title, place);
const post = (title: string, extra: Partial<NoveltyCandidate> = {}): NoveltyCandidate => ({ kind: 'post', id: title, title, status: 'published', ...fp(title), ...extra });

describe('topic fingerprints (configuration-driven geography)', () => {
  it('ignores order, case, punctuation, plurals, filler words and the configured location', () => {
    expect(fp('The best coffee in Norwood, Adelaide!').intentBasis).toBe(fp('Norwood coffee guide').intentBasis);
    expect(fp('Cafes of Norwood').tokens).toEqual(['cafe', 'norwood']);
    // Geography is configuration: another deployment's location is not stripped.
    expect(topicFingerprint('Melbourne cafes', place).tokens).toContain('melbourne');
    expect(topicFingerprint('Adelaide cafes', locationStopwords('Hobart')).tokens).toContain('adelaide');
  });

  it('keeps years and months apart as the occurrence of an event', () => {
    const a = fp('Adelaide Fringe 2026 guide');
    const b = fp('Adelaide Fringe 2027 guide');
    expect(a.intentBasis).toBe(b.intentBasis);
    expect(a.eventBasis).not.toBe(b.eventBasis);
    expect(fp('Fringe guide').eventBasis).toBeNull();
  });
});

describe('novelty classification (SRS §17 duplicate rules)', () => {
  it('blocks the same topic, the same event and the same slug', () => {
    expect(classifyNovelty(fp('Norwood coffee guide'), [post('Best coffee in Norwood')]).status).toBe('duplicate');
    expect(classifyNovelty(fp('Fringe 2026 guide'), [post('Guide to the Fringe 2026')]).matches[0]).toMatchObject({ reason: 'same_event', verdict: 'duplicate' });
    expect(classifyNovelty({ ...fp('Something new'), slug: 'taken' }, [post('Other', { slug: 'taken' })]).matches[0]).toMatchObject({ reason: 'same_slug' });
  });

  it('sends a different occurrence and uncertain overlap to review, never through', () => {
    expect(classifyNovelty(fp('Fringe 2027 guide'), [post('Fringe 2026 guide')]).matches[0]).toMatchObject({ reason: 'earlier_occurrence', verdict: 'review' });
    expect(classifyNovelty(fp('Norwood coffee and brunch spots'), [post('Norwood coffee roasters')]).status).toBe('review');
  });

  it('treats rejected and cancelled ideas as history to review, not to repeat silently', () => {
    const result = classifyNovelty(fp('Norwood coffee guide'), [{ ...post('Best Norwood coffee'), kind: 'item', status: 'rejected' }]);
    expect(result).toMatchObject({ status: 'review', matches: [{ reason: 'previously_rejected' }] });
  });

  it('clears unrelated topics and bounds the evidence it returns', () => {
    expect(classifyNovelty(fp('Glenelg jetty fishing'), [post('Barossa wineries'), post('Norwood coffee')]).status).toBe('clear');
    const many = Array.from({ length: 30 }, (_, i) => post(`Norwood coffee guide ${i}`, { id: `p${i}`, tokens: ['coffee', 'norwood'] }));
    expect(classifyNovelty(fp('Norwood coffee'), many).matches).toHaveLength(10);
  });

  it('measures overlap symmetrically', () => {
    expect(tokenSimilarity(['a', 'b'], ['b', 'c'])).toEqual({ jaccard: 1 / 3, containment: 0.5, shared: 1 });
  });
});

describe('niche filter (owner policy §7)', () => {
  const include = parseTermList('cafe, festival,\nwinery');
  const exclude = parseTermList('crime');
  it('keeps niche items, drops excluded or unrelated ones, and proposes nothing without terms', () => {
    expect(matchesNiche('New cafe opens on Rundle Street', include, exclude)).toBe(true);
    expect(matchesNiche('Winery festivals this spring', include, exclude)).toBe(true);
    expect(matchesNiche('Cafe owner in crime case', include, exclude)).toBe(false);
    expect(matchesNiche('Celebrity divorce goes viral', include, exclude)).toBe(false);
    expect(matchesNiche('New cafe opens', [], [])).toBe(false);
  });
});
