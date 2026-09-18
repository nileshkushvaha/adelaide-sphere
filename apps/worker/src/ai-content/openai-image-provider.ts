import type { ImageRequest } from '@adelaide-sphere/database/automation';
import type { ImageUsage } from '@adelaide-sphere/domain';
import type { ImageOutcome, ImageProvider } from './image-provider.js';
import { classify, OPENAI_API_BASE, retryAfterMs, safeJson, type FetchLike } from './openai-provider.js';

/**
 * OpenAI Image API adapter (the first approved image provider, Phase 1E).
 *
 * Checked against the official API reference on 19 September 2026
 * (https://developers.openai.com/api/docs/api-reference/images/create):
 * - `POST /v1/images/generations` with model, prompt, size, quality,
 *   output_format, moderation and n; GPT image models always return base64
 *   (`data[].b64_json`), never a URL, so no provider URL can leak into media;
 * - the response echoes size, quality and output_format and reports `usage`
 *   (input/output tokens with text/image details);
 * - no Idempotency-Key and no background mode are documented, so a timeout
 *   or lost connection is an unknown outcome, never a reason to send again.
 */
const GENERATE_TIMEOUT_MS = 180_000;
/** Base64 of a PNG well above the 10 MB media limit: anything larger is not an image we can use. */
const MAX_RESPONSE_CHARS = 20 * 1024 * 1024;

function usageOf(body: Record<string, unknown>): ImageUsage | null {
  const u = body.usage as
    | { input_tokens?: number; output_tokens?: number; input_tokens_details?: { text_tokens?: number; image_tokens?: number }; output_tokens_details?: { text_tokens?: number; image_tokens?: number } }
    | undefined;
  if (!u || !Number.isInteger(u.input_tokens) || !Number.isInteger(u.output_tokens)) return null;
  return {
    textInputTokens: u.input_tokens_details?.text_tokens ?? u.input_tokens!,
    imageInputTokens: u.input_tokens_details?.image_tokens ?? 0,
    imageOutputTokens: u.output_tokens_details?.image_tokens ?? u.output_tokens!,
    textOutputTokens: u.output_tokens_details?.text_tokens ?? 0,
  };
}

export class OpenAiImageProvider implements ImageProvider {
  readonly id = 'openai';
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
    private readonly base = OPENAI_API_BASE,
  ) {}

  async generate(request: ImageRequest): Promise<ImageOutcome> {
    const body = JSON.stringify({ model: request.model, prompt: request.prompt, size: request.size, quality: request.quality, output_format: request.outputFormat, moderation: 'auto', n: 1 });
    let response;
    try {
      response = await this.fetchImpl(`${this.base}/images/generations`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
      });
    } catch (error) {
      // The provider may have generated (and charged for) the image before the connection failed.
      return { kind: 'unknown', errorClass: (error as Error).name === 'TimeoutError' ? 'image_timeout' : 'image_connection_lost' };
    }
    const text = await response.text().catch(() => null);
    if (response.status >= 200 && response.status < 300) {
      if (text === null) return { kind: 'unknown', errorClass: 'image_body_lost' };
      if (text.length > MAX_RESPONSE_CHARS) return { kind: 'generated', bytes: null, usage: null, size: null, quality: null };
      const json = safeJson(text) as Record<string, unknown> | null;
      if (!json) return { kind: 'unknown', errorClass: 'image_body_unreadable' };
      const first = Array.isArray(json.data) ? (json.data[0] as { b64_json?: unknown } | undefined) : undefined;
      const b64 = typeof first?.b64_json === 'string' ? first.b64_json : null;
      const bytes = b64 && /^[A-Za-z0-9+/]+={0,2}$/.test(b64) ? Buffer.from(b64, 'base64') : null;
      return { kind: 'generated', bytes: bytes && bytes.byteLength > 0 ? bytes : null, usage: usageOf(json), size: typeof json.size === 'string' ? json.size : null, quality: typeof json.quality === 'string' ? json.quality : null };
    }
    const refused = classify(response.status, text === null ? null : safeJson(text));
    if (refused) {
      if (!refused.retryable) return { kind: 'rejected', ...refused, retryAfterMs: 0 };
      const wait = retryAfterMs(response.headers);
      if (wait === null) return { kind: 'rejected', errorClass: `${refused.errorClass}_hold`, retryable: false, retryAfterMs: 0 };
      return { kind: 'rejected', ...refused, retryAfterMs: wait };
    }
    return { kind: 'unknown', errorClass: `http_${response.status}` };
  }
}
