import type { components } from '@adelaide-sphere/contracts';
import { httpClient, type HttpClient } from './http-client';
import { queryParams } from './query';
import type { CollectionMeta } from './admins';

export type CategoryItem = components['schemas']['CategoryDto'];
export type ServiceItem = components['schemas']['ServiceDto'];
export type LocalAreaItem = components['schemas']['LocalAreaDto'];
/**
 * List rows carry two things the record itself does not: how many listings use
 * the term, and (for a category) the parent's name rather than its id.
 */
export type CategoryListItem = components['schemas']['CategoryListItemDto'];
export type ServiceListItem = components['schemas']['ServiceListItemDto'];
export type LocalAreaListItem = components['schemas']['LocalAreaListItemDto'];
export type TermListItem = CategoryListItem | ServiceListItem | LocalAreaListItem;
export type TermKind = 'categories' | 'services' | 'areas';
export type TermItem = CategoryItem | ServiceItem | LocalAreaItem;

export interface TermListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: 'active' | 'inactive';
  /** Comma-separated ids: only these terms, whatever their status (at most 50). */
  ids?: string;
  /** Categories only: top-level ones, the possible parents. */
  topLevel?: boolean;
  sort?: 'name' | 'slug' | 'sortOrder' | 'createdAt' | 'updatedAt';
  order?: 'asc' | 'desc';
}

/** Typed access to the three taxonomy resources (same list contract for each). */
export function taxonomyApi<T extends TermItem>(kind: TermKind, client: HttpClient = httpClient) {
  const base = `/admin/${kind}`;
  return {
    list: (query: TermListQuery = {}) => client.request<{ data: TermListItem[]; meta: CollectionMeta }>(base, { query: queryParams(query) }).then((r) => r.data),
    get: (id: string) => client.request<{ data: T }>(`${base}/${encodeURIComponent(id)}`).then((r) => r.data.data),
    create: (body: Record<string, unknown>) => client.request<{ data: T }>(base, { method: 'POST', body }).then((r) => r.data.data),
    update: (id: string, body: Record<string, unknown> & { expectedVersion: number }) => client.request<{ data: T }>(`${base}/${encodeURIComponent(id)}`, { method: 'PATCH', body }).then((r) => r.data.data),
    setActive: (id: string, active: boolean, expectedVersion: number, reason?: string) =>
      client.request<{ data: T }>(`${base}/${encodeURIComponent(id)}/${active ? 'activate' : 'deactivate'}`, { method: 'POST', body: { expectedVersion, reason } }).then((r) => r.data.data),
  };
}
