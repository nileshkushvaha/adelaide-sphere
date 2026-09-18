/**
 * Research verification policy (AI SRS §9; plan §G; owner pilot policy of
 * 18 September 2026). Pure: the worker's evaluation, the API's claim
 * resolution and the publication guard all apply these exact rules.
 *
 * A claim is only ever as good as the stored evidence behind it: absence of
 * evidence is `unresolved`, never false; disagreement between credible sources
 * is `conflicting` and always needs a person; nothing is inferred.
 */
export const SOURCE_TIERS = ['official_government', 'official_business', 'institutional', 'publication', 'unclassified'] as const;
export type SourceTier = (typeof SOURCE_TIERS)[number];
/** Tiers an administrator can assign in the source registry (unclassified is only ever inferred). */
export const REGISTRY_TIERS = ['official_government', 'official_business', 'institutional', 'publication'] as const;

export const CLAIM_KINDS = [
  'business_identity',
  'address',
  'phone',
  'website',
  'opening_hours',
  'price',
  'availability',
  'event_datetime',
  'event_location',
  'geography',
  'background',
] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

export type Volatility = 'volatile' | 'identity' | 'stable';
const VOLATILITY: Record<ClaimKind, Volatility> = {
  opening_hours: 'volatile',
  price: 'volatile',
  availability: 'volatile',
  event_datetime: 'volatile',
  business_identity: 'identity',
  address: 'identity',
  phone: 'identity',
  website: 'identity',
  event_location: 'identity',
  geography: 'stable',
  background: 'stable',
};
export function claimVolatility(kind: ClaimKind): Volatility {
  return VOLATILITY[kind];
}

/**
 * Maximum evidence age by volatility. The pilot values are the owner-approved
 * ceilings; configuration may only shorten them.
 */
export interface FreshnessPolicy {
  volatileHours: number;
  identityDays: number;
  stableDays: number;
}
export const PILOT_FRESHNESS: FreshnessPolicy = { volatileHours: 24, identityDays: 7, stableDays: 30 };

export function freshnessWindowMs(kind: ClaimKind, policy: FreshnessPolicy = PILOT_FRESHNESS): number {
  const v = claimVolatility(kind);
  const hours = v === 'volatile' ? Math.min(policy.volatileHours, PILOT_FRESHNESS.volatileHours) : v === 'identity' ? Math.min(policy.identityDays, PILOT_FRESHNESS.identityDays) * 24 : Math.min(policy.stableDays, PILOT_FRESHNESS.stableDays) * 24;
  return hours * 3_600_000;
}

/** Sources that can establish a first-party fact on their own (plan §G step 4, owner policy §3). */
export function isPrimaryTier(kind: ClaimKind, tier: SourceTier): boolean {
  if (tier === 'official_business' || tier === 'official_government') return true;
  return tier === 'institutional' && claimVolatility(kind) === 'stable';
}

/** Comparable form of a value: case, spacing and punctuation differences are not disagreements. */
export function normalizeClaimValue(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s,.;]+/g, ' ')
    .trim();
}

export type ClaimStatus = 'verified' | 'unresolved' | 'conflicting' | 'stale' | 'excluded';

export interface ClaimSourceInput {
  evidenceId: string;
  host: string;
  tier: SourceTier;
  fetchedAt: Date;
}

export interface ClaimInput {
  id: string;
  kind: ClaimKind;
  subject: string;
  value: string;
  material: boolean;
  /** An editor excluded it from the article, with a recorded reason. */
  excluded: boolean;
  /** An editor chose this value over conflicting ones, on its evidence. */
  accepted: boolean;
  /** For events: when the occurrence ends (or starts, if no end is known). */
  validUntil: Date | null;
  /** Its kind and subject had a different value in the previous verified packet (change detection). */
  changed?: boolean;
  sources: ClaimSourceInput[];
}

export interface ClaimVerdict {
  status: ClaimStatus;
  reason: string;
  /** Until when a verified claim stays fresh; null otherwise. */
  freshUntil: Date | null;
}

export type PacketStatus = 'verified' | 'needs_fact_review' | 'failed';

const groupKey = (claim: ClaimInput) => `${claim.kind}|${normalizeClaimValue(claim.subject)}`;

export function evaluateClaims(
  claims: readonly ClaimInput[],
  now: Date,
  policy: FreshnessPolicy = PILOT_FRESHNESS,
  evidenceCount = claims.length > 0 ? 1 : 0,
): { verdicts: Map<string, ClaimVerdict>; packet: { status: PacketStatus; reasons: string[]; freshUntil: Date | null } } {
  const verdicts = new Map<string, ClaimVerdict>();
  const live = claims.filter((c) => !c.excluded);
  const byGroup = new Map<string, ClaimInput[]>();
  for (const claim of live) byGroup.set(groupKey(claim), [...(byGroup.get(groupKey(claim)) ?? []), claim]);

  for (const claim of claims) {
    if (claim.excluded) {
      verdicts.set(claim.id, { status: 'excluded', reason: 'Excluded from the article by an editor', freshUntil: null });
      continue;
    }
    const window = freshnessWindowMs(claim.kind, policy);
    const fresh = claim.sources.filter((s) => now.getTime() - s.fetchedAt.getTime() <= window);
    // Freshness is bounded by the newest supporting retrieval that still counts.
    const newest = fresh.length > 0 ? Math.max(...fresh.map((s) => s.fetchedAt.getTime())) : null;
    let freshUntil = newest === null ? null : new Date(newest + window);
    if (claim.validUntil && (!freshUntil || claim.validUntil < freshUntil)) freshUntil = claim.validUntil;

    if (claim.validUntil && claim.validUntil.getTime() <= now.getTime()) {
      verdicts.set(claim.id, { status: 'stale', reason: 'The event date has passed', freshUntil: null });
      continue;
    }
    if (claim.sources.length > 0 && fresh.length === 0) {
      verdicts.set(claim.id, { status: 'stale', reason: 'The evidence is older than this kind of fact allows; refresh it', freshUntil: null });
      continue;
    }
    const credibleValues = new Set(
      (byGroup.get(groupKey(claim)) ?? [])
        .filter((other) => other.sources.some((s) => s.tier !== 'unclassified' && now.getTime() - s.fetchedAt.getTime() <= freshnessWindowMs(other.kind, policy)))
        .map((other) => normalizeClaimValue(other.value)),
    );
    const groupAccepted = (byGroup.get(groupKey(claim)) ?? []).some((c) => c.accepted);
    if (credibleValues.size > 1 && !groupAccepted) {
      verdicts.set(claim.id, { status: 'conflicting', reason: 'Credible sources disagree; an editor must decide on the evidence', freshUntil: null });
      continue;
    }
    if (groupAccepted && !claim.accepted && credibleValues.size > 1) {
      verdicts.set(claim.id, { status: 'excluded', reason: 'An editor accepted a different value on its evidence', freshUntil: null });
      continue;
    }
    if (claim.changed && !claim.accepted) {
      verdicts.set(claim.id, { status: 'unresolved', reason: 'Changed since the last verification; confirm it on the evidence', freshUntil: null });
      continue;
    }
    const primary = fresh.some((s) => isPrimaryTier(claim.kind, s.tier));
    const independentHosts = new Set(fresh.filter((s) => s.tier !== 'unclassified').map((s) => s.host)).size;
    if (primary || independentHosts >= 2) {
      verdicts.set(claim.id, { status: 'verified', reason: primary ? 'Supported by a primary source' : 'Corroborated by independent sources', freshUntil });
      continue;
    }
    verdicts.set(claim.id, {
      status: 'unresolved',
      reason: fresh.length === 0 ? 'No evidence supports this claim' : 'Needs a primary source or independent corroboration',
      freshUntil: null,
    });
  }

  const reasons: string[] = [];
  const material = claims.filter((c) => c.material);
  const verifiedMaterial = material.filter((c) => verdicts.get(c.id)?.status === 'verified');
  const blocking = material.filter((c) => ['unresolved', 'conflicting', 'stale'].includes(verdicts.get(c.id)!.status));
  if (evidenceCount === 0) return { verdicts, packet: { status: 'failed', reasons: ['No source could be retrieved'], freshUntil: null } };
  if (blocking.length > 0) reasons.push(`${blocking.length} material claim${blocking.length === 1 ? '' : 's'} need fact review`);
  if (verifiedMaterial.length === 0) reasons.push('No verified material claim yet: add evidence-backed claims or sources');
  const freshUntil = verifiedMaterial.reduce<Date | null>((min, c) => {
    const until = verdicts.get(c.id)!.freshUntil;
    return until && (!min || until < min) ? until : min;
  }, null);
  return { verdicts, packet: { status: reasons.length === 0 ? 'verified' : 'needs_fact_review', reasons, freshUntil: reasons.length === 0 ? freshUntil : null } };
}
