import type {
  BaseRecord,
  CreateParams,
  CreateResponse,
  CustomParams,
  CustomResponse,
  DataProvider,
  DeleteOneParams,
  DeleteOneResponse,
  GetListParams,
  GetListResponse,
  GetOneParams,
  GetOneResponse,
  UpdateParams,
  UpdateResponse,
} from '@refinedev/core';
import { API_BASE_PATH } from '@/config/app-config';
import { httpClient, type HttpClient, type HttpMethod } from './http-client';

/**
 * Thrown when Refine asks for behaviour whose REST contract does not exist yet
 * (SRS ARC 005: the provider translates to the documented contract; it must not
 * invent one). Each resource phase replaces the throw with the real mapping.
 */
export class ApiContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiContractError';
  }
}

interface SingleEnvelope<T> {
  data: T;
}

interface CollectionEnvelope<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; pageCount: number };
}

/**
 * Admin resources live under /api/v1/admin/<resource> (SRS section 16).
 * Resource names are code-defined; each path segment is encoded and dot
 * segments are rejected so a path can never escape the admin prefix.
 */
export function resourcePath(resource: string, id?: string | number): string {
  const segments = resource.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
    throw new ApiContractError(`Invalid resource name "${resource}"`);
  }
  const safeResource = segments.map(encodeURIComponent).join('/');
  return id === undefined ? `/admin/${safeResource}` : `/admin/${safeResource}/${encodeURIComponent(String(id))}`;
}

/**
 * Per-resource list contract: which sort fields the API accepts (`sort` +
 * `order`) and which Refine filter fields map to which query parameters. A
 * resource without an entry refuses sorters/filters instead of guessing.
 */
export interface ListContract {
  sortFields: readonly string[];
  /** Refine filter field → query parameter (equality or the API's own search semantics). */
  filters: Readonly<Record<string, string>>;
}

export const LIST_CONTRACTS: Readonly<Record<string, ListContract>> = {
  businesses: {
    // BUSINESS_SORT_FIELDS in apps/api/src/directory/dto/business.dto.ts. `publishedAt`
    // was listed here and is not accepted by the API: choosing it answered 400.
    sortFields: ['name', 'status', 'createdAt', 'updatedAt', 'firstPublishedAt'],
    filters: { q: 'q', status: 'status', primaryCategoryId: 'categoryId', localAreaId: 'localAreaId', featured: 'featured' },
  },
};

function listQuery(resource: string, sorters: GetListParams['sorters'], filters: GetListParams['filters']): Record<string, string | number> {
  const contract = LIST_CONTRACTS[resource];
  const query: Record<string, string | number> = {};
  if (sorters && sorters.length > 0) {
    if (!contract) throw new ApiContractError(`Sorting for "${resource}" is not defined by the API contract yet`);
    if (sorters.length > 1) throw new ApiContractError(`"${resource}" supports a single sort field`);
    const [sorter] = sorters;
    if (!contract.sortFields.includes(sorter!.field)) throw new ApiContractError(`"${resource}" cannot be sorted by "${sorter!.field}"`);
    query.sort = sorter!.field;
    query.order = sorter!.order;
  }
  for (const filter of filters ?? []) {
    if (!contract) throw new ApiContractError(`Filtering for "${resource}" is not defined by the API contract yet`);
    if (!('field' in filter)) throw new ApiContractError(`"${resource}" does not support conditional filters`);
    const param = contract.filters[filter.field];
    if (!param || (filter.operator !== 'eq' && filter.operator !== 'contains')) throw new ApiContractError(`"${resource}" cannot be filtered by "${filter.field}" (${filter.operator})`);
    if (filter.value === undefined || filter.value === null || filter.value === '') continue;
    query[param] = String(filter.value);
  }
  return query;
}

/**
 * Refine data provider for the Adelaide Sphere REST API. Only what the SRS
 * already defines is implemented: the {data} / {data, meta} envelopes, page
 * numbered pagination (`page`, `pageSize`), plain REST verbs and the per
 * resource list contracts above. Anything else is refused rather than guessed.
 */
export function createDataProvider(client: HttpClient = httpClient): Required<Pick<DataProvider, 'getList' | 'getOne' | 'create' | 'update' | 'deleteOne' | 'getApiUrl' | 'custom'>> {
  return {
    getApiUrl: () => API_BASE_PATH,

    getList: async <TData extends BaseRecord = BaseRecord>({
      resource,
      pagination,
      sorters,
      filters,
    }: GetListParams): Promise<GetListResponse<TData>> => {
      const query = {
        ...(pagination?.mode === 'off' ? {} : { page: pagination?.currentPage ?? 1, pageSize: pagination?.pageSize ?? 20 }),
        ...listQuery(resource, sorters, filters),
      };
      const response = await client.request<CollectionEnvelope<TData>>(resourcePath(resource), { query });
      return { data: response.data.data, total: response.data.meta.total };
    },

    getOne: async <TData extends BaseRecord = BaseRecord>({ resource, id }: GetOneParams): Promise<GetOneResponse<TData>> => {
      const response = await client.request<SingleEnvelope<TData>>(resourcePath(resource, id));
      return { data: response.data.data };
    },

    create: async <TData extends BaseRecord = BaseRecord, TVariables = unknown>({
      resource,
      variables,
    }: CreateParams<TVariables>): Promise<CreateResponse<TData>> => {
      const response = await client.request<SingleEnvelope<TData>>(resourcePath(resource), { method: 'POST', body: variables });
      return { data: response.data.data };
    },

    update: async <TData extends BaseRecord = BaseRecord, TVariables = unknown>({
      resource,
      id,
      variables,
    }: UpdateParams<TVariables>): Promise<UpdateResponse<TData>> => {
      const response = await client.request<SingleEnvelope<TData>>(resourcePath(resource, id), { method: 'PATCH', body: variables });
      return { data: response.data.data };
    },

    deleteOne: async <TData extends BaseRecord = BaseRecord, TVariables = unknown>({
      resource,
      id,
    }: DeleteOneParams<TVariables>): Promise<DeleteOneResponse<TData>> => {
      const response = await client.request<SingleEnvelope<TData> | undefined>(resourcePath(resource, id), { method: 'DELETE' });
      return { data: response.data?.data ?? ({ id } as unknown as TData) };
    },

    custom: async <TData extends BaseRecord = BaseRecord, TQuery = unknown, TPayload = unknown>({
      url,
      method,
      payload,
      query,
      headers,
    }: CustomParams<TQuery, TPayload>): Promise<CustomResponse<TData>> => {
      const response = await client.request<SingleEnvelope<TData> | TData>(url, {
        method: method.toUpperCase() as HttpMethod,
        body: payload,
        query: query as Record<string, string | number | boolean | null | undefined> | undefined,
        headers: headers as Record<string, string> | undefined,
      });
      const body = response.data;
      const data = body && typeof body === 'object' && 'data' in body ? (body as SingleEnvelope<TData>).data : (body as TData);
      return { data };
    },
  };
}

export const dataProvider = createDataProvider();
