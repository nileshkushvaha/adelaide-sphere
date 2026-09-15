import type { MenuItemStyle, MenuItemType, MenuLocationKey } from '@adelaide-sphere/domain/menus';
import { httpClient, type HttpClient } from './http-client';
import { queryParams } from './query';
import type { CollectionMeta } from './admins';

/**
 * Navigation menus (SRS 1.9 MENU 001–006). A menu is loaded and saved as a
 * whole tree with the version it was read at; the server re-checks every rule
 * and every link, so nothing here is trusted beyond showing the editor early.
 */
export type MenuSourceState = 'ok' | 'unpublished' | 'scheduled' | 'inactive' | 'missing';

export interface MenuItemSource {
  state: MenuSourceState;
  title: string | null;
  href: string | null;
}

export interface MenuItemRecord {
  key: string;
  parentKey: string | null;
  type: MenuItemType;
  refId: string | null;
  routeKey: string | null;
  url: string | null;
  label: string | null;
  titleAttribute: string | null;
  description: string | null;
  icon: string | null;
  style: MenuItemStyle;
  openInNewTab: boolean;
  relNofollow: boolean;
  source: MenuItemSource;
}

export type MenuItemInput = Omit<MenuItemRecord, 'source'>;

export interface MenuSummary {
  id: string;
  name: string;
  version: number;
  itemCount: number;
  locations: MenuLocationKey[];
  updatedAt: string;
}

export interface MenuDetail extends MenuSummary {
  items: MenuItemRecord[];
}

export interface MenuLocationRow {
  location: MenuLocationKey;
  label: string;
  description: string;
  maxDepth: number;
  menuId: string | null;
  menuName: string | null;
  version: number;
  updatedAt: string;
}

export type MenuLinkSourceType = 'route' | 'page' | 'post' | 'blog_category' | 'blog_tag' | 'business_category' | 'area' | 'business' | 'document';

export interface MenuLinkSource {
  /** A record id, or a route key for `route`. */
  id: string;
  title: string;
  href: string;
  state: MenuSourceState;
  hint: string | null;
}

export interface MenuLinkSourceQuery {
  type: MenuLinkSourceType;
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: 'recent' | 'title';
}

export const menusApi = {
  /** Every menu, page by page, so the menu chooser and location assignment can offer all of them. */
  async list(client: HttpClient = httpClient) {
    const all: MenuSummary[] = [];
    for (let page = 1; ; page += 1) {
      const result = await client.request<{ data: MenuSummary[]; meta: CollectionMeta }>('/admin/menus', { query: { page, pageSize: 50 } }).then((r) => r.data);
      all.push(...result.data);
      if (page >= result.meta.pageCount || result.data.length === 0) return all;
    }
  },
  get(id: string, client: HttpClient = httpClient) {
    return client.request<{ data: MenuDetail }>(`/admin/menus/${encodeURIComponent(id)}`).then((r) => r.data.data);
  },
  create(name: string, client: HttpClient = httpClient) {
    return client.request<{ data: MenuDetail }>('/admin/menus', { method: 'POST', body: { name } }).then((r) => r.data.data);
  },
  save(id: string, input: { name: string; expectedVersion: number; items: MenuItemInput[] }, client: HttpClient = httpClient) {
    return client.request<{ data: MenuDetail }>(`/admin/menus/${encodeURIComponent(id)}`, { method: 'PUT', body: input }).then((r) => r.data.data);
  },
  remove(id: string, client: HttpClient = httpClient) {
    return client.request(`/admin/menus/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(() => undefined);
  },
  locations(client: HttpClient = httpClient) {
    return client.request<{ data: MenuLocationRow[] }>('/admin/menus/locations').then((r) => r.data.data);
  },
  assignLocation(location: MenuLocationKey, input: { menuId: string | null; expectedVersion: number }, client: HttpClient = httpClient) {
    return client.request<{ data: MenuLocationRow[] }>(`/admin/menus/locations/${location}`, { method: 'PUT', body: input }).then((r) => r.data.data);
  },
  linkSources(query: MenuLinkSourceQuery, signal?: AbortSignal, client: HttpClient = httpClient) {
    return client
      .request<{ data: MenuLinkSource[]; meta: CollectionMeta }>('/admin/menus/link-sources', { query: queryParams({ pageSize: 10, sort: 'title', ...query }), signal })
      .then((r) => r.data);
  },
};
