/**
 * Pure redirect rules (SRS SEO 004). Sources and targets are always
 * site-relative paths on the single configured origin; nothing here touches the
 * database so the rules can be tested in isolation.
 */

/** Longest path we store; matches the VARCHAR(255) columns. */
export const MAX_PATH_LENGTH = 255;

/** Paths that must never be redirected or become a redirect target. */
const RESERVED_PREFIXES = ['/admin', '/api', '/_next'];

export class RedirectRuleError extends Error {
  constructor(
    readonly field: 'sourcePath' | 'targetPath',
    message: string,
  ) {
    super(message);
    this.name = 'RedirectRuleError';
  }
}

/**
 * Canonical form of a public path: lowercase, single leading slash, no query,
 * no fragment, no duplicate or trailing slash. Returns null when the input is
 * not a site-relative path we are willing to store or match.
 */
export function normalisePath(input: string): string | null {
  const raw = input.trim();
  if (raw === '') return null;
  // Reject absolute URLs, protocol-relative URLs and scheme-like values before
  // any normalisation, so "//evil.example" can never become a target.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//') || raw.startsWith('\\')) return null;
  if (!raw.startsWith('/')) return null;
  const withoutQuery = raw.split(/[?#]/, 1)[0] ?? '';
  const lower = withoutQuery.toLowerCase();
  if (lower.includes('..') || /[\s<>"'`]/.test(lower) || /%2f/i.test(lower)) return null;
  if (!/^[a-z0-9/_.~-]*$/.test(lower)) return null;
  const collapsed = lower.replace(/\/{2,}/g, '/');
  const trimmed = collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : collapsed;
  const path = trimmed === '' ? '/' : trimmed;
  return path.length > MAX_PATH_LENGTH ? null : path;
}

/** True for paths that are never public content (admin, API, framework assets). */
export function isReservedPath(path: string): boolean {
  return RESERVED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export interface RedirectPair {
  sourcePath: string;
  targetPath: string | null;
}

/**
 * Validates a redirect before it is written. `gone` entries have no target;
 * a permanent or temporary entry needs a distinct, non-reserved, site-relative
 * target — a 302 that leaves the site is exactly as dangerous as a 301 that
 * does, so both are checked identically. Cycles longer than one hop cannot exist
 * because the service repoints existing aliases instead of chaining them.
 */
export function validateRedirect(source: string, target: string | null, kind: RedirectKind): RedirectPair {
  const sourcePath = normalisePath(source);
  if (!sourcePath) throw new RedirectRuleError('sourcePath', 'Source must be a site-relative path such as /business/old-slug');
  if (sourcePath === '/') throw new RedirectRuleError('sourcePath', 'The home page cannot be redirected');
  if (isReservedPath(sourcePath)) throw new RedirectRuleError('sourcePath', 'That path is reserved and cannot be redirected');
  if (kind === 'gone') return { sourcePath, targetPath: null };
  const targetPath = target === null || target === undefined ? null : normalisePath(target);
  if (!targetPath) throw new RedirectRuleError('targetPath', 'Target must be a site-relative path on this site');
  if (isReservedPath(targetPath)) throw new RedirectRuleError('targetPath', 'That path is reserved and cannot be a redirect target');
  if (targetPath === sourcePath) throw new RedirectRuleError('targetPath', 'A path cannot redirect to itself');
  return { sourcePath, targetPath };
}

export type RedirectKind = 'permanent' | 'gone' | 'temporary';

/** One redirect as the resolver needs to see it. */
export interface RedirectRow {
  kind: RedirectKind;
  targetPath: string | null;
  isActive: boolean;
}

/**
 * What actually happens when a visitor asks for a path, decided in one place so
 * the public resolver and the admin preview can never disagree about it.
 *
 * `because` explains a non-effect for the administrator; the public route never
 * reveals it, because an inactive rule must be indistinguishable from no rule at
 * all to an anonymous caller.
 */
export type RedirectEffect =
  | { applies: true; status: 301 | 302 | 410; targetPath: string | null }
  | { applies: false; because: 'no-rule' | 'inactive' | 'no-target' };

export function redirectEffect(row: RedirectRow | null | undefined): RedirectEffect {
  if (!row) return { applies: false, because: 'no-rule' };
  if (!row.isActive) return { applies: false, because: 'inactive' };
  if (row.kind === 'gone') return { applies: true, status: 410, targetPath: null };
  // A hand-edited row with no target cannot be served as a redirect to nowhere.
  if (!row.targetPath) return { applies: false, because: 'no-target' };
  return { applies: true, status: row.kind === 'temporary' ? 302 : 301, targetPath: row.targetPath };
}
