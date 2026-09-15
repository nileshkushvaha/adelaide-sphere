import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_KEY } from './consent';
import { cleanParams, track } from './track';

function fakeWindow(consent: string | null, extras: Record<string, unknown> = {}) {
  const store = new Map<string, string>(consent ? [[CONSENT_KEY, consent]] : []);
  vi.stubGlobal('window', { localStorage: { getItem: (key: string) => store.get(key) ?? null }, ...extras });
}

describe('track (SRS 1.10 BLOG 006)', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('sends nothing without consent, or after it was declined', () => {
    const gtag = vi.fn();
    fakeWindow(null, { gtag });
    expect(track('share', { method: 'facebook' })).toBe(false);
    fakeWindow('declined', { gtag });
    expect(track('share', { method: 'facebook' })).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
  });

  it('sends to Google Analytics, else Tag Manager, once accepted', () => {
    const gtag = vi.fn();
    fakeWindow('accepted', { gtag });
    expect(track('toc_click', { section: 'section-getting-there' })).toBe(true);
    expect(gtag).toHaveBeenCalledWith('event', 'toc_click', { section: 'section-getting-there' });

    const dataLayer: unknown[] = [];
    fakeWindow('accepted', { dataLayer });
    expect(track('blog_search', { results_count: 3 })).toBe(true);
    expect(dataLayer).toEqual([{ event: 'blog_search', results_count: 3 }]);
  });

  it('does nothing when no Google tag is on the page', () => {
    fakeWindow('accepted');
    expect(track('embed_load', { provider: 'youtube' })).toBe(false);
  });

  it('refuses unknown event names', () => {
    const gtag = vi.fn();
    fakeWindow('accepted', { gtag });
    expect(track('page_view' as never)).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
  });
});

describe('cleanParams', () => {
  it('keeps short plain values and drops anything that could carry personal data', () => {
    expect(
      cleanParams({
        method: 'facebook',
        results_count: 4,
        consented: true,
        email: 'someone@example.com',
        link_path: '/blog/x?utm_source=y',
        'Bad-Name': 'x',
        empty: '  ',
        nan: Number.NaN,
        nested: { a: 1 },
        long: 'x'.repeat(300),
      }),
    ).toEqual({ method: 'facebook', results_count: 4, consented: true, long: 'x'.repeat(100) });
  });
});
