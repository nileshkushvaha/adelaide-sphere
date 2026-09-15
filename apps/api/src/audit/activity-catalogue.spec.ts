import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ACTIVITY_CATEGORIES, ACTIVITY_DOMAINS, ACTIVITY_RETENTION_DAYS, describeActivity, domainsInCategory, isActivityDomain } from './activity-catalogue.js';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

/** Every `action:` passed to the audit service, literal or templated on its first segment. */
function auditActionDomains(): { domain: string; file: string }[] {
  const found: { domain: string; file: string }[] = [];
  for (const file of sourceFiles(join(import.meta.dirname, '..'))) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/action:\s*[`']([a-z0-9_]+)[.`']/g)) {
      found.push({ domain: match[1]!, file });
    }
  }
  return found;
}

describe('activity catalogue (SRS 1.2 ACT 001–002)', () => {
  it('declares a known category and a readable label for every domain', () => {
    for (const [key, domain] of Object.entries(ACTIVITY_DOMAINS)) {
      expect(ACTIVITY_CATEGORIES, key).toContain(domain.category);
      expect(domain.label.length, key).toBeGreaterThan(3);
      expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('covers every audit event the server actually writes', () => {
    const domains = auditActionDomains();
    // If this finds nothing, the scan is broken and the test is worthless.
    expect(domains.length).toBeGreaterThan(20);
    const unregistered = [...new Set(domains.filter(({ domain }) => !isActivityDomain(domain)).map(({ domain }) => domain))];
    // Add the domain to ACTIVITY_DOMAINS rather than relaxing this: an event
    // nobody can categorise is an event nobody will find.
    expect(unregistered).toEqual([]);
  });

  it('derives the outcome from the code, so a failure cannot be recorded as a success', () => {
    expect(describeActivity('auth.login.failure').outcome).toBe('failure');
    expect(describeActivity('auth.totp.challenge_failed').outcome).toBe('failure');
    expect(describeActivity('authz.role.update.refused').outcome).toBe('failure');
    expect(describeActivity('auth.login.success').outcome).toBe('success');
    expect(describeActivity('listing.publish').outcome).toBe('success');
  });

  it('resolves an event to its category and label', () => {
    expect(describeActivity('email.resend')).toMatchObject({ domain: 'email', category: 'communication', domainLabel: 'Transactional email' });
    expect(describeActivity('authz.role.create').category).toBe('access_control');
  });

  it('shows an event from an unregistered domain rather than hiding it', () => {
    expect(describeActivity('brandnew.thing')).toMatchObject({ domain: null, category: 'unknown', domainLabel: 'brandnew' });
  });

  it('maps a category back to the domains it filters on', () => {
    expect(domainsInCategory('moderation').sort()).toEqual(['comment', 'report', 'review']);
    expect(domainsInCategory('access_control').sort()).toEqual(['admin', 'authz']);
  });

  it('keeps the retention bound in one place (ACT 006, PRIV 001)', () => {
    expect(ACTIVITY_RETENTION_DAYS).toBe(365);
  });
});
