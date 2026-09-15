import { describe, expect, it } from 'vitest';
import { withoutRepeatedHeading } from './landing-content';

/**
 * A category page states its name in the heading, and an editor writing the
 * description reasonably starts by typing the name again — which is how the
 * archive came to read "City guides / City guides / Our guides.".
 */
describe('withoutRepeatedHeading', () => {
  it('drops an opening heading that only repeats the page title', () => {
    expect(withoutRepeatedHeading('<h2>City guides</h2><p>Our guides.</p>', 'City guides')).toBe('<p>Our guides.</p>');
  });

  it('ignores case, surrounding space and a trailing full stop or colon', () => {
    expect(withoutRepeatedHeading('<h3>  CITY GUIDES:  </h3><p>Our guides.</p>', 'City guides')).toBe('<p>Our guides.</p>');
    expect(withoutRepeatedHeading('<h2>City guides.</h2>\n<p>Our guides.</p>', 'City guides')).toBe('<p>Our guides.</p>');
  });

  it('sees through inline markup inside the heading', () => {
    expect(withoutRepeatedHeading('<h2><strong>City guides</strong></h2><p>Our guides.</p>', 'City guides')).toBe('<p>Our guides.</p>');
  });

  it('keeps a heading that says something the title does not', () => {
    const html = '<h2>What we cover</h2><p>Our guides.</p>';
    expect(withoutRepeatedHeading(html, 'City guides')).toBe(html);
  });

  it('keeps everything when the content does not open with a heading', () => {
    const html = '<p>City guides</p><p>Our guides.</p>';
    expect(withoutRepeatedHeading(html, 'City guides')).toBe(html);
  });

  it('never removes a heading from the middle of the content', () => {
    const html = '<p>Our guides.</p><h2>City guides</h2>';
    expect(withoutRepeatedHeading(html, 'City guides')).toBe(html);
  });

  it('returns nothing when the repeated heading was the whole entry', () => {
    expect(withoutRepeatedHeading('<h2>City guides</h2>', 'City guides')).toBeNull();
    expect(withoutRepeatedHeading('  <h2>City guides</h2>  ', 'City guides')).toBeNull();
  });

  it('passes an empty or absent description through unchanged', () => {
    expect(withoutRepeatedHeading(null, 'City guides')).toBeNull();
    expect(withoutRepeatedHeading(undefined, 'City guides')).toBeNull();
    expect(withoutRepeatedHeading('', 'City guides')).toBeNull();
  });

  it('only ever removes content, so it cannot introduce markup of its own', () => {
    const html = '<h2>City guides</h2><p>Our <a href="/blog">guides</a>.</p>';
    const result = withoutRepeatedHeading(html, 'City guides') ?? '';
    expect(html).toContain(result);
  });
});
