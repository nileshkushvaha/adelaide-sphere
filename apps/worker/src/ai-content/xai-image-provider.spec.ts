import type { ImageRequest } from '@adelaide-sphere/database/automation';
import type { FetchLike } from './openai-provider.js';
import { reportedCostMicros, XaiImageProvider } from './xai-image-provider.js';

const request: ImageRequest = { provider: 'xai', model: 'grok-imagine-image-2.0', prompt: 'A generic café counter illustration', aspectRatio: '16:9', resolution: '1k', quality: 'medium' };
const png = Buffer.from('89504e470d0a1a0a', 'hex');

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: { url: string; init: Parameters<FetchLike>[1] }[] = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return { status, headers: { get: (n: string) => headers[n.toLowerCase()] ?? null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
  };
  return { impl, calls };
}

describe('xAI image adapter (provider contract, fixtures only, no network)', () => {
  it('sends one generation asking for inline base64, with the key only in the header, and returns bytes, image count and the reported model', async () => {
    const f = fakeFetch(200, { data: [{ b64_json: png.toString('base64'), revised_prompt: 'x' }], model: 'grok-imagine-image-2.0', usage: { cost_in_usd_ticks: 600_000_000 } });
    const out = await new XaiImageProvider('xai-test', f.impl).generate(request);
    // USD 0.06 = 600,000,000 ticks (1 USD = 10^10 ticks) = 60,000 micro-USD.
    expect(out).toEqual({ kind: 'generated', bytes: png, usage: null, images: 1, servedModel: 'grok-imagine-image-2.0', providerRequestId: null, mismatch: null, reportedCostMicros: 60_000 });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.url).toBe('https://api.x.ai/v1/images/generations');
    expect(JSON.parse(f.calls[0]!.init.body!)).toEqual({
      model: 'grok-imagine-image-2.0',
      prompt: request.prompt,
      n: 1,
      aspect_ratio: '16:9',
      resolution: '1k',
      quality: 'medium',
      response_format: 'b64_json',
    });
    expect(f.calls[0]!.init.body).not.toContain('xai-test');
    expect(f.calls[0]!.init.headers.authorization).toBe('Bearer xai-test');
  });

  it('reads the billed cost from usage.cost_in_usd_ticks, rounding up, and ignores anything that is not a whole tick count', () => {
    expect(reportedCostMicros({ usage: { cost_in_usd_ticks: 400_000_000 } })).toBe(40_000);
    expect(reportedCostMicros({ usage: { cost_in_usd_ticks: 800_000_000 } })).toBe(80_000);
    expect(reportedCostMicros({ usage: { cost_in_usd_ticks: 400_000_001 } })).toBe(40_001);
    expect(reportedCostMicros({ usage: { cost_in_usd_ticks: 0 } })).toBe(0);
    for (const bad of [{}, { usage: {} }, { usage: { cost_in_usd_ticks: '400000000' } }, { usage: { cost_in_usd_ticks: -1 } }, { usage: { cost_in_usd_ticks: 1.5 } }, { usage: { cost_in_usd_ticks: 2 ** 60 } }]) {
      expect(reportedCostMicros(bad)).toBeNull();
    }
  });

  it('returns a silently substituted model as reported, for the shared seam to halt on', async () => {
    // The documented lifecycle: a retired model is served by another model without an error.
    const out = await new XaiImageProvider('k', fakeFetch(200, { data: [{ b64_json: png.toString('base64') }], model: 'grok-imagine-image' }).impl).generate(request);
    expect(out).toMatchObject({ kind: 'generated', servedModel: 'grok-imagine-image' });
    const nested = await new XaiImageProvider('k', fakeFetch(200, { data: [{ b64_json: png.toString('base64'), model: 'grok-imagine-image-quality' }] }).impl).generate(request);
    expect(nested).toMatchObject({ servedModel: 'grok-imagine-image-quality' });
  });

  it('never uses a provider-hosted URL: a URL-only result is a charged result without bytes', async () => {
    const out = await new XaiImageProvider('k', fakeFetch(200, { data: [{ url: 'https://imgen.x.ai/tmp/abc.png' }], model: 'grok-imagine-image-2.0' }).impl).generate(request);
    expect(out).toMatchObject({ kind: 'generated', bytes: null, images: 1 });
    expect(JSON.stringify(out)).not.toContain('imgen.x.ai');
  });

  it('counts every image returned, so an unrequested extra image exceeds the one-image reservation', async () => {
    const out = await new XaiImageProvider('k', fakeFetch(200, { data: [{ b64_json: png.toString('base64') }, { b64_json: png.toString('base64') }] }).impl).generate(request);
    expect(out).toMatchObject({ kind: 'generated', images: 2 });
  });

  it('refuses an unlisted model or an unsupported setting before any request', async () => {
    // "auto" quality is billed at whatever quality is served, so it is never sent.
    for (const r of [{ ...request, model: 'grok-imagine-image-quality' }, { ...request, quality: 'high' }, { ...request, quality: 'auto' }, { ...request, resolution: '4k' }, { ...request, aspectRatio: 'auto' }]) {
      const f = fakeFetch(200, {});
      expect(await new XaiImageProvider('k', f.impl).generate(r)).toEqual({ kind: 'rejected', errorClass: 'unsupported_request', retryable: false, retryAfterMs: 0 });
      expect(f.calls).toHaveLength(0);
    }
  });

  it('treats a timeout, a lost connection, any 5xx (undocumented) or an unreadable body as unknown, never as not sent', async () => {
    const timeout: FetchLike = async () => {
      throw Object.assign(new Error('t'), { name: 'TimeoutError' });
    };
    const lost: FetchLike = async () => {
      throw new Error('socket hang up');
    };
    expect(await new XaiImageProvider('k', timeout).generate(request)).toEqual({ kind: 'unknown', errorClass: 'image_timeout' });
    expect(await new XaiImageProvider('k', lost).generate(request)).toEqual({ kind: 'unknown', errorClass: 'image_connection_lost' });
    for (const status of [500, 502, 503, 504]) {
      expect(await new XaiImageProvider('k', fakeFetch(status, { error: 'x' }).impl).generate(request)).toEqual({ kind: 'unknown', errorClass: `http_${status}` });
    }
    expect(await new XaiImageProvider('k', fakeFetch(200, 'not json').impl).generate(request)).toEqual({ kind: 'unknown', errorClass: 'image_body_unreadable' });
  });

  it('classifies documented refusals; a 429 without Retry-After uses the shared backoff, and a wait it cannot honour holds', async () => {
    for (const [status, errorClass] of [
      [400, 'invalid_request'],
      [401, 'authentication'],
      [403, 'permission'],
      [404, 'model_not_found'],
      [405, 'invalid_request'],
      [415, 'invalid_request'],
      [422, 'invalid_request'],
    ] as const) {
      expect(await new XaiImageProvider('k', fakeFetch(status, {}).impl).generate(request)).toEqual({ kind: 'rejected', errorClass, retryable: false, retryAfterMs: 0 });
    }
    expect(await new XaiImageProvider('k', fakeFetch(429, {}).impl).generate(request)).toEqual({ kind: 'rejected', errorClass: 'rate_limited', retryable: true, retryAfterMs: 0 });
    expect(await new XaiImageProvider('k', fakeFetch(429, {}, { 'retry-after': '30' }).impl).generate(request)).toEqual({ kind: 'rejected', errorClass: 'rate_limited', retryable: true, retryAfterMs: 30_000 });
    expect(await new XaiImageProvider('k', fakeFetch(429, {}, { 'retry-after': 'soon' }).impl).generate(request)).toEqual({ kind: 'rejected', errorClass: 'rate_limited_hold', retryable: false, retryAfterMs: 0 });
  });
});
