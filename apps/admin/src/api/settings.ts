import type { PageSection } from '@adelaide-sphere/domain/page-sections';
import type { components } from '@adelaide-sphere/contracts';
import { httpClient, type HttpClient } from './http-client';
import { queryParams } from './query';

export type HomeSettings = components['schemas']['HomeSettingsRecordDto'];
export type UpdateHomeSettings = components['schemas']['UpdateHomeSettingsDto'];

export const MIN_HERO_PHRASES = 2;
export const MAX_HERO_PHRASES = 5;

/** Site settings (SRS CFG 001); `settings.manage` is enforced by the API. */
export function settingsApi(client: HttpClient = httpClient) {
  return {
    getHome: (signal?: AbortSignal) => client.request<{ data: HomeSettings }>('/admin/settings/home', { signal }).then((r) => r.data.data),
    putHome: (body: UpdateHomeSettings) => client.request<{ data: HomeSettings }>('/admin/settings/home', { method: 'PUT', body }).then((r) => r.data.data),
  };
}

export type SeoSettings = components['schemas']['SeoSettingsRecordDto'];
export type UpdateSeoSettings = components['schemas']['UpdateSeoSettingsDto'];

/** Search metadata for routes with no record of their own (SRS SEO 001). */
export function seoSettingsApi(client: HttpClient = httpClient) {
  return {
    get: (signal?: AbortSignal) => client.request<{ data: SeoSettings }>('/admin/settings/seo', { signal }).then((r) => r.data.data),
    put: (body: UpdateSeoSettings) => client.request<{ data: SeoSettings }>('/admin/settings/seo', { method: 'PUT', body }).then((r) => r.data.data),
  };
}

export type GeneralSettings = components['schemas']['GeneralSettingsRecordDto'];
export type UpdateGeneralSettings = components['schemas']['UpdateGeneralSettingsDto'];

/** Social platforms the general settings accept, in the order the public shell renders them. */
export const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'x', 'youtube', 'pinterest'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** General settings (SRS CFG 001); `settings.manage` is enforced by the API. */
export function generalSettingsApi(client: HttpClient = httpClient) {
  return {
    get: (signal?: AbortSignal) => client.request<{ data: GeneralSettings }>('/admin/settings/general', { signal }).then((r) => r.data.data),
    put: (body: UpdateGeneralSettings) => client.request<{ data: GeneralSettings }>('/admin/settings/general', { method: 'PUT', body }).then((r) => r.data.data),
  };
}

export type StaticPage = components['schemas']['StaticPageDto'];
export type StaticPageReferences = components['schemas']['StaticPageReferencesDto'];
export type StaticPageRevision = components['schemas']['StaticPageRevisionDto'];
export type StaticPageRevisionDetail = components['schemas']['StaticPageRevisionDetailDto'];
export type StaticPageAutosave = components['schemas']['StaticPageAutosaveDto'];

export interface CreateStaticPage {
  /** Public address; the API refuses reserved and taken ones. */
  slug: string;
  title: string;
  /** The page as one body; ignored when `sections` is sent. */
  body?: string;
  /** The page's sections (change log 1.17), validated and sanitised by the API. */
  sections?: PageSection[];
  noindex?: boolean;
  bodyFormat?: 'html' | 'markdown';
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string | null;
  /** A processed media asset; the API refuses one that is not ready. */
  ogImageMediaId?: string | null;
  layout?: StaticPage['layout'];
}

export interface UpdateStaticPage {
  expectedVersion: number;
  title: string;
  body?: string;
  sections?: PageSection[];
  noindex?: boolean;
  seoKeywords?: string | null;
  ogImageMediaId?: string | null;
  bodyFormat?: 'html' | 'markdown';
  seoTitle?: string | null;
  seoDescription?: string | null;
  /** Omitted by a form that does not offer the choice; the API then keeps what the page has. */
  layout?: StaticPage['layout'];
  revisionReason?: string;
}

/** Information pages (SRS CFG 002); the API enforces the `website.pages.*` permissions. */
export function pagesApi(client: HttpClient = httpClient) {
  return {
    list: (query: { q?: string; status?: StaticPage['status'] } = {}, signal?: AbortSignal) =>
      client.request<{ data: StaticPage[] }>('/admin/pages', { query: queryParams(query), signal }).then((r) => r.data.data),
    get: (slug: string, signal?: AbortSignal) => client.request<{ data: StaticPage }>(`/admin/pages/${encodeURIComponent(slug)}`, { signal }).then((r) => r.data.data),
    create: (body: CreateStaticPage) => client.request<{ data: StaticPage }>('/admin/pages', { method: 'POST', body }).then((r) => r.data.data),
    remove: (slug: string) => client.request<void>(`/admin/pages/${encodeURIComponent(slug)}`, { method: 'DELETE' }).then(() => undefined),
    save: (slug: string, body: UpdateStaticPage) => client.request<{ data: StaticPage }>(`/admin/pages/${encodeURIComponent(slug)}`, { method: 'PUT', body }).then((r) => r.data.data),
    setStatus: (slug: string, action: 'publish' | 'unpublish', body: { expectedVersion: number; reason?: string }) =>
      client.request<{ data: StaticPage }>(`/admin/pages/${encodeURIComponent(slug)}/${action}`, { method: 'POST', body }).then((r) => r.data.data),
    /** Publishes at a future time (UTC instant); the same checks run now and when the time comes. */
    schedule: (slug: string, body: { expectedVersion: number; scheduledAt: string; reason?: string }) =>
      client.request<{ data: StaticPage }>(`/admin/pages/${encodeURIComponent(slug)}/schedule`, { method: 'POST', body }).then((r) => r.data.data),
    unschedule: (slug: string, body: { expectedVersion: number; reason?: string }) =>
      client.request<{ data: StaticPage }>(`/admin/pages/${encodeURIComponent(slug)}/unschedule`, { method: 'POST', body }).then((r) => r.data.data),
    /** Moves a custom page; a published one leaves a permanent redirect from its old address. */
    changeAddress: (slug: string, body: { slug: string; expectedVersion: number; reason?: string }) =>
      client.request<{ data: StaticPage }>(`/admin/pages/${encodeURIComponent(slug)}/address`, { method: 'POST', body }).then((r) => r.data.data),
    duplicate: (slug: string, body: { slug: string; title: string }) =>
      client.request<{ data: StaticPage }>(`/admin/pages/${encodeURIComponent(slug)}/duplicate`, { method: 'POST', body }).then((r) => r.data.data),
    /** A private ten-minute link to the page in the public design, with the caller's kept unsaved changes. */
    createPreviewLink: (slug: string) => client.request<{ data: { path: string; expiresAt: string } }>(`/admin/pages/${encodeURIComponent(slug)}/preview-link`, { method: 'POST', body: {} }).then((r) => r.data.data),
    listRevisions: (slug: string, signal?: AbortSignal) => client.request<{ data: StaticPageRevision[] }>(`/admin/pages/${encodeURIComponent(slug)}/revisions`, { signal }).then((r) => r.data.data),
    getRevision: (slug: string, revisionId: string, signal?: AbortSignal) =>
      client.request<{ data: StaticPageRevisionDetail }>(`/admin/pages/${encodeURIComponent(slug)}/revisions/${encodeURIComponent(revisionId)}`, { signal }).then((r) => r.data.data),
    restoreRevision: (slug: string, revisionId: string, expectedVersion: number) =>
      client.request<{ data: StaticPage }>(`/admin/pages/${encodeURIComponent(slug)}/revisions/${encodeURIComponent(revisionId)}/restore`, { method: 'POST', body: { expectedVersion } }).then((r) => r.data.data),
    getAutosave: (slug: string, signal?: AbortSignal) => client.request<{ data: StaticPageAutosave | null }>(`/admin/pages/${encodeURIComponent(slug)}/autosave`, { signal }).then((r) => r.data.data),
    saveAutosave: (slug: string, body: { title: string; sections: PageSection[]; baseVersion: number }) =>
      client.request<{ data: { savedAt: string } }>(`/admin/pages/${encodeURIComponent(slug)}/autosave`, { method: 'PUT', body }).then((r) => r.data.data),
    discardAutosave: (slug: string) => client.request<void>(`/admin/pages/${encodeURIComponent(slug)}/autosave`, { method: 'DELETE' }).then(() => undefined),
  };
}
