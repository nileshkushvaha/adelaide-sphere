import type { components } from '@adelaide-sphere/contracts';
import { httpClient, type HttpClient } from './http-client';

/** Types come from the generated OpenAPI contract (packages/contracts), so drift fails typecheck. */
export type AdminSummary = components['schemas']['AdminSummaryDto'];
export type SessionSummary = components['schemas']['SessionSummaryDto'];
export type Authenticated = components['schemas']['AuthenticatedDto'];

interface Envelope<T> {
  data: T;
}

/**
 * Admin auth endpoints. The session lives in an HttpOnly cookie set by the API;
 * nothing is stored in web storage and no token is ever visible to JavaScript.
 */
export type LoginChallenge = components['schemas']['LoginChallengeDto'];
export type LoginOutcome = { kind: 'session'; value: Authenticated } | { kind: 'challenge'; value: LoginChallenge };

export const authApi = {
  /** 200 → session established; 202 → second factor required (SRS AUTH 003). */
  login(email: string, password: string, client: HttpClient = httpClient): Promise<LoginOutcome> {
    return client.request<Envelope<Authenticated | LoginChallenge>>('/admin/auth/login', { method: 'POST', body: { email, password } }).then((r) =>
      r.status === 202 ? { kind: 'challenge', value: r.data.data as LoginChallenge } : { kind: 'session', value: r.data.data as Authenticated },
    );
  },
  me(signal?: AbortSignal, client: HttpClient = httpClient) {
    return client.request<Envelope<Authenticated>>('/admin/auth/me', { signal }).then((r) => r.data.data);
  },
  logout(client: HttpClient = httpClient) {
    return client.request<void>('/admin/auth/logout', { method: 'POST' }).then(() => undefined);
  },
  forgotPassword(email: string, client: HttpClient = httpClient) {
    return client.request<Envelope<{ accepted: true }>>('/admin/auth/forgot-password', { method: 'POST', body: { email } }).then(() => undefined);
  },
  resetPassword(token: string, newPassword: string, client: HttpClient = httpClient) {
    return client.request<void>('/admin/auth/reset-password', { method: 'POST', body: { token, newPassword } }).then(() => undefined);
  },
};
