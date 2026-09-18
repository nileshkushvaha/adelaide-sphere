import { PILOT_FRESHNESS, evaluateClaims, freshnessWindowMs, isPrimaryTier, type ClaimInput, type SourceTier } from './ai-research.js';

const NOW = new Date('2026-09-18T02:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
let n = 0;
const claim = (over: Omit<Partial<ClaimInput>, 'sources'> & { sources?: [string, SourceTier, Date][] } = {}): ClaimInput => {
  const { sources = [['venue.example', 'official_business', hoursAgo(1)]], ...rest } = over;
  n += 1;
  return {
    id: `c${n}`,
    kind: 'opening_hours',
    subject: 'Example Cafe',
    value: 'Mo-Fr 09:00-17:00',
    material: true,
    excluded: false,
    accepted: false,
    validUntil: null,
    ...rest,
    sources: sources.map(([host, tier, fetchedAt], i) => ({ evidenceId: `e${n}-${i}`, host, tier, fetchedAt })),
  };
};
const statusOf = (claims: ClaimInput[]) => {
  const r = evaluateClaims(claims, NOW, PILOT_FRESHNESS, 1);
  return { claims: claims.map((c) => r.verdicts.get(c.id)!.status), packet: r.packet.status, reasons: r.packet.reasons };
};

describe('pilot freshness ceilings (owner policy §5)', () => {
  it('uses 24 h for volatile facts, 7 days for identity, 30 days for background, and never lengthens them', () => {
    expect(freshnessWindowMs('opening_hours')).toBe(24 * 3_600_000);
    expect(freshnessWindowMs('phone')).toBe(7 * 86_400_000);
    expect(freshnessWindowMs('background')).toBe(30 * 86_400_000);
    expect(freshnessWindowMs('price', { volatileHours: 96, identityDays: 30, stableDays: 90 })).toBe(24 * 3_600_000);
    expect(freshnessWindowMs('price', { volatileHours: 6, identityDays: 7, stableDays: 30 })).toBe(6 * 3_600_000);
  });
});

describe('claim verification (SRS §9, plan §G step 5)', () => {
  it('verifies a first-party fact on a fresh official source', () => {
    expect(statusOf([claim()])).toMatchObject({ claims: ['verified'], packet: 'verified' });
  });

  it('needs a primary source or two independent credible sources; a publication alone is unresolved', () => {
    expect(statusOf([claim({ sources: [['news.example', 'publication', hoursAgo(1)]] })]).claims).toEqual(['unresolved']);
    expect(statusOf([claim({ sources: [['news.example', 'publication', hoursAgo(1)], ['guide.example', 'institutional', hoursAgo(2)]] })]).claims).toEqual(['verified']);
    expect(statusOf([claim({ sources: [['a.example', 'unclassified', hoursAgo(1)], ['b.example', 'unclassified', hoursAgo(1)]] })]).claims).toEqual(['unresolved']);
    expect(isPrimaryTier('background', 'institutional')).toBe(true);
    expect(isPrimaryTier('opening_hours', 'institutional')).toBe(false);
  });

  it('treats absence of evidence as unresolved, never false, and needs at least one verified material claim', () => {
    expect(statusOf([claim({ sources: [] })])).toMatchObject({ claims: ['unresolved'], packet: 'needs_fact_review' });
    expect(evaluateClaims([], NOW, PILOT_FRESHNESS, 1).packet).toMatchObject({ status: 'needs_fact_review' });
    expect(evaluateClaims([], NOW, PILOT_FRESHNESS, 0).packet.status).toBe('failed');
  });

  it('always sends credible disagreement to review, even against an official source', () => {
    const r = statusOf([claim(), claim({ value: 'Mo-Su 08:00-18:00', sources: [['news.example', 'publication', hoursAgo(1)]] })]);
    expect(r).toMatchObject({ claims: ['conflicting', 'conflicting'], packet: 'needs_fact_review' });
  });

  it('lets an editor accept one value on its evidence; the rest are recorded as excluded, not deleted', () => {
    const r = statusOf([claim({ accepted: true }), claim({ value: 'Mo-Su 08:00-18:00', sources: [['news.example', 'publication', hoursAgo(1)]] })]);
    expect(r).toMatchObject({ claims: ['verified', 'excluded'], packet: 'verified' });
  });

  it('marks old evidence and past events stale, and changed values unresolved', () => {
    expect(statusOf([claim({ sources: [['venue.example', 'official_business', hoursAgo(30)]] })]).claims).toEqual(['stale']);
    expect(statusOf([claim({ kind: 'phone', value: '08 8000 0000', sources: [['venue.example', 'official_business', hoursAgo(30)]] })]).claims).toEqual(['verified']);
    expect(statusOf([claim({ kind: 'event_datetime', validUntil: hoursAgo(1) })]).claims).toEqual(['stale']);
    expect(statusOf([claim({ changed: true })]).claims).toEqual(['unresolved']);
    expect(statusOf([claim({ changed: true, accepted: true })]).claims).toEqual(['verified']);
  });

  it('never lets an excluded material claim count as verified, and bounds freshness by the earliest expiry', () => {
    expect(statusOf([claim({ excluded: true })])).toMatchObject({ claims: ['excluded'], packet: 'needs_fact_review' });
    const r = evaluateClaims([claim({ sources: [['venue.example', 'official_business', hoursAgo(20)]] }), claim({ kind: 'phone', value: 'x' })], NOW, PILOT_FRESHNESS, 1);
    expect(r.packet.freshUntil).toEqual(new Date(hoursAgo(20).getTime() + 24 * 3_600_000));
  });
});
