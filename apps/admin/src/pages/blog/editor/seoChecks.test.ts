import { describe, expect, it } from 'vitest';
import { seoChecks, type SeoCheckInput } from './seoChecks';

const sentence = 'Fitzroy rewards a slow walk between its galleries and cafés.';
const long = (count: number) => Array.from({ length: count }, () => sentence).join(' ');

function input(overrides: Partial<SeoCheckInput> = {}): SeoCheckInput {
  return {
    focusPhrase: 'Fitzroy walk',
    title: 'A Fitzroy walk for a slow Sunday',
    seoTitle: '',
    summary: 'Our Fitzroy walk starts on Gertrude Street and ends with coffee.',
    seoDescription: '',
    slug: 'fitzroy-walk-sunday',
    bodyHtml: `<p>This Fitzroy walk takes two hours.</p><h2>Start</h2><p>${long(40)}</p><p><a href="/blog/lygon-street">Lygon Street</a></p><figure><img src="/a.webp" alt="Gertrude Street"></figure>`,
    ...overrides,
  };
}

const statusOf = (checks: ReturnType<typeof seoChecks>, code: string) => checks.find((check) => check.code === code)?.status;

describe('seoChecks', () => {
  it('reports a well-prepared article as good throughout', () => {
    const checks = seoChecks(input());
    expect(checks.filter((check) => check.status === 'improve')).toEqual([]);
    expect(checks.map((check) => check.code)).toEqual(['focus-title', 'focus-description', 'focus-opening', 'focus-address', 'length', 'headings', 'image-descriptions', 'internal-links', 'sentences']);
  });

  it('asks for a focus phrase before giving advice about one', () => {
    const checks = seoChecks(input({ focusPhrase: '  ' }));
    expect(checks[0]).toMatchObject({ code: 'focus', status: 'improve' });
    expect(statusOf(checks, 'focus-title')).toBeUndefined();
  });

  it('matches whole words, ignoring case, accents and punctuation', () => {
    expect(statusOf(seoChecks(input({ focusPhrase: 'cafes', title: 'Best CAFÉS, ranked' })), 'focus-title')).toBe('good');
    expect(statusOf(seoChecks(input({ focusPhrase: 'art', title: 'Where to start' })), 'focus-title')).toBe('improve');
    // The search title, when set, is what is checked.
    expect(statusOf(seoChecks(input({ seoTitle: 'Something else entirely' })), 'focus-title')).toBe('improve');
  });

  it('flags short text, missing headings, undescribed images, no internal links and long sentences', () => {
    const wordy = Array.from({ length: 8 }, () => `${'word '.repeat(30)}end.`).join(' ');
    const checks = seoChecks(input({ bodyHtml: `<p>${wordy} ${long(10)}</p><p><a href="https://example.com">out</a></p><img src="/a.webp" alt=""><img src="/b.webp">` }));
    expect(statusOf(checks, 'headings')).toBe('improve');
    expect(checks.find((check) => check.code === 'image-descriptions')?.message).toMatch(/^2 images have no description/);
    expect(statusOf(checks, 'internal-links')).toBe('improve');
    expect(statusOf(checks, 'sentences')).toBe('improve');
    expect(statusOf(seoChecks(input({ bodyHtml: '<p>Too short.</p>' })), 'length')).toBe('improve');
  });
});
