import { brand } from '@/config/theme';

export type StatusTone = 'positive' | 'neutral' | 'progress' | 'attention' | 'critical';
type Tone = StatusTone;

const PALETTE: Record<Tone, { fg: string; bg: string; border: string }> = {
  positive: { fg: brand.success, bg: brand.successSoft, border: brand.successBorder },
  neutral: { fg: brand.textMuted, bg: brand.surfaceMuted, border: brand.border },
  progress: { fg: brand.primary, bg: brand.primarySoft, border: brand.primaryBorder },
  attention: { fg: brand.warning, bg: brand.warningSoft, border: brand.warningBorder },
  critical: { fg: brand.danger, bg: brand.dangerSoft, border: brand.dangerBorder },
};

/** Shared status vocabulary so a state always looks the same wherever it appears. */
const TONES: Record<string, { tone: Tone; label?: string }> = {
  published: { tone: 'positive' },
  active: { tone: 'positive' },
  approved: { tone: 'positive' },
  ready: { tone: 'positive' },
  sent: { tone: 'positive' },
  delivered: { tone: 'positive' },
  providerAccepted: { tone: 'positive', label: 'accepted by provider' },
  suppressed: { tone: 'neutral' },
  succeeded: { tone: 'positive' },
  success: { tone: 'positive', label: 'succeeded' },
  failure: { tone: 'critical', label: 'refused' },
  draft: { tone: 'neutral' },
  inactive: { tone: 'neutral' },
  invited: { tone: 'progress' },
  disabled: { tone: 'neutral' },
  archived: { tone: 'neutral' },
  retired: { tone: 'neutral' },
  closed: { tone: 'neutral' },
  skipped: { tone: 'neutral' },
  optional: { tone: 'neutral' },
  scheduled: { tone: 'progress' },
  // Featured placements (SRS DIR 007). The server's own words, not aliases:
  // "not published" means the listing behind the placement is not public, which
  // is a different problem from the placement having ended.
  live: { tone: 'positive', label: 'live now' },
  ended: { tone: 'neutral' },
  'not-published': { tone: 'attention', label: 'listing not published' },
  new: { tone: 'progress' },
  running: { tone: 'progress' },
  'on schedule': { tone: 'positive' },
  connected: { tone: 'positive' },
  stopped: { tone: 'critical' },
  behind: { tone: 'attention' },
  paused: { tone: 'attention' },
  unreachable: { tone: 'critical' },
  queued: { tone: 'progress' },
  inProgress: { tone: 'progress', label: 'in progress' },
  quarantined: { tone: 'attention', label: 'processing' },
  pending: { tone: 'attention' },
  retrying: { tone: 'attention' },
  open: { tone: 'attention' },
  investigating: { tone: 'attention' },
  resolved: { tone: 'positive' },
  failed: { tone: 'critical' },
  rejected: { tone: 'critical' },
  spam: { tone: 'critical' },
  gone: { tone: 'critical' },
  timedOut: { tone: 'critical', label: 'timed out' },
  // Email delivery (SRS COMM 004): what the provider reported back.
  delayed: { tone: 'attention' },
  bounced: { tone: 'critical' },
  complained: { tone: 'critical', label: 'marked as spam' },
};


/**
 * The tone a state carries, for anything that needs to colour more than the pill
 * — a table row, a left edge. One vocabulary, so a row and its tag can never
 * disagree about what a state means.
 */
export function toneOf(status: string): StatusTone {
  return TONES[status]?.tone ?? 'neutral';
}

export { PALETTE, TONES };
