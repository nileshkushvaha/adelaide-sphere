import { renderSanitisedBody, sanitiseHtmlFragment, toPlainText } from './sanitise.js';

describe('editorial sanitisation (SRS SEC 001, BLOG 001)', () => {
  it('renders ordinary Markdown into the allowed tags', () => {
    const html = renderSanitisedBody('## Heading\n\nSome **bold** text with a [link](https://example.com).\n\n- one\n- two');
    expect(html).toContain('<h2>Heading</h2>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('href="https://example.com"');
  });

  it('adds safe relationship attributes to external links and keeps internal ones plain', () => {
    expect(renderSanitisedBody('[out](https://example.com)')).toContain('rel="noopener noreferrer nofollow"');
    expect(renderSanitisedBody('[out](https://example.com)')).toContain('target="_blank"');
    const internal = renderSanitisedBody('[in](/business)');
    expect(internal).toContain('href="/business"');
    expect(internal).not.toContain('target="_blank"');
  });

  it('removes scripts, event handlers, iframes, styles and dangerous URL schemes', () => {
    const attacks = [
      '<script>alert(1)</script>',
      '<img src="x" onerror="alert(1)" alt="x">',
      '<iframe src="https://evil.example"></iframe>',
      '<style>body{display:none}</style>',
      '[click](javascript:alert(1))',
      '<a href="data:text/html;base64,PHNjcmlwdD4=">data</a>',
      '<a href="vbscript:msgbox(1)">vb</a>',
      '<object data="evil.swf"></object>',
      '<form action="/steal"><input name="a"></form>',
      '<svg><use href="#x" /></svg>',
    ];
    for (const attack of attacks) {
      const html = renderSanitisedBody(attack);
      expect(html).not.toMatch(/<script|onerror|<iframe|<style|javascript:|data:text\/html|vbscript:|<object|<form|<svg/i);
    }
  });

  it('keeps a required alt attribute and lazy loading on images', () => {
    const html = renderSanitisedBody('![Adelaide laneway](https://example.com/a.jpg)');
    expect(html).toContain('alt="Adelaide laneway"');
    expect(html).toContain('loading="lazy"');
    expect(sanitiseHtmlFragment('<img src="https://example.com/a.jpg">')).toContain('alt=""');
  });

  it('extracts plain text for excerpts and length checks', () => {
    expect(toPlainText(renderSanitisedBody('## Title\n\nSome *text* here.'))).toBe('Title Some text here.');
    expect(toPlainText('')).toBe('');
  });
});

describe('renderSanitisedBody (rich-editor HTML)', () => {
  it('keeps allowed structure and drops scripts, styles and handlers', () => {
    const html = renderSanitisedBody(
      '<h2>Heading</h2><p><strong>Bold</strong> and <em>italic</em></p><script>alert(1)</script><p style="color:red" onclick="steal()">Styled</p><iframe src="https://evil.example"></iframe>',
      'html',
    );
    expect(html).toContain('<h2>Heading</h2>');
    expect(html).toContain('<strong>Bold</strong>');
    expect(html).not.toContain('script');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('style=');
    expect(html).not.toContain('iframe');
  });

  it('keeps pasted and shortcut formatting in its nearest allowed form instead of dropping it', () => {
    const html = renderSanitisedBody('<h1>Title</h1><h5>Small</h5><h6>Smaller</h6><p><s>old</s> <strike>older</strike> <b>bold</b> <i>italic</i> <u>under</u></p>', 'html');
    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain('<h4>Small</h4>');
    expect(html).toContain('<h4>Smaller</h4>');
    expect(html).toContain('<del>old</del>');
    expect(html).toContain('<del>older</del>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    // Underline has no published style; its text survives without the tag.
    expect(html).toContain(' under</p>');
    expect(html).not.toContain('<u>');
  });

  it('keeps an id-shaped data-media-id on images and removes anything else in it', () => {
    const id = 'cmf0abcdefghijklmnopqrstu';
    expect(renderSanitisedBody(`<img data-media-id="${id}" src="https://cdn.example/a.webp" alt="A">`, 'html')).toContain(`data-media-id="${id}"`);
    for (const bad of ['"><script>', 'javascript:alert(1)', 'short', 'UPPER-CASE-NOT-AN-ID-AT-ALL']) {
      expect(renderSanitisedBody(`<img data-media-id='${bad}' src="https://cdn.example/a.webp" alt="A">`, 'html')).not.toContain('data-media-id');
    }
    expect(renderSanitisedBody(`<p data-media-id="${id}">not an image</p>`, 'html')).not.toContain('data-media-id');
  });

  it('keeps figures with captions and only the editor figure classes', () => {
    const html = renderSanitisedBody('<figure class="as-figure as-figure--wide evil"><img src="https://cdn.example/a.webp" alt="A tram"><figcaption>King William Street</figcaption></figure>', 'html');
    expect(html).toContain('<figure class="as-figure as-figure--wide">');
    expect(html).toContain('<figcaption>King William Street</figcaption>');
    expect(html).not.toContain('evil');
  });

  it('keeps valid embed and business markers, and never stores an iframe', () => {
    const youtube = renderSanitisedBody('<div class="as-embed" data-embed="youtube" data-embed-id="dQw4w9WgXcQ" data-embed-title="Laneway tour" onclick="x()">YouTube video</div>', 'html');
    expect(youtube).toContain('data-embed="youtube"');
    expect(youtube).toContain('data-embed-id="dQw4w9WgXcQ"');
    expect(youtube).not.toContain('onclick');
    const business = renderSanitisedBody('<div data-embed="business" data-business-id="cmf0abcdefghijklmnopqrstu" data-embed-title="Bean There">Business card</div>', 'html');
    expect(business).toContain('data-business-id="cmf0abcdefghijklmnopqrstu"');
    for (const bad of [
      '<div data-embed="youtube" data-embed-id="javascript:x" data-embed-title="t">text kept</div>',
      '<div data-embed="map" data-embed-src="https://evil.example/maps/embed?pb=!1m2" data-embed-title="t">text kept</div>',
      '<div data-embed="youtube" data-embed-id="dQw4w9WgXcQ">text kept</div>',
      '<div data-embed="iframe">text kept</div>',
      '<div style="color:red">text kept</div>',
    ]) {
      const out = renderSanitisedBody(bad, 'html');
      expect(out, bad).not.toContain('data-embed');
      expect(out, bad).not.toContain('<div');
      expect(out, bad).toContain('text kept');
    }
    expect(renderSanitisedBody('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>', 'html')).not.toContain('iframe');
  });

  it('applies the same link and image rules as the Markdown path', () => {
    const html = renderSanitisedBody('<p><a href="https://example.com">Out</a> <a href="javascript:alert(1)">Bad</a></p><p><img src="https://cdn.example/a.webp"></p>', 'html');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('loading="lazy"');
  });
});

describe('document links (change log 1.16)', () => {
  it('keeps the library id and the document class on a link, and nothing else extra', () => {
    const html = renderSanitisedBody('<p><a href="https://media.example/media/cmu2a3ydk0000yjumqnk96o5a/x.pdf" data-media-id="cmu2a3ydk0000yjumqnk96o5a" class="as-doc-link evil" onclick="x()">Price list</a> <a href="/about" data-media-id="not an id">About</a></p>', 'html');
    expect(html).toContain('data-media-id="cmu2a3ydk0000yjumqnk96o5a"');
    expect(html).toContain('class="as-doc-link"');
    expect(html).not.toContain('evil');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('not an id');
  });
});
