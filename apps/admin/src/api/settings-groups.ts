import { httpClient, type HttpClient } from './http-client';

/** One declared setting, as the server describes it (SRS 1.2 SET 002). */
export interface SettingDeclaration {
  key: string;
  label: string;
  description: string;
  type: 'boolean' | 'integer' | 'string' | 'enum' | 'email' | 'url';
  bounds: { min?: number; max?: number; values?: string[] };
  /** What the number counts; rendered beside the input so a bare number is never ambiguous. */
  unit: string | null;
  /** The limit in plain language. The requirement that fixes it stays on the server. */
  limitNote: string | null;
  default: boolean | number | string;
  visibility: 'public' | 'private';
  effect: 'runtime' | 'restart_required';
  viewPermission: string;
  updatePermission: string;
  invalidates: string[];
  /** Stated before the change is confirmed (SECS 006). */
  consequence: string | null;
}

export interface SettingGroupMetadata {
  key: 'security' | 'email' | 'operations' | 'website';
  label: string;
  description: string;
  owner: string;
  viewPermission: string;
  updatePermission: string;
  note: string | null;
  settings: SettingDeclaration[];
}

export interface SettingGroupValues {
  group: string;
  values: Record<string, boolean | number | string>;
  version: number;
  updatedAt: string;
  updatedByAdminId: string | null;
}

/**
 * The settings screens are built from the server's own declarations rather than
 * from a form written twice: the registry is the contract (SET 002), so a new
 * setting appears here as soon as the server declares it.
 */
export const settingsGroupsApi = {
  registry(client: HttpClient = httpClient) {
    return client.request<{ data: SettingGroupMetadata[] }>('/admin/settings/registry').then((r) => r.data.data);
  },
  values(group: 'security' | 'email' | 'operations', client: HttpClient = httpClient) {
    return client.request<{ data: SettingGroupValues }>(`/admin/settings/${group}`).then((r) => r.data.data);
  },
  update(group: 'security' | 'email' | 'operations', expectedVersion: number, values: Record<string, unknown>, client: HttpClient = httpClient) {
    return client.request<{ data: SettingGroupValues }>(`/admin/settings/${group}`, { method: 'PUT', body: { expectedVersion, values } }).then((r) => r.data.data);
  },
};
