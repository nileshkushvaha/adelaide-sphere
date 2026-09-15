import type { components } from '@adelaide-sphere/contracts';
import { httpClient, type HttpClient } from './http-client';

export type BusinessRecord = components['schemas']['BusinessDto'];
/** A listing as the public site shows it on a card: image, category, area, rating. */
export type PublicBusinessCard = components['schemas']['PublicBusinessDetailDto'];
export type BusinessListItem = components['schemas']['BusinessListItemDto'];
export type BusinessStatus = BusinessRecord['status'];
export type CreateBusinessInput = components['schemas']['CreateBusinessDto'];
export type UpdateBusinessInput = components['schemas']['UpdateBusinessDto'];
export type BusinessAction = 'publish' | 'unpublish' | 'archive' | 'restore';
export type BusinessLink = components['schemas']['BusinessLinkDto'];
export type BusinessLinkInput = components['schemas']['BusinessLinkInputDto'];
export type HoursRecord = components['schemas']['HoursDto'];
export type PutHoursInput = components['schemas']['PutHoursDto'];
export type WeeklyHours = components['schemas']['WeeklyHoursDto'];
export type DayHours = components['schemas']['DayHoursDto'];
export type HoursInterval = components['schemas']['HoursIntervalDto'];
export type HoursException = components['schemas']['HoursExceptionDto'];

export const LINK_KINDS = ['facebook', 'instagram', 'x', 'linkedin', 'youtube', 'tiktok', 'pinterest', 'other'] as const;
export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

/** Converts an API field path such as `weekly.monday.intervals.1.start` into an antd name path. */
export function toNamePath(path: string): (string | number)[] {
  return path.split('.').map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));
}

export interface BusinessActionInput {
  expectedVersion: number;
  reason?: string;
  duplicateOverrideReason?: string;
}

/** Actions allowed from each status (mirrors the API's transition table, SRS BUS 006). */
export const ACTIONS_BY_STATUS: Record<BusinessStatus, BusinessAction[]> = {
  draft: ['publish', 'archive'],
  published: ['unpublish', 'archive'],
  archived: ['restore'],
};

const BASE = '/admin/businesses';

/** Mutations for business listings; reads go through the Refine data provider. */
export function businessesApi(client: HttpClient = httpClient) {
  const path = (id: string, suffix = '') => `${BASE}/${encodeURIComponent(id)}${suffix}`;
  return {
    list: (query: { status?: BusinessStatus; q?: string; page?: number; pageSize?: number; sort?: string; order?: 'asc' | 'desc' } = {}, signal?: AbortSignal) =>
      client
        .request<{ data: BusinessListItem[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }>(BASE, {
          query: Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== '')),
          signal,
        })
        .then((r) => r.data),
    /** One listing by id; filters use it to name the business they are set to. */
    get: (id: string, signal?: AbortSignal) => client.request<{ data: BusinessRecord }>(path(id), { signal }).then((r) => r.data.data),
    create: (body: CreateBusinessInput) => client.request<{ data: BusinessRecord }>(BASE, { method: 'POST', body }).then((r) => r.data.data),
    update: (id: string, body: UpdateBusinessInput) => client.request<{ data: BusinessRecord }>(path(id), { method: 'PATCH', body }).then((r) => r.data.data),
    transition: (id: string, action: BusinessAction, body: BusinessActionInput) => client.request<{ data: BusinessRecord }>(path(id, `/${action}`), { method: 'POST', body }).then((r) => r.data.data),
    /**
     * Moves a published listing to a new public address and leaves a redirect
     * behind, so links already shared keep working (SRS SEO 004). The plain
     * update refuses a slug change once a listing has been published.
     */
    changeSlug: (id: string, body: { slug: string; expectedVersion: number; reason?: string }) =>
      client.request<{ data: BusinessRecord }>(path(id, '/slug'), { method: 'POST', body }).then((r) => r.data.data),
    /**
     * The listing as the public site will show it. Read from the public route
     * rather than the admin record because that is the card a placement puts
     * on screen: the admin record has no resolved category name, area or cover
     * image, and the point of a preview is to show what visitors get.
     */
    publicCard: (slug: string, signal?: AbortSignal) => client.request<{ data: PublicBusinessCard }>(`/businesses/${encodeURIComponent(slug)}`, { signal }).then((r) => r.data.data),
    getHours: (id: string, signal?: AbortSignal) => client.request<{ data: HoursRecord }>(path(id, '/hours'), { signal }).then((r) => r.data.data),
    putHours: (id: string, body: PutHoursInput) => client.request<{ data: HoursRecord }>(path(id, '/hours'), { method: 'PUT', body }).then((r) => r.data.data),
  };
}

export type FeaturedPlacement = components['schemas']['FeaturedPlacementDto'];

/** Manual featured placements (SRS DIR 007); the API enforces `listings.publish`. */
export function featuredApi(client: HttpClient = httpClient) {
  return {
    list: (signal?: AbortSignal) => client.request<{ data: FeaturedPlacement[] }>('/admin/featured', { signal }).then((r) => r.data.data),
    create: (body: { businessId: string; startsAt: string; endsAt?: string | null; position?: number; note?: string }) =>
      client.request<{ data: FeaturedPlacement }>('/admin/featured', { method: 'POST', body }).then((r) => r.data.data),
    update: (id: string, body: { startsAt?: string; endsAt?: string | null; position?: number; note?: string | null }) =>
      client.request<{ data: FeaturedPlacement }>(`/admin/featured/${encodeURIComponent(id)}`, { method: 'PATCH', body }).then((r) => r.data.data),
    remove: (id: string) => client.request<void>(`/admin/featured/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(() => undefined),
  };
}
