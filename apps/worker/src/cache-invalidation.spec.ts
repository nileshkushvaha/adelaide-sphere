import { describe, expect, it, vi } from 'vitest';
import { invalidateCache } from './cache-invalidation.js';

const target = { url: 'https://site.example/api/revalidate', token: 'secret-token' };

describe('invalidateCache', () => {
  it('posts the de-duplicated tags with the shared secret', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 204 }));
    const result = await invalidateCache({ tags: 'businesses,business:a,businesses' }, { target, fetch: fetchMock as unknown as typeof fetch });
    expect(result).toEqual({ tags: ['businesses', 'business:a'], status: 'purged' });
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe(target.url);
    expect(call?.[1]?.headers).toMatchObject({ 'x-revalidate-token': 'secret-token' });
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ tags: ['businesses', 'business:a'] });
  });

  it('throws on a failed purge so the queue retries it', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response('nope', { status: 500 }));
    await expect(invalidateCache({ tags: 'businesses' }, { target, fetch: fetchMock as unknown as typeof fetch })).rejects.toThrow(/status 500/);
  });

  it('skips when there is nothing to purge or no web tier is configured', async () => {
    const fetchMock = vi.fn();
    expect(await invalidateCache({ tags: '' }, { target, fetch: fetchMock as unknown as typeof fetch })).toEqual({ tags: [], status: 'skipped' });
    expect(await invalidateCache({ tags: 'businesses' }, { target: null })).toEqual({ tags: ['businesses'], status: 'skipped' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
