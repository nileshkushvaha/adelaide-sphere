import { describe, expect, it } from 'vitest';
import { isReservedPath, MAX_PATH_LENGTH, normalisePath, redirectEffect, RedirectRuleError, validateRedirect } from './redirect-rules.js';

describe('normalisePath', () => {
  it('canonicalises case, duplicate slashes and trailing slashes', () => {
    expect(normalisePath('/Business/Old-Slug/')).toBe('/business/old-slug');
    expect(normalisePath('  /blog//post  ')).toBe('/blog/post');
    expect(normalisePath('/')).toBe('/');
  });

  it('drops query strings and fragments so one stored path matches every variant', () => {
    expect(normalisePath('/business/cafe?utm_source=x')).toBe('/business/cafe');
    expect(normalisePath('/business/cafe#hours')).toBe('/business/cafe');
  });

  it('rejects anything that is not a site-relative path', () => {
    for (const value of ['https://evil.example/x', '//evil.example', 'business/cafe', '\\\\evil', '/a/../../etc', '/a b', '/a%2fb', '/<script>', '']) {
      expect(normalisePath(value), value).toBeNull();
    }
  });

  it('rejects paths longer than the stored column', () => {
    expect(normalisePath(`/${'a'.repeat(MAX_PATH_LENGTH)}`)).toBeNull();
  });
});

describe('isReservedPath', () => {
  it('covers admin, api and framework prefixes only', () => {
    expect(isReservedPath('/admin')).toBe(true);
    expect(isReservedPath('/api/v1/businesses')).toBe(true);
    expect(isReservedPath('/administrators-guide')).toBe(false);
    expect(isReservedPath('/business/cafe')).toBe(false);
  });
});

describe('validateRedirect', () => {
  it('returns the canonical pair', () => {
    expect(validateRedirect('/Business/Old/', '/business/new', 'permanent')).toEqual({ sourcePath: '/business/old', targetPath: '/business/new' });
  });

  it('drops the target for a gone entry', () => {
    expect(validateRedirect('/business/old', '/business/new', 'gone')).toEqual({ sourcePath: '/business/old', targetPath: null });
  });

  it('refuses self-redirects, the home page, reserved paths and cross-origin targets', () => {
    expect(() => validateRedirect('/business/a', '/business/a', 'permanent')).toThrow(RedirectRuleError);
    expect(() => validateRedirect('/', '/business/a', 'permanent')).toThrow(/home page/);
    expect(() => validateRedirect('/admin/x', '/business/a', 'permanent')).toThrow(/reserved/);
    expect(() => validateRedirect('/business/a', '/admin/x', 'permanent')).toThrow(/reserved/);
    expect(() => validateRedirect('/business/a', 'https://evil.example/b', 'permanent')).toThrow(/site-relative/);
    expect(() => validateRedirect('/business/a', null, 'permanent')).toThrow(/site-relative/);
  });
});

describe('temporary redirects', () => {
  it('checks a 302 exactly as strictly as a 301', () => {
    // A 302 that leaves the site is as dangerous as a 301 that does.
    expect(() => validateRedirect('/business/old', null, 'temporary')).toThrow(RedirectRuleError);
    expect(() => validateRedirect('/business/old', 'https://example.com/x', 'temporary')).toThrow(RedirectRuleError);
    expect(() => validateRedirect('/business/old', '/admin/dashboard', 'temporary')).toThrow(RedirectRuleError);
    expect(() => validateRedirect('/business/old', '/business/old', 'temporary')).toThrow(RedirectRuleError);
    expect(validateRedirect('/business/old', '/business/new', 'temporary')).toEqual({ sourcePath: '/business/old', targetPath: '/business/new' });
  });
});

describe('redirectEffect', () => {
  const row = (over: Partial<{ kind: 'permanent' | 'gone' | 'temporary'; targetPath: string | null; isActive: boolean }> = {}) => ({
    kind: 'permanent' as const,
    targetPath: '/business/new',
    isActive: true,
    ...over,
  });

  it('turns each kind into the status the site must send', () => {
    expect(redirectEffect(row())).toEqual({ applies: true, status: 301, targetPath: '/business/new' });
    expect(redirectEffect(row({ kind: 'temporary' }))).toEqual({ applies: true, status: 302, targetPath: '/business/new' });
    expect(redirectEffect(row({ kind: 'gone', targetPath: null }))).toEqual({ applies: true, status: 410, targetPath: null });
  });

  it('treats a rule that is switched off as though it were not there', () => {
    // Every kind, because "off" cannot mean something different for a 410.
    for (const kind of ['permanent', 'temporary', 'gone'] as const) {
      expect(redirectEffect(row({ kind, isActive: false, targetPath: kind === 'gone' ? null : '/business/new' }))).toEqual({ applies: false, because: 'inactive' });
    }
  });

  it('says why nothing happens, so the admin preview can explain it', () => {
    expect(redirectEffect(null)).toEqual({ applies: false, because: 'no-rule' });
    expect(redirectEffect(undefined)).toEqual({ applies: false, because: 'no-rule' });
    // A hand-edited row with no destination must not become a redirect to nowhere.
    expect(redirectEffect(row({ targetPath: null }))).toEqual({ applies: false, because: 'no-target' });
  });
});