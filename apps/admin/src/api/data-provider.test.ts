import { ApiContractError, createDataProvider, resourcePath } from './data-provider';
import { createHttpClient } from './http-client';
import { fakeFetch, jsonResponse } from '@/test/fetch-fakes';

function providerWith(handler: Parameters<typeof fakeFetch>[0]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const client = createHttpClient({
    fetch: fakeFetch((url, init) => {
      calls.push({ url, init });
      return handler(url, init);
    }),
  });
  return { provider: createDataProvider(client), calls };
}

describe('data provider', () => {
  it('exposes the relative API root', () => {
    expect(createDataProvider().getApiUrl()).toBe('/api/v1');
  });

  it('maps getList to page-numbered pagination and the collection envelope', async () => {
    const { provider, calls } = providerWith(() =>
      jsonResponse(200, { data: [{ id: 'a' }, { id: 'b' }], meta: { page: 2, pageSize: 20, total: 41, pageCount: 3 } }),
    );
    const result = await provider.getList({ resource: 'listings', pagination: { currentPage: 2, pageSize: 20 } });
    expect(calls[0]?.url).toBe('/api/v1/admin/listings?page=2&pageSize=20');
    expect(result).toEqual({ data: [{ id: 'a' }, { id: 'b' }], total: 41 });
  });

  it('refuses sorting and filtering until a resource contract defines them', async () => {
    const { provider, calls } = providerWith(() => jsonResponse(200, {}));
    await expect(provider.getList({ resource: 'listings', sorters: [{ field: 'name', order: 'asc' }] })).rejects.toBeInstanceOf(ApiContractError);
    await expect(
      provider.getList({ resource: 'listings', filters: [{ field: 'status', operator: 'eq', value: 'x' }] }),
    ).rejects.toBeInstanceOf(ApiContractError);
    expect(calls).toHaveLength(0);
  });

  it('serialises the businesses list contract and refuses unknown fields', async () => {
    const { provider, calls } = providerWith(() => jsonResponse(200, { data: [], meta: { page: 1, pageSize: 20, total: 0, pageCount: 0 } }));
    await provider.getList({
      resource: 'businesses',
      pagination: { currentPage: 1, pageSize: 20 },
      sorters: [{ field: 'updatedAt', order: 'desc' }],
      filters: [
        { field: 'q', operator: 'contains', value: 'cafe' },
        { field: 'status', operator: 'eq', value: 'draft' },
        { field: 'primaryCategoryId', operator: 'eq', value: 'c1' },
        { field: 'localAreaId', operator: 'eq', value: '' },
      ],
    });
    expect(calls[0]?.url).toBe('/api/v1/admin/businesses?page=1&pageSize=20&sort=updatedAt&order=desc&q=cafe&status=draft&categoryId=c1');
    await expect(provider.getList({ resource: 'businesses', sorters: [{ field: 'privateEnquiryEmail', order: 'asc' }] })).rejects.toBeInstanceOf(ApiContractError);
    await expect(provider.getList({ resource: 'businesses', filters: [{ field: 'status', operator: 'ne', value: 'draft' }] })).rejects.toBeInstanceOf(ApiContractError);
    await expect(provider.getList({ resource: 'businesses', filters: [{ field: 'slug', operator: 'eq', value: 'x' }] })).rejects.toBeInstanceOf(ApiContractError);
    expect(calls).toHaveLength(1);
  });

  it('maps getOne, create, update and deleteOne to REST verbs and the single envelope', async () => {
    const { provider, calls } = providerWith((url, init) => {
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return jsonResponse(init?.method === 'POST' ? 201 : 200, { data: { id: 7, url } });
    });
    expect((await provider.getOne({ resource: 'posts', id: 7 })).data.id).toBe(7);
    expect((await provider.create({ resource: 'posts', variables: { title: 't' } })).data.id).toBe(7);
    expect((await provider.update({ resource: 'posts', id: 7, variables: { title: 'u' } })).data.id).toBe(7);
    expect((await provider.deleteOne({ resource: 'posts', id: 7 })).data).toEqual({ id: 7 });
    expect(calls.map((c) => [c.init?.method ?? 'GET', c.url])).toEqual([
      ['GET', '/api/v1/admin/posts/7'],
      ['POST', '/api/v1/admin/posts'],
      ['PATCH', '/api/v1/admin/posts/7'],
      ['DELETE', '/api/v1/admin/posts/7'],
    ]);
  });

  it('encodes resource names and ids in paths and rejects traversal', () => {
    expect(resourcePath('blog/posts', 'a b')).toBe('/admin/blog/posts/a%20b');
    expect(resourcePath('local areas', 'x/y')).toBe('/admin/local%20areas/x%2Fy');
    expect(() => resourcePath('../etc')).toThrow(ApiContractError);
    expect(() => resourcePath('')).toThrow(ApiContractError);
  });
});
