import { sponsoredLinks } from './blog-public.service.js';

describe('sponsoredLinks (SRS 1.12 guest posts)', () => {
  const body = '<p><a href="https://example.com" rel="noopener noreferrer nofollow" target="_blank">Out</a> and <a href="/business" rel="noopener">in</a></p>';

  it('marks outbound links in a guest post as sponsored and leaves site links alone', () => {
    const html = sponsoredLinks(body, true);
    expect(html).toContain('rel="sponsored noopener noreferrer nofollow"');
    expect(html).toContain('<a href="/business" rel="noopener">');
  });

  it('changes nothing in an ordinary article', () => {
    expect(sponsoredLinks(body, false)).toBe(body);
  });
});
