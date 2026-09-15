import { ApiError } from './errors';
import { buildUrl, createHttpClient } from './http-client';
import { fakeFetch, jsonResponse, textResponse } from '@/test/fetch-fakes';

const envelope = (code: string, message: string, fields = {}, requestId = 'req-1') => ({
  error: { code, message, fields, requestId },
});

describe('createHttpClient', () => {
  it('sends JSON with relative /api/v1 URLs, Accept header and same-origin credentials', async () => {
    let seen: { url: string; init: RequestInit | undefined } | undefined;
    const client = createHttpClient({
      fetch: fakeFetch((url, init) => {
        seen = { url, init };
        return jsonResponse(201, { data: { id: 1 } }, { 'x-request-id': 'abc' });
      }),
    });
    const result = await client.request<{ data: { id: number } }>('/admin/things', {
      method: 'POST',
      body: { name: 'x' },
      query: { page: 2, skip: undefined, flag: true },
    });
    expect(seen?.url).toBe('/api/v1/admin/things?page=2&flag=true');
    expect(seen?.init?.method).toBe('POST');
    expect(seen?.init?.credentials).toBe('same-origin');
    const headers = new Headers(seen?.init?.headers);
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('content-type')).toBe('application/json');
    expect(seen?.init?.body).toBe('{"name":"x"}');
    expect(result.status).toBe(201);
    expect(result.data.data.id).toBe(1);
    expect(result.requestId).toBe('abc');
  });

  it('never adds authentication headers', async () => {
    let headers: Headers | undefined;
    const client = createHttpClient({ fetch: fakeFetch((_u, init) => ((headers = new Headers(init?.headers)), jsonResponse(200, {}))) });
    await client.request('/health');
    expect(headers?.has('authorization')).toBe(false);
    expect(headers?.has('cookie')).toBe(false);
  });

  it('resolves empty bodies (204) to undefined data', async () => {
    const client = createHttpClient({ fetch: fakeFetch(() => new Response(null, { status: 204 })) });
    const result = await client.request('/admin/things/1', { method: 'DELETE' });
    expect(result.status).toBe(204);
    expect(result.data).toBeUndefined();
  });

  it.each([
    [400, 'VALIDATION_ERROR', 'validation'],
    [401, 'UNAUTHORIZED', 'unauthorized'],
    [403, 'FORBIDDEN', 'forbidden'],
    [404, 'NOT_FOUND', 'not_found'],
    [409, 'CONFLICT', 'conflict'],
    [413, 'PAYLOAD_TOO_LARGE', 'payload_too_large'],
    [429, 'RATE_LIMITED', 'rate_limited'],
    [500, 'INTERNAL_ERROR', 'server'],
    [503, 'SERVICE_UNAVAILABLE', 'unavailable'],
  ] as const)('classifies %s %s as %s and parses the envelope', async (status, code, kind) => {
    const client = createHttpClient({
      fetch: fakeFetch(() => jsonResponse(status, envelope(code, 'Server message', { name: ['too short'] }), { 'x-request-id': 'hdr-id', 'retry-after': '7' })),
    });
    const error = await client.request('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.kind).toBe(kind);
    expect(apiError.status).toBe(status);
    expect(apiError.code).toBe(code);
    // A server or availability failure always gets the client's own sentence.
    expect(apiError.userMessage).toBe(kind === 'server' ? 'The server encountered an unexpected problem.' : kind === 'unavailable' ? 'The service is temporarily unavailable. Please try again shortly.' : 'Server message');
    expect(apiError.fields).toEqual({ name: ['too short'] });
    expect(apiError.requestId).toBe('hdr-id');
    expect(apiError.retryAfterSeconds).toBe(7);
    expect(apiError.reference).toBe(`${code} · request hdr-id`);
  });

  it('falls back to the envelope requestId when the header is missing', async () => {
    const client = createHttpClient({ fetch: fakeFetch(() => jsonResponse(404, envelope('NOT_FOUND', 'Resource not found', {}, 'body-id'))) });
    const error = (await client.request('/x').catch((e: unknown) => e)) as ApiError;
    expect(error.requestId).toBe('body-id');
  });

  it('handles non-JSON error bodies without exposing them', async () => {
    const client = createHttpClient({ fetch: fakeFetch(() => textResponse(502, '<html>Bad Gateway from proxy</html>')) });
    const error = (await client.request('/x').catch((e: unknown) => e)) as ApiError;
    expect(error.kind).toBe('server');
    expect(error.status).toBe(502);
    expect(error.code).toBeNull();
    expect(error.userMessage).not.toContain('Bad Gateway');
    expect(JSON.stringify(error)).not.toContain('html');
  });

  it('handles malformed JSON in error responses', async () => {
    const client = createHttpClient({ fetch: fakeFetch(() => new Response('{not json', { status: 500, headers: { 'content-type': 'application/json' } })) });
    const error = (await client.request('/x').catch((e: unknown) => e)) as ApiError;
    expect(error.kind).toBe('server');
    expect(error.userMessage).toBe('The server encountered an unexpected problem.');
  });

  it('rejects a successful response whose body is not JSON', async () => {
    const client = createHttpClient({ fetch: fakeFetch(() => textResponse(200, 'ok')) });
    const error = (await client.request('/x').catch((e: unknown) => e)) as ApiError;
    expect(error.kind).toBe('unexpected');
  });

  it('maps network failures to a network ApiError', async () => {
    const client = createHttpClient({ fetch: (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch });
    const error = (await client.request('/x').catch((e: unknown) => e)) as ApiError;
    expect(error.kind).toBe('network');
    expect(error.status).toBeNull();
    expect(error.userMessage).toMatch(/could not be reached/);
  });

  it('times out cleanly', async () => {
    const client = createHttpClient({
      fetch: ((_: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        })) as typeof fetch,
    });
    const error = (await client.request('/x', { timeoutMs: 20 }).catch((e: unknown) => e)) as ApiError;
    expect(error.kind).toBe('timeout');
  });

  it('honours a caller-supplied AbortSignal', async () => {
    const controller = new AbortController();
    const client = createHttpClient({
      fetch: ((_: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        })) as typeof fetch,
    });
    const pending = client.request('/x', { signal: controller.signal });
    controller.abort();
    const error = (await pending.catch((e: unknown) => e)) as ApiError;
    expect(error.kind).toBe('aborted');
  });
});

describe('buildUrl', () => {
  it('normalises leading slashes and skips empty query values', () => {
    expect(buildUrl('/api/v1', 'health')).toBe('/api/v1/health');
    expect(buildUrl('/api/v1', '/x', { a: 1, b: null, c: 'two words' })).toBe('/api/v1/x?a=1&c=two+words');
  });
});
