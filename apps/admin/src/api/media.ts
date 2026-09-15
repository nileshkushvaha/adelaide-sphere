import { ALLOWED_IMAGE_MIME, MAX_DOCUMENT_BYTES, MAX_MEGAPIXELS, MAX_UPLOAD_BYTES, MIN_DIMENSION } from '@adelaide-sphere/domain';
import type { components } from '@adelaide-sphere/contracts';
import { httpClient, type HttpClient } from './http-client';
import { enabledFilters } from './query';
import type { CollectionMeta } from './admins';

export type MediaAsset = components['schemas']['MediaAssetDto'];
export type MediaVariant = components['schemas']['MediaVariantDto'];
export type GalleryEntry = components['schemas']['GalleryEntryDto'];
export type GalleryItem = components['schemas']['GalleryItemDto'];
export type MediaStatus = MediaAsset['status'];
export type MediaKind = MediaAsset['kind'];

export const MEDIA_STATUSES: MediaStatus[] = ['quarantined', 'ready', 'rejected'];

/**
 * The upload rules come from `packages/domain`, which is what the API validates
 * against. They were written out again here — the MIME list twice, the size
 * limit as a number and again as the words "10 MB" — so the browser could
 * disagree with the server about what it would accept, and did: nothing here
 * knew about the megapixel ceiling or the minimum width, so an image that broke
 * either was uploaded in full and only then refused.
 */
export { ALLOWED_IMAGE_MIME as ALLOWED_TYPES, MAX_UPLOAD_BYTES, MAX_MEGAPIXELS, MIN_DIMENSION } from '@adelaide-sphere/domain';

/** The same rules in a sentence, for the screen to say before the picker. */
export const UPLOAD_RULES = `JPEG, PNG or WebP, up to ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB and ${MAX_MEGAPIXELS} megapixels, at least ${MIN_DIMENSION}px on the shorter side.`;

/** What a document upload accepts (change log 1.16), in the words the screen uses. */
export const DOCUMENT_UPLOAD_RULES = `PDF only, up to ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB. Documents with scripts, attached files or a password are not accepted. Upload only documents from a source you trust.`;

export interface MediaListQuery {
  kind?: MediaKind;
  status?: MediaStatus;
  q?: string;
  unused?: boolean;
  page?: number;
  pageSize?: number;
}

/** Checks the file before any request, so an obviously invalid file never leaves the browser. */
export function localFileProblem(file: File): string | null {
  // `file.type` is the browser's guess from the extension, so this catches the
  // obvious cases only; the server decides from the bytes themselves.
  if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(file.type)) return 'Only JPEG, PNG and WebP images are accepted';
  if (file.size > MAX_UPLOAD_BYTES) return `Images must be ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB or smaller`;
  if (file.size === 0) return 'That file is empty';
  return null;
}

/** The same early check for a document: a PDF within the size limit (the server checks the bytes). */
export function localDocumentProblem(file: File): string | null {
  const isPdf = file.type === 'application/pdf' || (file.type === '' && /\.pdf$/i.test(file.name));
  if (!isPdf) return 'Only PDF documents are accepted';
  if (file.size > MAX_DOCUMENT_BYTES) return `Documents must be ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB or smaller`;
  if (file.size === 0) return 'That file is empty';
  return null;
}

/** A document title from its file name: "Price-list_2026.pdf" → "Price list 2026". */
export function titleFromFileName(name: string): string {
  const stem = name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (stem.charAt(0).toUpperCase() + stem.slice(1)).slice(0, 180);
}

/** SHA-256 of the file, so the server can confirm the upload arrived intact. */
export async function fileChecksum(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Media library and gallery usage (SRS MED 001–004); the API enforces `media.manage`. */
export function mediaApi(client: HttpClient = httpClient) {
  return {
    list: (query: MediaListQuery = {}, signal?: AbortSignal) => client.request<{ data: MediaAsset[]; meta: CollectionMeta }>('/admin/media', { query: enabledFilters(query), signal }).then((r) => r.data),
    get: (id: string, signal?: AbortSignal) => client.request<{ data: MediaAsset }>(`/admin/media/${encodeURIComponent(id)}`, { signal }).then((r) => r.data.data),
    requestUpload: (body: { fileName: string; contentType: string; bytes: number; title?: string }) =>
      client.request<{ data: { assetId: string; uploadUrl: string; headers: Record<string, string>; expiresInSeconds: number } }>('/admin/media/uploads', { method: 'POST', body }).then((r) => r.data.data),
    complete: (id: string, body: { checksum?: string; altText?: string | null }) => client.request<{ data: MediaAsset }>(`/admin/media/${encodeURIComponent(id)}/complete`, { method: 'POST', body }).then((r) => r.data.data),
    update: (id: string, body: Record<string, unknown> & { expectedVersion: number }) => client.request<{ data: MediaAsset }>(`/admin/media/${encodeURIComponent(id)}`, { method: 'PATCH', body }).then((r) => r.data.data),
    remove: (id: string) => client.request<undefined>(`/admin/media/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(() => undefined),
    gallery: (businessId: string, signal?: AbortSignal) => client.request<{ data: GalleryEntry[] }>(`/admin/businesses/${encodeURIComponent(businessId)}/gallery`, { signal }).then((r) => r.data.data),
    setGallery: (businessId: string, body: { expectedVersion: number; items: GalleryItem[] }) =>
      client.request<{ data: GalleryEntry[] }>(`/admin/businesses/${encodeURIComponent(businessId)}/gallery`, { method: 'PUT', body }).then((r) => r.data.data),
  };
}

/**
 * Full upload flow (SRS MED 002): ask for a signed URL, PUT the bytes straight
 * to storage, then tell the API to validate them. The API never sees the bytes.
 */
export async function uploadImage(
  file: File,
  altText: string | null,
  api = mediaApi(),
  onProgress?: (percent: number) => void,
): Promise<MediaAsset> {
  return uploadFile(file, { altText }, api, onProgress);
}

/**
 * Uploads an image (with its alt text) or a PDF document (with its title):
 * the same signed-URL flow, the server deciding which from the declared type.
 */
export async function uploadFile(
  file: File,
  meta: { altText?: string | null; title?: string },
  api = mediaApi(),
  /**
   * Called with 0–100 as the bytes go up. The browser only reports progress on
   * an upload through XMLHttpRequest — `fetch` has no equivalent — which is the
   * one reason this is not a `fetch` call.
   */
  onProgress?: (percent: number) => void,
): Promise<MediaAsset> {
  // Some systems report no type for a PDF; the extension is enough to ask, and the server checks the bytes.
  const contentType = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : file.type);
  const noun = contentType === 'application/pdf' ? 'document' : 'image';
  const ticket = await api.requestUpload({ fileName: file.name, contentType, bytes: file.size, ...(meta.title !== undefined ? { title: meta.title } : {}) });

  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', ticket.uploadUrl);
    for (const [header, value] of Object.entries(ticket.headers)) request.setRequestHeader(header, value);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('load', () => {
      // The storage service answers directly; its status is all we report, never
      // its body, which can carry the signed request back at us.
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`The ${noun} could not be uploaded. Please try again.`));
    });
    request.addEventListener('error', () => reject(new Error(`The ${noun} could not be uploaded. Check your connection and try again.`)));
    request.addEventListener('abort', () => reject(new Error('The upload was cancelled.')));
    request.send(file);
  });

  onProgress?.(100);
  return api.complete(ticket.assetId, { checksum: await fileChecksum(file), ...(meta.altText !== undefined ? { altText: meta.altText } : {}) });
}

/** Smallest variant at or above the requested width, for previews. */
export function variantUrl(asset: Pick<MediaAsset, 'variants'>, minWidth = 320): string | null {
  const sorted = [...asset.variants].sort((a, b) => a.width - b.width);
  return (sorted.find((variant) => variant.width >= minWidth) ?? sorted.at(-1))?.url ?? null;
}
