import { imageModelCapability, type ImageRequest } from '@adelaide-sphere/database/automation';
import type { ImageOutcome, ImageProvider } from './image-provider.js';
import { retryAfterMs, safeJson, type FetchLike } from './openai-provider.js';

export const XAI_API_BASE = 'https://api.x.ai/v1';

/**
 * xAI image generation adapter (provider amendment 01; an image-only candidate).
 *
 * Checked against the official documentation on 19 September 2026
 * (docs.x.ai: model-capabilities/images/generation, models, pricing, rate
 * limits, debugging):
 * - `POST /v1/images/generations` with model, prompt, n, aspect_ratio,
 *   resolution (1k/2k), quality (low/medium; "auto" is never sent) and response_format;
 * - the default response format is a temporary hosted URL, so `b64_json` is
 *   always requested and a URL is never followed or kept (AI-IMAGE-PROVIDER-11);
 * - billing is per generated image and depends on the configuration
 *   (resolution and quality; "auto" is billed at the quality served, so it is
 *   not offered). `usage.cost_in_usd_ticks` states the exact amount billed
 *   (1 USD = 10^10 ticks); it is returned for settlement, which checks it
 *   against the approved price for the requested configuration;
 * - the response carries the model as metadata; a retired model is served by
 *   another model without an error, so the reported model is returned for the
 *   shared seam to compare with the approved one (AI-PROVIDER-13);
 * - 400/401/403/404/405/415/422/429 are documented, 5xx and Retry-After are
 *   not, and there is no request id or idempotency key: a 5xx, timeout or lost
 *   connection is an unknown outcome and is never sent again automatically.
 */
const GENERATE_TIMEOUT_MS = 180_000;
/** Base64 of an image well above the 10 MB media limit: anything larger is not an image we can use. */
const MAX_RESPONSE_CHARS = 20 * 1024 * 1024;

/** 1 USD = 10^10 ticks, so one micro-unit of USD is 10,000 ticks (docs.x.ai cost tracking). */
export const TICKS_PER_MICRO_USD = 10_000;

/**
 * The exact amount billed (`usage.cost_in_usd_ticks`), in micro-USD rounded up so a cost is never
 * understated; null when absent or not a non-negative integer (then the approved price settles it).
 */
export function reportedCostMicros(body: Record<string, unknown>): number | null {
  const ticks = (body.usage as { cost_in_usd_ticks?: unknown } | undefined)?.cost_in_usd_ticks;
  if (typeof ticks !== 'number' || !Number.isSafeInteger(ticks) || ticks < 0) return null;
  return Math.ceil(ticks / TICKS_PER_MICRO_USD);
}

/** Documented refusals: the request was not processed. Anything else is not assumed to be. */
function refusal(status: number): { errorClass: string; retryable: boolean } | null {
  if (status === 400 || status === 415 || status === 422) return { errorClass: 'invalid_request', retryable: false };
  if (status === 401) return { errorClass: 'authentication', retryable: false };
  if (status === 403) return { errorClass: 'permission', retryable: false };
  if (status === 404) return { errorClass: 'model_not_found', retryable: false };
  if (status === 405) return { errorClass: 'invalid_request', retryable: false };
  if (status === 429) return { errorClass: 'rate_limited', retryable: true };
  return null;
}

export class XaiImageProvider implements ImageProvider {
  readonly id = 'xai';
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
    private readonly base = XAI_API_BASE,
  ) {}

  async generate(request: ImageRequest): Promise<ImageOutcome> {
    const cap = imageModelCapability('xai', request.model);
    if (!cap || !cap.aspectRatios.includes(request.aspectRatio) || !cap.resolutions.includes(request.resolution) || !cap.qualities.includes(request.quality)) {
      return { kind: 'rejected', errorClass: 'unsupported_request', retryable: false, retryAfterMs: 0 };
    }
    const body = JSON.stringify({
      model: request.model,
      prompt: request.prompt,
      n: 1,
      aspect_ratio: request.aspectRatio,
      resolution: request.resolution,
      quality: request.quality,
      response_format: 'b64_json',
    });
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
      if (text.length > MAX_RESPONSE_CHARS) return { kind: 'generated', bytes: null, usage: null, images: 1, servedModel: null, providerRequestId: null, mismatch: null, reportedCostMicros: null };
      const json = safeJson(text) as Record<string, unknown> | null;
      if (!json) return { kind: 'unknown', errorClass: 'image_body_unreadable' };
      const data = Array.isArray(json.data) ? (json.data as Record<string, unknown>[]) : [];
      const first = data[0];
      // Only inline bytes are used; a URL (the provider's default format) is ignored, never fetched or stored.
      const b64 = typeof first?.b64_json === 'string' ? first.b64_json : null;
      const bytes = b64 && /^[A-Za-z0-9+/]+={0,2}$/.test(b64) ? Buffer.from(b64, 'base64') : null;
      const reported = typeof json.model === 'string' ? json.model : typeof first?.model === 'string' ? first.model : null;
      const id = typeof json.id === 'string' ? json.id : response.headers.get('x-request-id');
      return {
        kind: 'generated',
        bytes: bytes && bytes.byteLength > 0 ? bytes : null,
        // Billed per image; token counts are not used to price it.
        usage: null,
        images: Math.max(1, data.length),
        servedModel: reported,
        providerRequestId: id,
        mismatch: null,
        reportedCostMicros: reportedCostMicros(json),
      };
    }
    const refused = refusal(response.status);
    if (refused) {
      if (!refused.retryable) return { kind: 'rejected', ...refused, retryAfterMs: 0 };
      // No Retry-After is documented: 0 lets the shared bounded exponential backoff apply (AI-PROVIDER-09).
      const wait = retryAfterMs(response.headers);
      if (wait === null) return { kind: 'rejected', errorClass: `${refused.errorClass}_hold`, retryable: false, retryAfterMs: 0 };
      return { kind: 'rejected', ...refused, retryAfterMs: wait };
    }
    return { kind: 'unknown', errorClass: `http_${response.status}` };
  }
}
