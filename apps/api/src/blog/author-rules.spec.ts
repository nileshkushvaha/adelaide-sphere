import { describe, expect, it } from 'vitest';
import { MAX_EXPERTISE, validateAuthorLinks, validateExpertise, validatePublicEmail } from './author-rules.js';

describe('validateAuthorLinks', () => {
  it('normalises accepted links and keeps their order', () => {
    const { errors, normalised } = validateAuthorLinks([
      { kind: 'x', url: 'https://x.com/adelaidesphere' },
      { kind: 'website', url: 'https://example.com/profile', label: '  Portfolio  ' },
    ]);
    expect(errors).toEqual({});
    expect(normalised).toEqual([
      { kind: 'x', url: 'https://x.com/adelaidesphere', label: null, sortOrder: 0 },
      { kind: 'website', url: 'https://example.com/profile', label: 'Portfolio', sortOrder: 1 },
    ]);
  });

  it('rejects the wrong host, duplicates, unknown kinds and unsafe URLs', () => {
    expect(validateAuthorLinks([{ kind: 'instagram', url: 'https://example.com/me' }]).errors['links.0.url']).toBeTruthy();
    expect(validateAuthorLinks([{ kind: 'x', url: 'https://x.com/a' }, { kind: 'x', url: 'https://x.com/b' }]).errors['links.1.kind']).toBeTruthy();
    expect(validateAuthorLinks([{ kind: 'myspace' as never, url: 'https://myspace.com/a' }]).errors['links.0.kind']).toBeTruthy();
    expect(validateAuthorLinks([{ kind: 'website', url: 'javascript:alert(1)' }]).errors['links.0.url']).toBeTruthy();
    expect(validateAuthorLinks(Array.from({ length: 9 }, () => ({ kind: 'other' as const, url: 'https://example.com' }))).errors.links).toBeTruthy();
  });
});

describe('validateExpertise', () => {
  it('trims, de-duplicates and bounds the list', () => {
    expect(validateExpertise(['  Coffee ', 'coffee', 'Markets', ''])).toEqual({ errors: {}, normalised: ['Coffee', 'Markets'] });
    expect(validateExpertise(Array.from({ length: MAX_EXPERTISE + 1 }, (_, i) => `t${i}`)).errors.expertise).toBeTruthy();
    expect(validateExpertise(['x'.repeat(41)]).errors.expertise).toBeTruthy();
  });
});

describe('validatePublicEmail', () => {
  it('accepts an address, lowercases it and treats blank as absent', () => {
    expect(validatePublicEmail(' Editor@Example.com ')).toEqual({ ok: true, normalised: 'editor@example.com' });
    expect(validatePublicEmail('')).toEqual({ ok: true, normalised: null });
    expect(validatePublicEmail('not-an-email').ok).toBe(false);
  });
});
