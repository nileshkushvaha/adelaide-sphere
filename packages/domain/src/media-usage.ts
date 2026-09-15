/**
 * Where an image or a document can be in use (SRS MED 004, DAT 003; documents
 * and menu links since change log 1.16).
 *
 * Two things act on "is this image used anywhere?": the library refuses to
 * delete an image that is, and the worker's retention task removes processed
 * images that are not. They must agree exactly. When they did not — the list of
 * places lived in each of them separately — a partner's logo, a testimonial
 * portrait or the site's own logo counted as unused, so the library let an
 * administrator delete it and the worker deleted it on its own a month after
 * upload. The relations to testimonials and partners are `SET NULL`, so the
 * database did not object: the page simply lost its picture.
 *
 * This is the one list. A new place that shows an image is added here, and both
 * the library and the retention task learn about it at once.
 */

/**
 * `MediaAsset` relations that make an image in use. The names are the Prisma
 * relation fields, so a query can be built from them directly.
 */
export const MEDIA_USAGE_RELATIONS = ['businesses', 'coverOf', 'shareImageOf', 'pageShareImageOf', 'authorOf', 'testimonials', 'partners', 'categoryImageOf', 'categoryShareImageOf', 'areaImageOf', 'areaShareImageOf', 'businessShareImageOf', 'blogCategoryShareImageOf', 'blogTagShareImageOf', 'menuItemDocuments', 'bodyReferences'] as const;

export type MediaUsageRelation = (typeof MEDIA_USAGE_RELATIONS)[number];

/** The relation filter for "used by none of them", for a `where` clause. */
export function unusedMediaRelations(): Record<MediaUsageRelation, { none: Record<string, never> }> {
  return Object.fromEntries(MEDIA_USAGE_RELATIONS.map((relation) => [relation, { none: {} }])) as Record<MediaUsageRelation, { none: Record<string, never> }>;
}

/**
 * Settings documents that refer to images by id inside their JSON, where no
 * foreign key can protect them. Each entry says which stored document to read
 * and how to find the image ids in it.
 */
export interface MediaSettingReference {
  group: string;
  key: string;
  /** What an administrator calls the place, for "used in …". */
  label: string;
  /** Image ids referenced by the stored document; tolerant of any shape. */
  mediaIds: (data: unknown) => string[];
}

const stringField = (record: Record<string, unknown>, field: string): string[] => {
  const value = record[field];
  return typeof value === 'string' && value.trim() !== '' ? [value.trim()] : [];
};

const asRecord = (data: unknown): Record<string, unknown> => (data !== null && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {});

export const MEDIA_SETTING_REFERENCES: readonly MediaSettingReference[] = [
  {
    group: 'website',
    key: 'general',
    label: 'Site logo, icon or sharing image',
    mediaIds: (data) => {
      const record = asRecord(data);
      return ['logoMediaId', 'faviconMediaId', 'shareImageMediaId'].flatMap((field) => stringField(record, field));
    },
  },
  {
    group: 'website',
    key: 'home',
    label: 'Home page hero',
    mediaIds: (data) => {
      const slides = asRecord(data).heroSlides;
      return Array.isArray(slides) ? slides.flatMap((slide) => stringField(asRecord(slide), 'mediaId')) : [];
    },
  },
];

/**
 * Rich text fields that can show images inside their HTML, by the resource type
 * recorded in `content_media_references`.
 */
export const CONTENT_MEDIA_RESOURCES = ['post', 'static_page', 'author', 'faq', 'blog_category', 'blog_tag'] as const;
export type ContentMediaResource = (typeof CONTENT_MEDIA_RESOURCES)[number];

const MEDIA_ID = '[a-z0-9]{20,40}';
/** `data-media-id="…"`, written by the editor on every image and document link it inserts. */
const DATA_ATTRIBUTE = new RegExp(`data-media-id=["'](${MEDIA_ID})["']`, 'gi');
/**
 * A published rendition's address. Every variant key is `media/<assetId>/…`
 * (`objectKeyFor`), so an image inserted before the editor recorded ids is still
 * recognised from the URL it was inserted with.
 */
const VARIANT_PATH = new RegExp(`\\bsrc=["'][^"']*/media/(${MEDIA_ID})/[^"']*["']`, 'gi');

/**
 * Image ids referenced by stored HTML, de-duplicated. Ids that no longer exist
 * are the caller's to filter: this only reads the markup.
 */
export function extractMediaIds(...htmls: readonly (string | null | undefined)[]): string[] {
  const ids = new Set<string>();
  for (const html of htmls) {
    if (!html) continue;
    for (const match of html.matchAll(DATA_ATTRIBUTE)) ids.add(match[1]!.toLowerCase());
    for (const match of html.matchAll(VARIANT_PATH)) ids.add(match[1]!.toLowerCase());
  }
  return [...ids];
}
