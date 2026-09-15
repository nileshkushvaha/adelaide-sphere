import { httpClient, type HttpClient } from './http-client';

/**
 * Access administration client (SRS RBAC 008). Types are declared here rather
 * than generated: these endpoints return plain projections, and the API remains
 * the authority — every call is permission-checked server-side whatever this
 * client sends.
 */
export interface PermissionCatalogEntry {
  key: string;
  label: string;
  description: string;
  /** The sidebar section. */
  module: string;
  /** The sidebar label of the screen this code belongs to. */
  menuItem: string;
  /** The matrix column: View, Create, Update, Publish, Delete or a named extra. */
  action: string;
  isActive: boolean;
  isSystem: boolean;
}

export interface RoleListItem {
  id: string;
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  isActive: boolean;
  version: number;
  adminCount: number;
  permissionCount: number;
  updatedAt: string;
}

export interface RoleRecord extends Omit<RoleListItem, 'permissionCount'> {
  permissions: string[];
}

export interface AdminAccessRecord {
  adminId: string;
  displayName: string;
  email: string;
  status: string;
  version: number;
  roles: { id: string; key: string; name: string; isActive: boolean }[];
  directPermissions: string[];
  inheritedPermissions: string[];
  effectivePermissions: string[];
  /** Where each effective permission comes from: role keys and/or 'direct'. */
  sources: Record<string, string[]>;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; pageCount: number };
}

export function authorizationApi(client: HttpClient = httpClient) {
  return {
    permissions: (signal?: AbortSignal) => client.request<{ data: PermissionCatalogEntry[] }>('/admin/permissions', { signal }).then((r) => r.data.data),

    /** Every role, page by page: pickers must be able to offer all of them. */
    listAllRoles: async (signal?: AbortSignal): Promise<Paginated<RoleListItem>> => {
      const pageSize = 50;
      let page = 1;
      let result = await client.request<Paginated<RoleListItem>>(`/admin/roles?page=${page}&pageSize=${pageSize}`, { signal }).then((r) => r.data);
      const all = [...result.data];
      while (page < result.meta.pageCount) {
        page += 1;
        result = await client.request<Paginated<RoleListItem>>(`/admin/roles?page=${page}&pageSize=${pageSize}`, { signal }).then((r) => r.data);
        all.push(...result.data);
      }
      return { ...result, data: all };
    },
    listRoles: (params: { page: number; pageSize: number; q?: string }, signal?: AbortSignal) => {
      const search = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
      if (params.q) search.set('q', params.q);
      return client.request<Paginated<RoleListItem>>(`/admin/roles?${search.toString()}`, { signal }).then((r) => r.data);
    },
    getRole: (id: string, signal?: AbortSignal) => client.request<{ data: RoleRecord }>(`/admin/roles/${id}`, { signal }).then((r) => r.data.data),
    createRole: (body: { key: string; name: string; description: string; permissions: string[] }) =>
      client.request<{ data: RoleRecord }>('/admin/roles', { method: 'POST', body }).then((r) => r.data.data),
    updateRole: (id: string, body: { name?: string; description?: string; isActive?: boolean; expectedVersion: number }) =>
      client.request<{ data: RoleRecord }>(`/admin/roles/${id}`, { method: 'PATCH', body }).then((r) => r.data.data),
    replaceRolePermissions: (id: string, body: { permissions: string[]; expectedVersion: number }) =>
      client.request<{ data: RoleRecord }>(`/admin/roles/${id}/permissions`, { method: 'PUT', body }).then((r) => r.data.data),
    deleteRole: (id: string) => client.request<void>(`/admin/roles/${id}`, { method: 'DELETE' }).then(() => undefined),

    getAdminAccess: (adminId: string, signal?: AbortSignal) =>
      client.request<{ data: AdminAccessRecord }>(`/admin/admins/${adminId}/access`, { signal }).then((r) => r.data.data),
    replaceAdminRoles: (adminId: string, body: { roleIds: string[]; expectedVersion: number }) =>
      client.request<{ data: AdminAccessRecord }>(`/admin/admins/${adminId}/roles`, { method: 'PUT', body }).then((r) => r.data.data),
    replaceAdminPermissions: (adminId: string, body: { permissions: string[]; expectedVersion: number }) =>
      client.request<{ data: AdminAccessRecord }>(`/admin/admins/${adminId}/permissions`, { method: 'PUT', body }).then((r) => r.data.data),
  };
}
