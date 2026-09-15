/** Media rules shared by the API (validation) and the worker (processing). */

export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

/** Documents an administrator may upload (change log 1.16): PDF only. */
export const ALLOWED_DOCUMENT_MIME = ['application/pdf'] as const;
export type AllowedDocumentMime = (typeof ALLOWED_DOCUMENT_MIME)[number];
/** Every type the upload endpoint accepts. */
export const ALLOWED_UPLOAD_MIME = [...ALLOWED_IMAGE_MIME, ...ALLOWED_DOCUMENT_MIME] as const;

/** SRS MED 001 limits. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_MEGAPIXELS = 40;
export const MAX_PIXELS = MAX_MEGAPIXELS * 1_000_000;
export const MIN_DIMENSION = 200;
/** Documents may be larger than images (change log 1.16). */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export type MediaKind = 'image' | 'document';

/** What an upload is, from the type it declares; null for anything not accepted at all. */
export function mediaKindForMime(mime: string): MediaKind | null {
  if ((ALLOWED_IMAGE_MIME as readonly string[]).includes(mime)) return 'image';
  if ((ALLOWED_DOCUMENT_MIME as readonly string[]).includes(mime)) return 'document';
  return null;
}

export function maxBytesFor(kind: MediaKind): number {
  return kind === 'document' ? MAX_DOCUMENT_BYTES : MAX_UPLOAD_BYTES;
}

export const VARIANT_SIZES = {
  thumbnail: 320,
  card: 800,
  hero: 1600,
} as const;
export type VariantKind = keyof typeof VARIANT_SIZES;
export const VARIANT_KINDS = Object.keys(VARIANT_SIZES) as VariantKind[];
/** Variants are always re-encoded to WebP, which drops EXIF with the original container. */
export const VARIANT_MIME = 'image/webp';

export function isAllowedImageMime(value: string): value is AllowedImageMime {
  return (ALLOWED_IMAGE_MIME as readonly string[]).includes(value);
}

export interface ImageFacts {
  /** MIME detected from the magic bytes, not from the client. */
  detectedMime: string | null;
  width: number | null;
  height: number | null;
  /** True for animated GIF/WebP/APNG, which MVP rejects (SRS MED 001). */
  animated: boolean;
  bytes: number;
}

/** Every reason an upload can be refused, in the order they are checked. */
export function imageRejectionReason(facts: ImageFacts, declaredMime: string): string | null {
  if (facts.bytes <= 0) return 'The uploaded file is empty';
  if (facts.bytes > MAX_UPLOAD_BYTES) return `Images must be ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB or smaller`;
  if (!facts.detectedMime) return 'The file is not a recognised image';
  if (!isAllowedImageMime(facts.detectedMime)) return 'Only JPEG, PNG and WebP images are accepted';
  // The browser-supplied type must agree with the bytes; a mismatch is a red flag, not a formality.
  if (facts.detectedMime !== declaredMime) return 'The file contents do not match the declared file type';
  if (facts.animated) return 'Animated images are not accepted';
  if (!facts.width || !facts.height) return 'The image could not be decoded';
  if (facts.width * facts.height > MAX_PIXELS) return `Images must be ${MAX_MEGAPIXELS} megapixels or smaller`;
  if (facts.width < MIN_DIMENSION || facts.height < MIN_DIMENSION) return `Images must be at least ${MIN_DIMENSION}px on each side`;
  return null;
}

/** Target size for a variant: never upscales, and keeps the aspect ratio (SRS MED 003). */
export function variantDimensions(kind: VariantKind, width: number, height: number): { width: number; height: number } {
  const target = VARIANT_SIZES[kind];
  if (width <= target) return { width, height };
  const scaled = Math.max(1, Math.round((height * target) / width));
  return { width: target, height: scaled };
}

/**
 * Random, server-generated object key (SRS MED 002): clients never choose a key,
 * so they cannot overwrite or guess another asset's object.
 */
export function objectKeyFor(prefix: 'quarantine' | 'media', assetId: string, suffix: string, random: string): string {
  // Letters and digits only: dots and slashes can never re-enter the key.
  const safeSuffix = suffix.replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'bin';
  return `${prefix}/${assetId}/${random}.${safeSuffix}`;
}

export function extensionForMime(mime: string): string {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'bin';
}

// ---- Documents (change log 1.16) ---------------------------------------------

export interface DocumentFacts {
  /** MIME detected from the magic bytes, not from the client. */
  detectedMime: string | null;
  bytes: number;
  /** The file itself, read as latin1 so PDF names can be searched without decoding. */
  text: string;
}

/**
 * PDF features that run or carry something: scripts, launch actions, files
 * attached inside the document, rich media and XML forms. A document with any
 * of them is refused. With the download-only delivery and the media host's
 * sandbox headers, this is what stands between an upload and a reader.
 *
 * The names are matched as PDF name tokens (`/JavaScript` followed by a
 * delimiter), so the words appearing in ordinary text do not trip it.
 */
const ACTIVE_PDF_NAMES: ReadonlyArray<[RegExp, string]> = [
  [/\/(JavaScript|JS)(?=[\s/<>\[\]()]|$)/, 'This PDF contains scripts, which are not accepted'],
  [/\/Launch(?=[\s/<>\[\]()]|$)/, 'This PDF tries to open other programs, which is not accepted'],
  [/\/EmbeddedFiles?(?=[\s/<>\[\]()]|$)/, 'This PDF has files attached inside it, which is not accepted'],
  [/\/RichMedia(?=[\s/<>\[\]()]|$)/, 'This PDF contains embedded media, which is not accepted'],
  [/\/XFA(?=[\s/<>\[\]()]|$)/, 'This PDF contains an interactive XML form, which is not accepted'],
];

/** Every reason a document can be refused, in the order they are checked. */
export function documentRejectionReason(facts: DocumentFacts, declaredMime: string): string | null {
  if (facts.bytes <= 0) return 'The uploaded file is empty';
  if (facts.bytes > MAX_DOCUMENT_BYTES) return `Documents must be ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB or smaller`;
  if (facts.detectedMime !== 'application/pdf' || !facts.text.startsWith('%PDF-')) return 'Only PDF documents are accepted';
  if (facts.detectedMime !== declaredMime) return 'The file contents do not match the declared file type';
  if (!facts.text.slice(-2048).includes('%%EOF')) return 'The PDF is incomplete or damaged';
  if (/\/Encrypt(?=[\s/<>\[\]()]|$)/.test(facts.text)) return 'Password-protected or encrypted PDFs are not accepted';
  for (const [pattern, reason] of ACTIVE_PDF_NAMES) if (pattern.test(facts.text)) return reason;
  return null;
}

/** Pages in a PDF, best effort: page objects are counted, the page tree is not walked. */
export function pdfPageCount(text: string): number | null {
  const count = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
  return count > 0 ? count : null;
}

/** A download file name that is safe in a header: ASCII letters, digits and dashes, ending in .pdf. */
export function safeDownloadName(sourceName: string): string {
  const stem = sourceName
    .replace(/\.pdf$/i, '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 76);
  return `${stem || 'document'}.pdf`;
}

/** "1.2 MB", "340 KB", for captions and link hints. */
export function readableFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
