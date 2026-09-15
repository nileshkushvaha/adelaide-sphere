import type { components } from '@adelaide-sphere/contracts';
import { httpClient, type HttpClient } from './http-client';
import { queryParams } from './query';
import type { CollectionMeta } from './admins';

export type AdminEnquiry = components['schemas']['AdminEnquiryDto'];
export type HandlingStatus = AdminEnquiry['handlingStatus'];
export type DeliveryStatus = AdminEnquiry['deliveryStatus'];

export const HANDLING_STATUSES: HandlingStatus[] = ['new', 'inProgress', 'closed'];
export const DELIVERY_STATUSES: DeliveryStatus[] = ['queued', 'providerAccepted', 'delivered', 'retrying', 'failed', 'suppressed'];

export interface EnquiryListQuery {
  handlingStatus?: HandlingStatus;
  deliveryStatus?: DeliveryStatus;
  businessId?: string;
  page?: number;
  pageSize?: number;
}

/** Enquiry handling (SRS ENQ 007); the API enforces `enquiries.read` and `enquiries.manage`. */
export function enquiriesApi(client: HttpClient = httpClient) {
  return {
    revealContact: (id: string) => client.request<{ data: { email: string; phone: string | null } }>(`/admin/enquiries/${encodeURIComponent(id)}/contact`).then((r) => r.data.data),
    list: (query: EnquiryListQuery = {}, signal?: AbortSignal) => client.request<{ data: AdminEnquiry[]; meta: CollectionMeta }>('/admin/enquiries', { query: queryParams(query), signal }).then((r) => r.data),
    setHandling: (id: string, body: { expectedVersion: number; handlingStatus: HandlingStatus }) =>
      client.request<{ data: AdminEnquiry }>(`/admin/enquiries/${encodeURIComponent(id)}`, { method: 'PATCH', body }).then((r) => r.data.data),
    retry: (id: string, body: { expectedVersion: number; reason: string }) =>
      client.request<{ data: AdminEnquiry }>(`/admin/enquiries/${encodeURIComponent(id)}/retry`, { method: 'POST', body }).then((r) => r.data.data),
  };
}
