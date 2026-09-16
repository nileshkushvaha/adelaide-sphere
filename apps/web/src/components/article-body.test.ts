import { describe, expect, it } from 'vitest';
import { splitArticleBody } from './article-body';

const PB = '!1m18!1m12!1m3!1d3151!2d138.6007!3d-34.9285!5e0!3m2!1sen!2sau';

describe('splitArticleBody', () => {
  it('keeps ordinary HTML and turns validated markers into embeds and cards', () => {
    const html = `<p>Intro</p><div class="as-embed" data-embed="youtube" data-embed-id="dQw4w9WgXcQ" data-embed-title="A &amp; B">YouTube video: A &amp; B</div><p>Middle</p><div class="as-embed" data-embed="map" data-embed-src="https://www.google.com/maps/embed?pb=${PB}" data-embed-title="Map">Google map</div><div class="as-embed" data-embed="business" data-business-id="cmf0abcdefghijklmnopqrstu" data-embed-title="Bean There">Business card</div><p>End</p>`;
    expect(splitArticleBody(html)).toEqual([
      { kind: 'html', html: '<p>Intro</p>' },
      { kind: 'youtube', id: 'dQw4w9WgXcQ', title: 'A & B' },
      { kind: 'html', html: '<p>Middle</p>' },
      { kind: 'map', src: `https://www.google.com/maps/embed?pb=${PB}`, title: 'Map' },
      { kind: 'business', businessId: 'cmf0abcdefghijklmnopqrstu', title: 'Bean There' },
      { kind: 'html', html: '<p>End</p>' },
    ]);
  });

  it('shows nothing for a marker that is not exactly right, never a frame', () => {
    const html = '<div data-embed="youtube" data-embed-id="bad" data-embed-title="x">x</div><div data-embed="map" data-embed-src="https://evil.example/maps/embed?pb=1" data-embed-title="x">x</div>';
    expect(splitArticleBody(html)).toEqual([]);
  });

  it('returns a body without markers unchanged', () => {
    expect(splitArticleBody('<p>Only text</p>')).toEqual([{ kind: 'html', html: '<p>Only text</p>' }]);
  });
});
