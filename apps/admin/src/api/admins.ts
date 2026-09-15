import type { components } from '@adelaide-sphere/contracts';
import { httpClient, type HttpClient } from './http-client';
import { queryParams } from './query';

export type AdminListItem = components['schemas']['AdminListItemDto'];
export type SessionListItem = components['schemas']['SessionListItemDto'];
export interface CollectionMeta {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export interface AdminListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  /** Role key; matches administrators who hold that role. */
  role?: string;
  status?: 'invited' | 'active' | 'disabled';
  sort?: 'createdAt' | 'email' | 'displayName' | 'lastLoginAt' | 'status';
  order?: 'asc' | 'desc';
}

export interface AuditEntry {
  id: string;
  action: string;
  /** Derived by the server from the activity catalogue (SRS 1.2 ACT 002). */
  category?: string;
  domainLabel?: string;
  outcome?: 'success' | 'failure';
  actor: { id: string | null; email: string; displayName: string } | null;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  requestId: string | null;
  ipAddress: string | null;
  createdAt: string;
  /** Readable name of the record, where it is not private (change log 1.14). */
  targetLabel?: string | null;
  /** How many events this row stands for; 1 unless the list was grouped. */
  count?: number;
  firstAt?: string;
  lastAt?: string;
  /** Pass back as `groupKey` to list the events of a group. */
  groupKey?: string | null;
}

export interface AuditQuery {
  page?: number;
  pageSize?: number;
  action?: string;
  category?: string;
  outcome?: 'success' | 'failure';
  requestId?: string;
  actorAdminId?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
  order?: 'asc' | 'desc';
  grouped?: 'true' | 'false';
  groupKey?: string;
}

export const adminsApi = {
  list(query: AdminListQuery = {}, signal?: AbortSignal, client: HttpClient = httpClient) {
    return client.request<{ data: AdminListItem[]; meta: CollectionMeta }>('/admin/admins', { query: queryParams(query), signal }).then((r) => r.data);
  },
  get(id: string, client: HttpClient = httpClient) {
    return client.request<{ data: AdminListItem }>(`/admin/admins/${encodeURIComponent(id)}`).then((r) => r.data.data);
  },
  create(input: { email: string; displayName: string; roleKeys: string[] }, client: HttpClient = httpClient) {
    return client.request<{ data: AdminListItem }>('/admin/admins', { method: 'POST', body: input }).then((r) => r.data.data);
  },
  update(id: string, input: { expectedVersion: number; displayName?: string; roleKeys?: string[] }, client: HttpClient = httpClient) {
    return client.request<{ data: AdminListItem }>(`/admin/admins/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }).then((r) => r.data.data);
  },
  disable(id: string, input: { expectedVersion: number; reason?: string }, client: HttpClient = httpClient) {
    return client.request<{ data: AdminListItem }>(`/admin/admins/${encodeURIComponent(id)}/disable`, { method: 'POST', body: input }).then((r) => r.data.data);
  },
  enable(id: string, input: { expectedVersion: number; reason?: string }, client: HttpClient = httpClient) {
    return client.request<{ data: AdminListItem }>(`/admin/admins/${encodeURIComponent(id)}/enable`, { method: 'POST', body: input }).then((r) => r.data.data);
  },
  resendSetup(id: string, client: HttpClient = httpClient) {
    return client.request(`/admin/admins/${encodeURIComponent(id)}/resend-setup`, { method: 'POST' }).then(() => undefined);
  },
  sessions(id: string, client: HttpClient = httpClient) {
    return client.request<{ data: SessionListItem[] }>(`/admin/admins/${encodeURIComponent(id)}/sessions`).then((r) => r.data.data);
  },
  revokeSession(id: string, sessionId: string, client: HttpClient = httpClient) {
    return client.request(`/admin/admins/${encodeURIComponent(id)}/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).then(() => undefined);
  },
  revokeAllSessions(id: string, client: HttpClient = httpClient) {
    return client.request<{ data: { revoked: number } }>(`/admin/admins/${encodeURIComponent(id)}/sessions`, { method: 'DELETE' }).then((r) => r.data.data.revoked);
  },
};

export const auditApi = {
  list(query: AuditQuery = {}, signal?: AbortSignal, client: HttpClient = httpClient) {
    return client.request<{ data: AuditEntry[]; meta: CollectionMeta }>('/admin/activity', { query: queryParams(query), signal }).then((r) => r.data);
  },
  /** Events per visible area since an instant, for the area chips. */
  summary(from: string, signal?: AbortSignal, client: HttpClient = httpClient) {
    return client
      .request<{ data: { from: string; areas: Array<{ category: string; count: number }> } }>('/admin/activity/summary', { query: { from }, signal })
      .then((r) => r.data.data);
  },
};

export const accountApi = {
  changePassword(currentPassword: string, newPassword: string, client: HttpClient = httpClient) {
    return client.request('/admin/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }).then(() => undefined);
  },
  sessions(client: HttpClient = httpClient) {
    return client.request<{ data: SessionListItem[] }>('/admin/auth/sessions').then((r) => r.data.data);
  },
  revokeSession(id: string, client: HttpClient = httpClient) {
    return client.request(`/admin/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(() => undefined);
  },
  totpEnroll(currentPassword?: string, client: HttpClient = httpClient) {
    return client.request<{ data: { otpauthUri: string; secret: string } }>('/admin/auth/totp/enroll', { method: 'POST', body: currentPassword ? { currentPassword } : {} }).then((r) => r.data.data);
  },
  totpVerify(code: string, client: HttpClient = httpClient) {
    return client.request<{ data: { recoveryCodes: string[] } }>('/admin/auth/totp/verify', { method: 'POST', body: { code } }).then((r) => r.data.data.recoveryCodes);
  },
  totpDisable(input: { code: string; currentPassword?: string }, client: HttpClient = httpClient) {
    return client.request('/admin/auth/totp/disable', { method: 'POST', body: input }).then(() => undefined);
  },
  acceptSetup(token: string, password: string, client: HttpClient = httpClient) {
    return client.request('/admin/auth/accept-setup', { method: 'POST', body: { token, password } }).then(() => undefined);
  },
  totpChallenge(challenge: string, code: string, client: HttpClient = httpClient) {
    return client.request<{ data: components['schemas']['AuthenticatedDto'] }>('/admin/auth/totp/challenge', { method: 'POST', body: { challenge, code } }).then((r) => r.data.data);
  },
};
