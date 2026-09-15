import { describe, expect, it } from 'vitest';
import { articleOutline, withHeadingAnchors } from './headings';

/** Section anchors for editor-written pages: the policies are read and linked to section by section. */
describe('Heading anchors', () => {
  it('anchors each top-level heading and lists it in document order', () => {
    const { html, headings } = withHeadingAnchors('<p>Intro</p>\n<h2>What we collect</h2>\n<p>…</p>\n<h2>How it is stored</h2>');
    expect(headings).toEqual([
      { id: 'what-we-collect', text: 'What we collect' },
      { id: 'how-it-is-stored', text: 'How it is stored' },
    ]);
    expect(html).toContain('<h2 id="what-we-collect">What we collect</h2>');
  });

  it('reads through the markup and entities inside a heading', () => {
    const { headings } = withHeadingAnchors('<h2>Reviews <em>&amp;</em> comments</h2>');
    expect(headings).toEqual([{ id: 'reviews-comments', text: 'Reviews & comments' }]);
  });

  it('keeps an id an editor set, and never gives two sections the same address', () => {
    const { html, headings } = withHeadingAnchors('<h2 id="chosen">First</h2><h2>Your choices</h2><h2>Your choices</h2>');
    expect(headings.map((heading) => heading.id)).toEqual(['chosen', 'your-choices', 'your-choices-2']);
    expect(html).toContain('<h2 id="chosen">First</h2>');
  });

  it('leaves a body with no headings exactly as it was', () => {
    const body = '<p>One paragraph, nothing to anchor.</p>';
    expect(withHeadingAnchors(body)).toEqual({ html: body, headings: [] });
  });
});

describe('Article outline', () => {
  it('anchors sections and subsections with prefixed, unique ids in document order', () => {
    const { html, headings } = articleOutline('<h2>Getting there</h2><p>…</p><h3>By tram</h3><h3>By tram</h3><h2>Comments</h2><h4>Not listed</h4>');
    expect(headings).toEqual([
      { id: 'section-getting-there', text: 'Getting there', level: 2 },
      { id: 'section-by-tram', text: 'By tram', level: 3 },
      { id: 'section-by-tram-2', text: 'By tram', level: 3 },
      { id: 'section-comments', text: 'Comments', level: 2 },
    ]);
    expect(html).toContain('<h3 id="section-by-tram-2">By tram</h3>');
    expect(html).toContain('<h4>Not listed</h4>');
  });

  it('never keeps an id from the body and skips headings with no text', () => {
    const { html, headings } = articleOutline('<h2 id="main-content">Real <em>title</em></h2><h2>  </h2><h2>!!!</h2>');
    expect(headings).toEqual([{ id: 'section-real-title', text: 'Real title', level: 2 }]);
    expect(html).not.toContain('id="main-content"');
    expect(html).toContain('<h2>  </h2>');
  });
});
