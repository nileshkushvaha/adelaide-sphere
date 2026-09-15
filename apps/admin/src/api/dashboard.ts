import type { components } from '@adelaide-sphere/contracts';
import { httpClient, type HttpClient } from './http-client';

export type Dashboard = components['schemas']['DashboardDto'];
export type DashboardMetric = components['schemas']['DashboardMetricDto'];

/** Operational overview (SRS ADM 003); the API returns only what the caller may see. */
export function dashboardApi(client: HttpClient = httpClient) {
  return {
    summary: (signal?: AbortSignal) => client.request<{ data: Dashboard }>('/admin/dashboard', { signal }).then((r) => r.data.data),
  };
}
