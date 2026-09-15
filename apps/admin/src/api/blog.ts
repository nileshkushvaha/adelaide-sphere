import type { components } from '@adelaide-sphere/contracts';
import { httpClient, type HttpClient } from './http-client';
import { queryParams } from './query';
import type { CollectionMeta } from './admins';

export type Author = components['schemas']['AuthorDto'];
export type BlogTerm = components['schemas']['BlogTermDto'];
export type Post = components['schemas']['PostDto'];
export type PostSummary = components['schemas']['PostSummaryDto'];
export type DefaultAuthor = components['schemas']['DefaultAuthorDto'];
export type RenderedPostPreview = components['schemas']['RenderedPostPreviewDto'];
export type PostRevision = components['schemas']['PostRevisionDto'];
export type PostRevisionDetail = components['schemas']['PostRevisionDetailDto'];
export type PostAutosave = components['schemas']['PostAutosaveDto'];
export type PostStatus = PostSummary['status'];
export type PostAction = 'publish' | 'schedule' | 'unpublish' | 'archive' | 'restore';
export type BlogTermKind = 'blog-categories' | 'blog-tags';

export const POST_STATUSES: PostStatus[] = ['draft', 'scheduled', 'published', 'archived'];

export interface BlogTermListQuery {
  q?: string;
  status?: 'active' | 'inactive';
}

export interface PostListQuery {
  status?: PostStatus;
  categoryId?: string;
  tagId?: string;
  authorId?: string;
  q?: string;
  sort?: 'updatedAt' | 'publishedAt' | 'scheduledAt' | 'title';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/** Editorial API (SRS BLOG 001–003); the API enforces `posts.write` and `posts.publish`. */
export function blogApi(client: HttpClient = httpClient) {
  return {
    listPosts: (query: PostListQuery = {}, signal?: AbortSignal) => client.request<{ data: PostSummary[]; meta: CollectionMeta }>('/admin/posts', { query: queryParams(query), signal }).then((r) => r.data),
    getPost: (id: string, signal?: AbortSignal) => client.request<{ data: Post }>(`/admin/posts/${encodeURIComponent(id)}`, { signal }).then((r) => r.data.data),
    /**
     * The server's own rendering of the saved draft, including the author and
     * category as a reader would see them. Never indexable (SRS BLOG 003).
     */
    previewPost: (id: string, signal?: AbortSignal) =>
      client
        .request<{ data: { id: string; title: string; excerpt: string; sanitizedBody: string; authorName: string; categoryName: string; status: string; noindex: boolean } }>(
          `/admin/posts/${encodeURIComponent(id)}/preview`,
          { signal },
        )
        .then((r) => r.data.data),
    /** Renders unsaved content exactly as a save would, without storing it. */
    renderPreview: (body: Record<string, unknown>, signal?: AbortSignal) =>
      client.request<{ data: RenderedPostPreview }>('/admin/posts/preview-render', { method: 'POST', body, signal }).then((r) => r.data.data),
    /** A private ten-minute link to the saved article on the public site. */
    createPreviewLink: (id: string) => client.request<{ data: { path: string; expiresAt: string } }>(`/admin/posts/${encodeURIComponent(id)}/preview-link`, { method: 'POST', body: {} }).then((r) => r.data.data),
    /** Pages, articles, categories, areas and published businesses to link to or show as a card. */
    searchLinks: (type: 'page' | 'post' | 'blog_category' | 'blog_tag' | 'business_category' | 'area' | 'business', q: string, signal?: AbortSignal) =>
      client
        .request<{ data: { id: string; title: string; href: string; state: string; hint: string | null }[] }>('/admin/editor/link-sources', { query: queryParams({ type, q: q || undefined, pageSize: 10 }), signal })
        .then((r) => r.data.data),
    listRevisions: (id: string, signal?: AbortSignal) => client.request<{ data: PostRevision[] }>(`/admin/posts/${encodeURIComponent(id)}/revisions`, { signal }).then((r) => r.data.data),
    getRevision: (id: string, revisionId: string, signal?: AbortSignal) =>
      client.request<{ data: PostRevisionDetail }>(`/admin/posts/${encodeURIComponent(id)}/revisions/${encodeURIComponent(revisionId)}`, { signal }).then((r) => r.data.data),
    restoreRevision: (id: string, revisionId: string, expectedVersion: number) =>
      client.request<{ data: Post }>(`/admin/posts/${encodeURIComponent(id)}/revisions/${encodeURIComponent(revisionId)}/restore`, { method: 'POST', body: { expectedVersion } }).then((r) => r.data.data),
    /** The signed-in editor's own unsaved work on an article, or null. */
    getAutosave: (id: string, signal?: AbortSignal) => client.request<{ data: PostAutosave | null }>(`/admin/posts/${encodeURIComponent(id)}/autosave`, { signal }).then((r) => r.data.data),
    saveAutosave: (id: string, body: { title: string; excerpt: string; bodyMarkdown: string; bodyFormat: 'html' | 'markdown'; baseVersion: number }) =>
      client.request<{ data: { savedAt: string } }>(`/admin/posts/${encodeURIComponent(id)}/autosave`, { method: 'PUT', body }).then((r) => r.data.data),
    discardAutosave: (id: string) => client.request(`/admin/posts/${encodeURIComponent(id)}/autosave`, { method: 'DELETE' }).then(() => undefined),
    createPost: (body: Record<string, unknown>) => client.request<{ data: Post }>('/admin/posts', { method: 'POST', body }).then((r) => r.data.data),
    updatePost: (id: string, body: Record<string, unknown> & { expectedVersion: number }) => client.request<{ data: Post }>(`/admin/posts/${encodeURIComponent(id)}`, { method: 'PATCH', body }).then((r) => r.data.data),
    transition: (id: string, action: PostAction, body: Record<string, unknown> & { expectedVersion: number }) =>
      client.request<{ data: Post }>(`/admin/posts/${encodeURIComponent(id)}/${action}`, { method: 'POST', body }).then((r) => r.data.data),
    /** Features a published article on the home page and blog index, or stops featuring it (at most three at once). */
    setFeatured: (id: string, featured: boolean, expectedVersion: number) =>
      client.request<{ data: Post }>(`/admin/posts/${encodeURIComponent(id)}/${featured ? 'feature' : 'unfeature'}`, { method: 'POST', body: { expectedVersion } }).then((r) => r.data.data),
    changePostSlug: (id: string, body: { slug: string; expectedVersion: number; reason?: string }) =>
      client.request<{ data: Post }>(`/admin/posts/${encodeURIComponent(id)}/slug`, { method: 'POST', body }).then((r) => r.data.data),
    /** The signed-in administrator's default author for new articles. */
    getMyAuthor: (signal?: AbortSignal) => client.request<{ data: DefaultAuthor }>('/admin/authors/mine', { signal }).then((r) => r.data.data),
    setMyAuthor: (authorId: string | null) => client.request<{ data: DefaultAuthor }>('/admin/authors/mine', { method: 'PUT', body: { authorId } }).then((r) => r.data.data),
    getAuthor: (id: string, signal?: AbortSignal) => client.request<{ data: Author }>(`/admin/authors/${encodeURIComponent(id)}`, { signal }).then((r) => r.data.data),
    listAuthors: (query: BlogTermListQuery = {}, signal?: AbortSignal) =>
      client.request<{ data: Author[] }>('/admin/authors', { query: queryParams(query), signal }).then((r) => r.data.data),
    createAuthor: (body: Record<string, unknown>) => client.request<{ data: Author }>('/admin/authors', { method: 'POST', body }).then((r) => r.data.data),
    updateAuthor: (id: string, body: Record<string, unknown> & { expectedVersion: number }) => client.request<{ data: Author }>(`/admin/authors/${encodeURIComponent(id)}`, { method: 'PATCH', body }).then((r) => r.data.data),
    setAuthorActive: (id: string, active: boolean, expectedVersion: number) =>
      client.request<{ data: Author }>(`/admin/authors/${encodeURIComponent(id)}/${active ? 'activate' : 'deactivate'}`, { method: 'POST', body: { expectedVersion } }).then((r) => r.data.data),
    listTerms: (kind: BlogTermKind, query: BlogTermListQuery = {}, signal?: AbortSignal) =>
      client.request<{ data: BlogTerm[] }>(`/admin/${kind}`, { query: queryParams(query), signal }).then((r) => r.data.data),
    createTerm: (kind: BlogTermKind, body: Record<string, unknown>) => client.request<{ data: BlogTerm }>(`/admin/${kind}`, { method: 'POST', body }).then((r) => r.data.data),
    updateTerm: (kind: BlogTermKind, id: string, body: Record<string, unknown> & { expectedVersion: number }) =>
      client.request<{ data: BlogTerm }>(`/admin/${kind}/${encodeURIComponent(id)}`, { method: 'PATCH', body }).then((r) => r.data.data),
    setTermActive: (kind: BlogTermKind, id: string, active: boolean, expectedVersion: number) =>
      client.request<{ data: BlogTerm }>(`/admin/${kind}/${encodeURIComponent(id)}/${active ? 'activate' : 'deactivate'}`, { method: 'POST', body: { expectedVersion } }).then((r) => r.data.data),
  };
}

/** Adelaide-time helpers for the schedule picker (SRS BLOG 002: admins choose local time, the API stores UTC). */
const ADELAIDE = 'Australia/Adelaide';

export function adelaideOffsetLabel(instant: Date): string {
  const name = new Intl.DateTimeFormat('en-AU', { timeZone: ADELAIDE, timeZoneName: 'short' }).formatToParts(instant).find((p) => p.type === 'timeZoneName')?.value;
  return name ?? 'ACST';
}

/** Converts a `YYYY-MM-DDTHH:mm` value the admin typed (Adelaide time) into a UTC instant. */
export function adelaideLocalToUtc(local: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as unknown as number[];
  const wall = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  // Two candidate offsets bracket every DST change; pick the one that round-trips.
  for (const probe of [wall - 86_400_000, wall + 86_400_000]) {
    const offset = adelaideOffsetMinutes(new Date(probe));
    const instant = wall - offset * 60_000;
    if (adelaideOffsetMinutes(new Date(instant)) === offset) return new Date(instant);
  }
  return new Date(wall - adelaideOffsetMinutes(new Date(wall)) * 60_000);
}

/** Formats a UTC instant as the `YYYY-MM-DDTHH:mm` the picker shows. */
export function utcToAdelaideLocal(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ADELAIDE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function adelaideOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ADELAIDE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}
