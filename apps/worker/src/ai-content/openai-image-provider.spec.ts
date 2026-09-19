import type { ImageRequest } from '@adelaide-sphere/database/automation';
import { OpenAiImageProvider } from './openai-image-provider.js';
import type { FetchLike } from './openai-provider.js';

// The neutral request that reproduces 1E's original OpenAI call (3:2 at 1k is 1536x1024).
const request: ImageRequest = { provider: 'openai', model: 'gpt-image-2.5-flare', prompt: 'A generic café counter illustration', aspectRatio: '3:2', resolution: '1k', quality: 'medium' };
const png = Buffer.from('89504e470d0a1a0a', 'hex');

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: { url: string; init: Parameters<FetchLike>[1] }[] = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return { status, headers: { get: (n: string) => headers[n.toLowerCase()] ?? null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
  };
  return { impl, calls };
}

describe('OpenAI image adapter (provider contract, no network)', () => {
  it('sends one bounded generation with the key only in the header, and returns bytes, usage, size and quality', async () => {
    const f = fakeFetch(200, { data: [{ b64_json: png.toString('base64') }], size: '1536x1024', quality: 'medium', output_format: 'png', usage: { input_tokens: 40, output_tokens: 1600, input_tokens_details: { text_tokens: 40, image_tokens: 0 }, output_tokens_details: { image_tokens: 1600, text_tokens: 0 } } });
    const out = await new OpenAiImageProvider('sk-test', f.impl).generate(request);
    expect(out).toEqual({ kind: 'generated', bytes: png, usage: { textInputTokens: 40, imageInputTokens: 0, imageOutputTokens: 1600, textOutputTokens: 0 }, images: 1, servedModel: null, providerRequestId: null, mismatch: null, reportedCostMicros: null });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.url).toBe('https://api.openai.com/v1/images/generations');
    const sent = JSON.parse(f.calls[0]!.init.body!);
    expect(sent).toEqual({ model: 'gpt-image-2.5-flare', prompt: request.prompt, size: '1536x1024', quality: 'medium', output_format: 'png', moderation: 'auto', n: 1 });
    expect(f.calls[0]!.init.body).not.toContain('sk-test');
    expect(f.calls[0]!.init.headers.authorization).toBe('Bearer sk-test');
  });

  it('maps 16:9 to its declared exact size, refuses an undeclared combination before any request, and reports a size it was not asked for', async () => {
    const f = fakeFetch(200, { data: [{ b64_json: png.toString('base64') }], size: '1536x864', quality: 'medium' });
    await new OpenAiImageProvider('k', f.impl).generate({ ...request, aspectRatio: '16:9' });
    expect(JSON.parse(f.calls[0]!.init.body!).size).toBe('1536x864');
    const none = fakeFetch(200, {});
    expect(await new OpenAiImageProvider('k', none.impl).generate({ ...request, aspectRatio: '21:9' })).toEqual({ kind: 'rejected', errorClass: 'unsupported_request', retryable: false, retryAfterMs: 0 });
    expect(none.calls).toHaveLength(0);
    const other = await new OpenAiImageProvider('k', fakeFetch(200, { data: [{ b64_json: png.toString('base64') }], size: '1024x1024', quality: 'medium' }).impl).generate(request);
    expect(other).toMatchObject({ kind: 'generated', mismatch: '1024x1024 medium, requested 1536x1024 medium' });
  });

  it('reports a paid result without usable bytes as generated (charged), never as a retryable failure', async () => {
    expect(await new OpenAiImageProvider('k', fakeFetch(200, { data: [{}], usage: { input_tokens: 40, output_tokens: 1600 } }).impl).generate(request)).toMatchObject({ kind: 'generated', bytes: null });
    expect(await new OpenAiImageProvider('k', fakeFetch(200, { data: [{ b64_json: 'not base64!' }] }).impl).generate(request)).toMatchObject({ kind: 'generated', bytes: null, usage: null });
  });

  it('treats a timeout, a lost connection, a server error or an unreadable body as unknown, never as not sent', async () => {
    const thrower = (name: string): FetchLike => async () => {
      throw Object.assign(new Error('x'), { name });
    };
    expect(await new OpenAiImageProvider('k', thrower('TimeoutError')).generate(request)).toEqual({ kind: 'unknown', errorClass: 'image_timeout' });
    expect(await new OpenAiImageProvider('k', thrower('TypeError')).generate(request)).toEqual({ kind: 'unknown', errorClass: 'image_connection_lost' });
    expect(await new OpenAiImageProvider('k', fakeFetch(500, {}).impl).generate(request)).toEqual({ kind: 'unknown', errorClass: 'http_500' });
    expect(await new OpenAiImageProvider('k', fakeFetch(200, 'garbage').impl).generate(request)).toEqual({ kind: 'unknown', errorClass: 'image_body_unreadable' });
  });

  it('classifies definite refusals, and honours or holds on the requested wait', async () => {
    expect(await new OpenAiImageProvider('k', fakeFetch(400, { error: { code: 'moderation_blocked' } }).impl).generate(request)).toEqual({ kind: 'rejected', errorClass: 'invalid_request', retryable: false, retryAfterMs: 0 });
    expect(await new OpenAiImageProvider('k', fakeFetch(429, { error: { code: 'rate_limit_exceeded' } }, { 'retry-after': '45' }).impl).generate(request)).toEqual({ kind: 'rejected', errorClass: 'rate_limited', retryable: true, retryAfterMs: 45_000 });
    expect(await new OpenAiImageProvider('k', fakeFetch(429, { error: { code: 'rate_limit_exceeded' } }, { 'retry-after': '9000' }).impl).generate(request)).toEqual({ kind: 'rejected', errorClass: 'rate_limited_hold', retryable: false, retryAfterMs: 0 });
    expect(await new OpenAiImageProvider('k', fakeFetch(429, { error: { code: 'insufficient_quota' } }).impl).generate(request)).toEqual({ kind: 'rejected', errorClass: 'insufficient_quota', retryable: false, retryAfterMs: 0 });
  });
});
