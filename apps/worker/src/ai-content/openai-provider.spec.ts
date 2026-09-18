import type { TextRequest } from '@adelaide-sphere/database/automation';
import { OpenAiTextProvider, mapResponse, type FetchLike } from './openai-provider.js';

const request: TextRequest = { provider: 'openai', model: 'gpt-5.6-terra', instructions: 'Rules', input: '{"claims":[]}', schemaName: 'local_article', schema: { type: 'object' }, maxOutputTokens: 8000 };

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: { url: string; init: Parameters<FetchLike>[1] }[] = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return { status, headers: { get: (n: string) => headers[n.toLowerCase()] ?? null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
  };
  return { impl, calls };
}

describe('OpenAI Responses adapter: submission (provider contract, no network)', () => {
  it('sends one background, strict-schema, default-tier request with minimal retention and the key only in the header', async () => {
    const f = fakeFetch(200, { id: 'resp_123', status: 'queued' });
    expect(await new OpenAiTextProvider('sk-test-key', f.impl).submit(request)).toEqual({ kind: 'accepted', responseId: 'resp_123' });
    const { url, init } = f.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer sk-test-key');
    const body = JSON.parse(init.body!);
    expect(body).toMatchObject({ model: 'gpt-5.6-terra', max_output_tokens: 8000, background: true, store: false, service_tier: 'default', text: { format: { type: 'json_schema', name: 'local_article', strict: true } } });
    expect(init.body).not.toContain('sk-test-key');
  });

  it.each([
    [400, {}, { kind: 'rejected', errorClass: 'invalid_request', retryable: false }],
    [401, {}, { kind: 'rejected', errorClass: 'authentication', retryable: false }],
    [403, {}, { kind: 'rejected', errorClass: 'permission', retryable: false }],
    [404, {}, { kind: 'rejected', errorClass: 'model_not_found', retryable: false }],
    [429, { error: { code: 'insufficient_quota' } }, { kind: 'rejected', errorClass: 'insufficient_quota', retryable: false }],
    [503, {}, { kind: 'rejected', errorClass: 'provider_unavailable', retryable: true }],
    [500, {}, { kind: 'unknown', errorClass: 'http_500' }],
    [502, {}, { kind: 'unknown', errorClass: 'http_502' }],
    [504, {}, { kind: 'unknown', errorClass: 'http_504' }],
  ])('classifies HTTP %s safely: only "not processed" statuses are definite refusals', async (status, body, expected) => {
    expect(await new OpenAiTextProvider('k', fakeFetch(status, body).impl).submit(request)).toMatchObject(expected);
  });

  it('keeps Retry-After on a rate limit, and treats a lost connection or an id-less success as unknown', async () => {
    expect(await new OpenAiTextProvider('k', fakeFetch(429, { error: { code: 'rate_limit_exceeded' } }, { 'retry-after': '30' }).impl).submit(request)).toEqual({ kind: 'rejected', errorClass: 'rate_limited', retryable: true, retryAfterMs: 30_000 });
    const lost: FetchLike = async () => {
      throw Object.assign(new Error('socket hang up'), { name: 'TypeError' });
    };
    expect(await new OpenAiTextProvider('k', lost).submit(request)).toEqual({ kind: 'unknown', errorClass: 'submit_connection_lost' });
    const timeout: FetchLike = async () => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    };
    expect(await new OpenAiTextProvider('k', timeout).submit(request)).toEqual({ kind: 'unknown', errorClass: 'submit_timeout' });
    expect(await new OpenAiTextProvider('k', fakeFetch(200, 'not json').impl).submit(request)).toEqual({ kind: 'unknown', errorClass: 'accepted_without_id' });
  });
});

describe('OpenAI Responses adapter: retrieval and result mapping', () => {
  const completed = {
    id: 'resp_1',
    status: 'completed',
    model: 'gpt-5.6-terra',
    service_tier: 'default',
    output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: '{"title":"x"}' }] }],
    usage: { input_tokens: 1200, input_tokens_details: { cached_tokens: 200 }, output_tokens: 900, output_tokens_details: { reasoning_tokens: 300 }, total_tokens: 2100 },
  };

  it('polls by id: queued/in_progress are pending; a terminal response maps usage, model, tier and parsed output', async () => {
    expect(await new OpenAiTextProvider('k', fakeFetch(200, { id: 'resp_1', status: 'in_progress' }).impl).retrieve('resp_1')).toEqual({ kind: 'pending' });
    const f = fakeFetch(200, completed);
    const done = await new OpenAiTextProvider('k', f.impl).retrieve('resp_1');
    expect(f.calls[0]).toMatchObject({ url: 'https://api.openai.com/v1/responses/resp_1', init: { method: 'GET' } });
    expect(done).toEqual({
      kind: 'done',
      result: { status: 'completed', output: { title: 'x' }, refusal: null, incompleteReason: null, usage: { inputTokens: 1200, cachedInputTokens: 200, outputTokens: 900 }, reasoningTokens: 300, model: 'gpt-5.6-terra', serviceTier: 'default', errorCode: null },
    });
  });

  it('reports refusals, incomplete output and missing usage as they are, never as success or zero cost', () => {
    expect(mapResponse({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] })).toMatchObject({ refusal: 'no', output: null, usage: null });
    expect(mapResponse({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [], usage: { input_tokens: 10, output_tokens: 8000 } })).toMatchObject({ status: 'incomplete', incompleteReason: 'max_output_tokens', usage: { inputTokens: 10, outputTokens: 8000, cachedInputTokens: 0 } });
    expect(mapResponse({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{broken' }] }] })).toMatchObject({ output: null });
  });

  it('treats an expired result as permanently unavailable and other read failures as transient', async () => {
    expect(await new OpenAiTextProvider('k', fakeFetch(404, {}).impl).retrieve('resp_1')).toEqual({ kind: 'unavailable', errorClass: 'result_expired', permanent: true });
    expect(await new OpenAiTextProvider('k', fakeFetch(500, {}).impl).retrieve('resp_1')).toMatchObject({ kind: 'unavailable', permanent: false });
    const lost: FetchLike = async () => {
      throw new Error('reset');
    };
    expect(await new OpenAiTextProvider('k', lost).retrieve('resp_1')).toMatchObject({ kind: 'unavailable', permanent: false });
  });
});
