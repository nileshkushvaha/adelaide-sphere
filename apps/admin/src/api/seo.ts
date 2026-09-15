import type { components } from '@adelaide-sphere/contracts';
import { httpClient, type HttpClient } from './http-client';
import { queryParams } from './query';
import type { CollectionMeta } from './admins';

export type Redirect = components['schemas']['RedirectDto'];
export type RedirectKind = Redirect['kind'];
export type RedirectPreview = components['schemas']['RedirectPreviewDto'];

export interface RedirectListQuery {
  q?: string;
  kind?: RedirectKind;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

/** What each kind does, in the words an administrator uses, beside the code. */
export const REDIRECT_KIND_LABELS: Record<RedirectKind, string> = {
  permanent: 'Moved for good (301)',
  temporary: 'Moved for now (302)',
  gone: 'Removed (410)',
};

/** Redirect administration (SRS SEO 004); the API enforces `redirects.manage`. */
export function seoApi(client: HttpClient = httpClient) {
  return {
    list: (query: RedirectListQuery = {}, signal?: AbortSignal) =>
      client.request<{ data: Redirect[]; meta: CollectionMeta }>('/admin/redirects', { query: queryParams(query), signal }).then((r) => r.data),
    create: (body: { sourcePath: string; targetPath?: string | null; kind?: RedirectKind; reason?: string }) =>
      client.request<{ data: Redirect }>('/admin/redirects', { method: 'POST', body }).then((r) => r.data.data),
    remove: (id: string) => client.request<void>(`/admin/redirects/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(() => undefined),
    /**
     * What a path does right now. The admin route, not the public one: that is
     * cached for the very person who just changed the rule, and it cannot tell
     * "switched off" from "no rule at all".
     */
    preview: (path: string, signal?: AbortSignal) =>
      client.request<{ data: RedirectPreview }>('/admin/redirects/resolve', { query: { path }, signal }).then((r) => r.data.data),
    setActive: (id: string, active: boolean, reason?: string) =>
      client
        .request<{ data: Redirect }>(`/admin/redirects/${encodeURIComponent(id)}/${active ? 'activate' : 'deactivate'}`, { method: 'POST', body: { reason } })
        .then((r) => r.data.data),
  };
}
