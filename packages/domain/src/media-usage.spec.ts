import { describe, expect, it } from 'vitest';
import { MEDIA_SETTING_REFERENCES, MEDIA_USAGE_RELATIONS, extractMediaIds, unusedMediaRelations } from './media-usage.js';

describe('media usage', () => {
  it('counts every place an image can appear, not only listings, articles and authors', () => {
    // A share image is a use in its own right: an article can share one picture
    // and show another, so dropping the cover must not make the share image
    // look unused and collectable.
    expect(MEDIA_USAGE_RELATIONS).toEqual(
      expect.arrayContaining(['businesses', 'coverOf', 'shareImageOf', 'pageShareImageOf', 'authorOf', 'testimonials', 'partners', 'categoryImageOf', 'categoryShareImageOf', 'areaImageOf', 'areaShareImageOf', 'businessShareImageOf', 'blogCategoryShareImageOf', 'bodyReferences']),
    );
    expect(unusedMediaRelations()).toEqual({
      businesses: { none: {} },
      coverOf: { none: {} },
      shareImageOf: { none: {} },
      pageShareImageOf: { none: {} },
      authorOf: { none: {} },
      testimonials: { none: {} },
      partners: { none: {} },
      categoryImageOf: { none: {} },
      categoryShareImageOf: { none: {} },
      areaImageOf: { none: {} },
      areaShareImageOf: { none: {} },
      businessShareImageOf: { none: {} },
      blogCategoryShareImageOf: { none: {} },
      blogTagShareImageOf: { none: {} },
      menuItemDocuments: { none: {} },
      bodyReferences: { none: {} },
    });
  });

  it('finds the branding images and hero slides stored inside settings', () => {
    const general = MEDIA_SETTING_REFERENCES.find((ref) => ref.key === 'general')!;
    const home = MEDIA_SETTING_REFERENCES.find((ref) => ref.key === 'home')!;
    expect(general.mediaIds({ logoMediaId: 'm1', faviconMediaId: null, shareImageMediaId: ' m3 ' })).toEqual(['m1', 'm3']);
    expect(home.mediaIds({ heroSlides: [{ mediaId: 'h1' }, { mediaId: '' }, { caption: 'no image' }] })).toEqual(['h1']);
  });

  it('reads nothing, rather than throwing, from a document of an unexpected shape', () => {
    for (const ref of MEDIA_SETTING_REFERENCES) {
      expect(ref.mediaIds(null)).toEqual([]);
      expect(ref.mediaIds('text')).toEqual([]);
      expect(ref.mediaIds({ heroSlides: 'not a list' })).toEqual([]);
    }
  });

  it('finds images inside rich text by recorded id and by rendition address', () => {
    const id = 'cmf0abcdefghijklmnopqrstu';
    const other = 'cmf0zyxwvutsrqponmlkjihgf';
    const html = `<p>Hi</p><img src="https://cdn.example.com/media/${id}/k2j3h4.webp" alt="A"><figure><img data-media-id="${other}" src="https://cdn.example.com/media/${other}/x.webp" alt="B"></figure><img src="https://elsewhere.example/photo.jpg" alt="C">`;
    expect(extractMediaIds(html, null, `<img src="/media/${id}/again.webp">`).sort()).toEqual([id, other].sort());
    expect(extractMediaIds('<p>No pictures</p>', undefined, '')).toEqual([]);
    // Text that merely mentions a path is not an image.
    expect(extractMediaIds(`<p>see /media/${id}/x.webp</p>`)).toEqual([]);
  });
});

describe('document uses (change log 1.16)', () => {
  it('counts menu links and blog tag share images, and finds a document id on a link', () => {
    expect(MEDIA_USAGE_RELATIONS).toContain('menuItemDocuments');
    expect(MEDIA_USAGE_RELATIONS).toContain('blogTagShareImageOf');
    expect(extractMediaIds('<a href="https://media.example/x.pdf" class="as-doc-link" data-media-id="cmu2a3ydk0000yjumqnk96o5a">Price list</a>')).toEqual(['cmu2a3ydk0000yjumqnk96o5a']);
  });
});
