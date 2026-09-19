import type { ImageRequest } from '@adelaide-sphere/database/automation';
import { GeminiImageProvider, geminiUsage } from './gemini-image-provider.js';
import type { FetchLike } from './openai-provider.js';

const request: ImageRequest = { provider: 'google', model: 'gemini-3.1-flash-image', prompt: 'A generic café counter illustration', aspectRatio: '16:9', resolution: '1k', quality: 'auto' };
const png = Buffer.from('89504e470d0a1a0a', 'hex');

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: { url: string; init: Parameters<FetchLike>[1] }[] = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return { status, headers: { get: (n: string) => headers[n.toLowerCase()] ?? null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
  };
  return { impl, calls };
}

/** An interaction as the API reference documents it: steps with thought, text and inline image content. */
const interaction = (overrides: Record<string, unknown> = {}) => ({
  id: 'v1_interaction_abc',
  model: 'gemini-3.1-flash-image',
  status: 'completed',
  steps: [
    { type: 'thought', content: [{ type: 'text', text: 'planning' }] },
    { type: 'model_output', content: [{ type: 'text', text: 'Here is your image.' }, { type: 'image', data: png.toString('base64'), mime_type: 'image/png' }] },
  ],
  usage: {
    total_input_tokens: 60,
    total_output_tokens: 1140,
    total_thought_tokens: 300,
    input_tokens_by_modality: [{ modality: 'text', tokens: 60 }],
    output_tokens_by_modality: [
      { modality: 'image', tokens: 1120 },
      { modality: 'text', tokens: 20 },
    ],
  },
  ...overrides,
});

describe('Gemini image adapter (provider contract, fixtures only, no network)', () => {
  it('sends one interaction with inline image output, the key only in its header, no tools and store=false', async () => {
    const f = fakeFetch(200, interaction());
    const out = await new GeminiImageProvider('gm-test', f.impl).generate(request);
    // Thinking (300) and the text reply (20) are billed text output: never dropped.
    expect(out).toEqual({
      kind: 'generated',
      bytes: png,
      usage: { textInputTokens: 60, imageInputTokens: 0, imageOutputTokens: 1120, textOutputTokens: 320 },
      images: 1,
      servedModel: 'gemini-3.1-flash-image',
      providerRequestId: 'v1_interaction_abc',
      mismatch: null,
      reportedCostMicros: null,
    });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    const sent = JSON.parse(f.calls[0]!.init.body!);
    expect(sent).toEqual({
      model: 'gemini-3.1-flash-image',
      input: request.prompt,
      response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: '16:9', image_size: '1K' },
      store: false,
    });
    expect(sent).not.toHaveProperty('tools');
    expect(f.calls[0]!.init.body).not.toContain('gm-test');
    expect(f.calls[0]!.init.headers['x-goog-api-key']).toBe('gm-test');
    expect(f.calls[0]!.init.headers).not.toHaveProperty('authorization');
  });

  it('sends the 2K tier in upper case, and refuses unlisted models and unsupported settings before any request', async () => {
    const two = fakeFetch(200, interaction());
    await new GeminiImageProvider('k', two.impl).generate({ ...request, resolution: '2k' });
    expect(JSON.parse(two.calls[0]!.init.body!).response_format.image_size).toBe('2K');
    for (const r of [
      { ...request, model: 'gemini-2.5-flash-image' },
      { ...request, quality: 'medium' },
      { ...request, model: 'gemini-3.1-flash-lite-image', resolution: '2k' },
      { ...request, aspectRatio: '21:9' },
    ]) {
      const f = fakeFetch(200, {});
      expect(await new GeminiImageProvider('k', f.impl).generate(r)).toEqual({ kind: 'rejected', errorClass: 'unsupported_request', retryable: false, retryAfterMs: 0 });
      expect(f.calls).toHaveLength(0);
    }
  });

  it('reports the served model (without a models/ prefix) for the shared seam to compare', async () => {
    const out = await new GeminiImageProvider('k', fakeFetch(200, interaction({ model: 'models/gemini-3-pro-image' })).impl).generate(request);
    expect(out).toMatchObject({ servedModel: 'gemini-3-pro-image' });
  });

  it('never treats thinking or text as free: without a modality breakdown all output is priced as text on top of the image', () => {
    expect(geminiUsage({ usage: { total_input_tokens: 60, total_output_tokens: 1140, total_thought_tokens: 300 } })).toEqual({ textInputTokens: 60, imageInputTokens: 0, imageOutputTokens: 0, textOutputTokens: 1440 });
    expect(geminiUsage({ usage: { total_input_tokens: 60 } })).toBeNull();
    expect(geminiUsage({ usage: { total_input_tokens: 60, total_output_tokens: 10, total_thought_tokens: 'x' } })).toBeNull();
    expect(geminiUsage({})).toBeNull();
  });

  it('records a finished interaction without an image (refused, failed or incomplete) as charged, never as not sent', async () => {
    const textOnly = interaction({ steps: [{ type: 'model_output', content: [{ type: 'text', text: 'I cannot make that image.' }] }] });
    expect(await new GeminiImageProvider('k', fakeFetch(200, textOnly).impl).generate(request)).toMatchObject({ kind: 'generated', bytes: null, images: 1, providerRequestId: 'v1_interaction_abc' });
    for (const status of ['failed', 'incomplete', 'cancelled']) {
      expect(await new GeminiImageProvider('k', fakeFetch(200, interaction({ status })).impl).generate(request)).toMatchObject({ kind: 'generated', bytes: null });
    }
  });

  it('treats a timeout, a lost connection, 408, any 5xx, a still-running interaction or an unreadable body as unknown', async () => {
    const timeout: FetchLike = async () => {
      throw Object.assign(new Error('t'), { name: 'TimeoutError' });
    };
    expect(await new GeminiImageProvider('k', timeout).generate(request)).toEqual({ kind: 'unknown', errorClass: 'image_timeout' });
    for (const status of [408, 500, 503, 504]) {
      expect(await new GeminiImageProvider('k', fakeFetch(status, { error: { message: 'x' } }).impl).generate(request)).toEqual({ kind: 'unknown', errorClass: `http_${status}` });
    }
    expect(await new GeminiImageProvider('k', fakeFetch(200, interaction({ status: 'in_progress' })).impl).generate(request)).toEqual({ kind: 'unknown', errorClass: 'interaction_in_progress' });
    expect(await new GeminiImageProvider('k', fakeFetch(200, '{').impl).generate(request)).toEqual({ kind: 'unknown', errorClass: 'image_body_unreadable' });
  });

  it('classifies documented refusals, and backs off on 429 without a documented wait', async () => {
    expect(await new GeminiImageProvider('k', fakeFetch(400, { error: { status: 'INVALID_ARGUMENT' } }).impl).generate(request)).toEqual({ kind: 'rejected', errorClass: 'invalid_request', retryable: false, retryAfterMs: 0 });
    // For example, the free tier being unavailable in a region, or billing not enabled.
    expect(await new GeminiImageProvider('k', fakeFetch(400, { error: { status: 'FAILED_PRECONDITION' } }).impl).generate(request)).toEqual({ kind: 'rejected', errorClass: 'billing_or_region', retryable: false, retryAfterMs: 0 });
    expect(await new GeminiImageProvider('k', fakeFetch(403, {}).impl).generate(request)).toMatchObject({ errorClass: 'permission', retryable: false });
    expect(await new GeminiImageProvider('k', fakeFetch(404, {}).impl).generate(request)).toMatchObject({ errorClass: 'model_not_found', retryable: false });
    expect(await new GeminiImageProvider('k', fakeFetch(429, {}).impl).generate(request)).toEqual({ kind: 'rejected', errorClass: 'rate_limited', retryable: true, retryAfterMs: 0 });
  });
});
