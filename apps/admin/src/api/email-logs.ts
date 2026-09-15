import { httpClient, type HttpClient } from './http-client';
import { queryParams } from './query';
import type { CollectionMeta } from './admins';

export type EmailDeliveryStatus = 'queued' | 'sent' | 'delivered' | 'delayed' | 'failed' | 'bounced' | 'complained' | 'suppressed';

export interface EmailDelivery {
  id: string;
  provider: string;
  providerMessageId: string | null;
  templateKey: string;
  category: string;
  /** Masked, e.g. "o••••r@example.com". The address itself needs a separate permission. */
  recipient: string;
  subject: string | null;
  relatedType: string | null;
  relatedId: string | null;
  status: EmailDeliveryStatus;
  attempts: number;
  failureCode: string | null;
  failureSummary: string | null;
  requestId: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
}

export interface EmailDeliveryEvent {
  type: string;
  occurredAt: string;
  receivedAt: string;
  detail: Record<string, unknown> | null;
}

export interface EmailDeliveryDetail extends EmailDelivery {
  resentFromId: string | null;
  events: EmailDeliveryEvent[];
}

export interface EmailLogQuery {
  page?: number;
  pageSize?: number;
  status?: EmailDeliveryStatus;
  category?: string;
  templateKey?: string;
  from?: string;
  to?: string;
  search?: string;
}


export const emailLogsApi = {
  list(query: EmailLogQuery = {}, client: HttpClient = httpClient) {
    return client.request<{ data: EmailDelivery[]; meta: CollectionMeta }>('/admin/email-logs', { query: queryParams(query) }).then((r) => r.data);
  },
  detail(id: string, client: HttpClient = httpClient) {
    return client.request<{ data: EmailDeliveryDetail }>(`/admin/email-logs/${id}`).then((r) => r.data.data);
  },
  /** Every reveal is recorded on the server (SRS 1.2 MAIL 005). */
  revealRecipient(id: string, client: HttpClient = httpClient) {
    return client.request<{ data: { recipient: string } }>(`/admin/email-logs/${id}/recipient`).then((r) => r.data.data.recipient);
  },
  resend(id: string, client: HttpClient = httpClient) {
    return client.request<{ data: { id: string } }>(`/admin/email-logs/${id}/resend`, { method: 'POST', body: {} }).then((r) => r.data.data);
  },
};
