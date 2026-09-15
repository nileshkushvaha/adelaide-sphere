import { Node } from '@tiptap/react';

/**
 * Editor building blocks for articles (SRS 1.10 BLOG 004). Each renders the
 * exact markup the server's sanitiser keeps, so what is saved is what was
 * inserted.
 */

/** The document: ordinary blocks, plus embeds that may only sit at the top level. */
export const ArticleDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: '(block | topBlock)+',
});

export type FigureSize = 'normal' | 'wide';

export interface FigureAttributes {
  src: string;
  alt: string;
  mediaId: string | null;
  caption: string;
  size: FigureSize;
}

/** A library image with its description and an optional caption, at normal or wide size. */
export const ArticleFigure = Node.create({
  name: 'articleFigure',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
      mediaId: { default: null },
      caption: { default: '' },
      size: { default: 'normal' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure',
        priority: 60,
        getAttrs: (element) => {
          const node = element as HTMLElement;
          const img = node.querySelector('img');
          if (!img) return false;
          return {
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt') ?? '',
            mediaId: img.getAttribute('data-media-id'),
            caption: node.querySelector('figcaption')?.textContent ?? '',
            size: node.classList.contains('ms-figure--wide') ? 'wide' : 'normal',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as unknown as FigureAttributes;
    const img: [string, Record<string, string>] = ['img', { src: attrs.src, alt: attrs.alt ?? '', loading: 'lazy', ...(attrs.mediaId ? { 'data-media-id': attrs.mediaId } : {}) }];
    return ['figure', { class: attrs.size === 'wide' ? 'ms-figure ms-figure--wide' : 'ms-figure' }, img, ...(attrs.caption ? [['figcaption', {}, attrs.caption] as [string, Record<string, string>, string]] : [])];
  },
});

export type EmbedKind = 'youtube' | 'map' | 'business';

export interface EmbedAttributes {
  provider: EmbedKind;
  embedId: string | null;
  src: string | null;
  businessId: string | null;
  title: string;
}

const EMBED_LABEL: Record<EmbedKind, string> = { youtube: 'YouTube video', map: 'Google map', business: 'Business card' };

/**
 * A YouTube video, a Google map or a business card, stored as an inert marker
 * the public page turns into a click-to-load player or a card. The text inside
 * says what it is, in the editor and anywhere the marker is shown as plain HTML.
 */
export const EmbedBlock = Node.create({
  name: 'embedBlock',
  // Top level only: inside a quote or list the page would have to split that element to show it.
  group: 'topBlock',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      provider: { default: 'youtube' },
      embedId: { default: null },
      src: { default: null },
      businessId: { default: null },
      title: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-embed]',
        getAttrs: (element) => {
          const node = element as HTMLElement;
          const provider = node.getAttribute('data-embed');
          if (provider !== 'youtube' && provider !== 'map' && provider !== 'business') return false;
          return {
            provider,
            embedId: node.getAttribute('data-embed-id'),
            src: node.getAttribute('data-embed-src'),
            businessId: node.getAttribute('data-business-id'),
            title: node.getAttribute('data-embed-title') ?? '',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as unknown as EmbedAttributes;
    const marker: Record<string, string> = { class: 'ms-embed', 'data-embed': attrs.provider, 'data-embed-title': attrs.title ?? '' };
    if (attrs.provider === 'youtube' && attrs.embedId) marker['data-embed-id'] = attrs.embedId;
    if (attrs.provider === 'map' && attrs.src) marker['data-embed-src'] = attrs.src;
    if (attrs.provider === 'business' && attrs.businessId) marker['data-business-id'] = attrs.businessId;
    return ['div', marker, `${EMBED_LABEL[attrs.provider] ?? 'Embed'}: ${attrs.title || 'untitled'}`];
  },
});

/**
 * Tidies HTML pasted from a word processor before the editor reads it: styles,
 * classes, fonts, spans, Office-only tags and comments go, so text arrives as
 * text with its headings, lists, links and emphasis. Reports whether anything
 * was removed, so the writer can be told once.
 */
export function tidyPastedHtml(html: string): { html: string; tidied: boolean } {
  const tidied = /\sstyle=|\sclass=|<font\b|<span\b|<o:p|mso-|<!--/i.test(html);
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?o:p[^>]*>/gi, '')
    .replace(/<\/?(?:font|span)\b[^>]*>/gi, '')
    .replace(/\s(?:style|class|lang|dir|id)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  return { html: cleaned, tidied };
}
