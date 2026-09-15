import { describe, expect, it } from 'vitest';
import { formatArticleDate, shareTargets } from './share';

describe('article share links (SRS BLOG 004)', () => {
  it('builds ordinary share URLs with encoded parameters and no third-party scripts', () => {
    const targets = shareTargets('https://example.com/blog/a-guide?x=1', 'Coffee & cake');
    expect(targets.map((t) => t.label)).toEqual(['Share by email', 'Share on X', 'Share on Facebook', 'Share on LinkedIn']);
    expect(targets[0]!.href).toBe('mailto:?subject=Coffee%20%26%20cake&body=https%3A%2F%2Fexample.com%2Fblog%2Fa-guide%3Fx%3D1');
    expect(targets[1]!.href).toContain('text=Coffee%20%26%20cake');
    expect(targets.every((t) => t.href.startsWith('mailto:') || t.href.startsWith('https://'))).toBe(true);
  });

  it('formats dates in Adelaide time', () => {
    expect(formatArticleDate('2026-09-06T14:00:00Z')).toBe('6 September 2026');
    expect(formatArticleDate('2026-09-06T15:00:00Z')).toBe('7 September 2026');
  });
});
