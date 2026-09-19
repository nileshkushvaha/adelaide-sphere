import { imageModelCapability, type ImageRequest } from '@adelaide-sphere/database/automation';
import type { ImageUsage } from '@adelaide-sphere/domain';
import type { ImageOutcome, ImageProvider } from './image-provider.js';
import { retryAfterMs, safeJson, type FetchLike } from './openai-provider.js';

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Google Gemini native image generation adapter (provider amendment 01; an
 * image-only candidate). Gemini text generation is planned separately.
 *
 * Checked against the official documentation on 19 September 2026
 * (ai.google.dev: gemini-api/docs/image-generation, api/interactions-api,
 * gemini-api/docs/interactions, pricing, troubleshooting):
 * - `POST /v1beta/interactions` with the key in `x-goog-api-key`, `input`, and
 *   `response_format { type: "image", mime_type, aspect_ratio, image_size }`,
 *   where image_size must be an uppercase tier ("1K", "2K");
 * - images come back inline as base64 in `steps[].content[]` items of type
 *   "image" (never a URL); thinking cannot be disabled and is billed, and text
 *   may accompany the image;
 * - `usage` reports total input, output and thought tokens (separately) with
 *   per-modality breakdowns; `id` identifies the interaction; `model` names it;
 * - no tools are sent, so Google Search grounding is never used
 *   (AI-PROVIDER-08); `store` is false, so nothing is kept for later retrieval
 *   and a lost response is an unknown outcome, never re-sent;
 * - no Retry-After or idempotency key is documented: a 429 uses the shared
 *   bounded backoff; 408, 5xx, timeouts and lost connections are unknown.
 */
const GENERATE_TIMEOUT_MS = 180_000;
const MAX_RESPONSE_CHARS = 20 * 1024 * 1024;

type ModalityTokens = { modality?: unknown; tokens?: unknown }[] | undefined;
const byModality = (list: ModalityTokens, modality: string): number | null => {
  if (!Array.isArray(list)) return null;
  const found = list.filter((m) => m.modality === modality && Number.isInteger(m.tokens));
  return found.length ? found.reduce((sum, m) => sum + (m.tokens as number), 0) : 0;
};

/**
 * Reported usage in the shared shape. Thinking is text output for billing (it
 * is billed at the text output rate), so it is never dropped or treated as free.
 */
export function geminiUsage(body: Record<string, unknown>): ImageUsage | null {
  const u = body.usage as
    | { total_input_tokens?: unknown; total_output_tokens?: unknown; total_thought_tokens?: unknown; input_tokens_by_modality?: ModalityTokens; output_tokens_by_modality?: ModalityTokens }
    | undefined;
  if (!u || !Number.isInteger(u.total_input_tokens) || !Number.isInteger(u.total_output_tokens)) return null;
  const input = u.total_input_tokens as number;
  const output = u.total_output_tokens as number;
  const thought = u.total_thought_tokens === undefined ? 0 : u.total_thought_tokens;
  if (!Number.isInteger(thought)) return null;
  const imageIn = byModality(u.input_tokens_by_modality, 'image') ?? 0;
  // Without a breakdown, every output token is priced as text/thinking output on top of the per-image price:
  // an overstatement, never an understatement (and still bounded by the reservation).
  const imageOut = byModality(u.output_tokens_by_modality, 'image') ?? 0;
  return {
    textInputTokens: Math.max(0, input - imageIn),
    imageInputTokens: imageIn,
    imageOutputTokens: imageOut,
    textOutputTokens: Math.max(0, output - imageOut) + (thought as number),
  };
}

function refusal(status: number, body: unknown): { errorClass: string; retryable: boolean } | null {
  const code = String((body as { error?: { code?: unknown; status?: unknown } } | null)?.error?.status ?? '');
  if (status === 400) return { errorClass: code === 'FAILED_PRECONDITION' ? 'billing_or_region' : 'invalid_request', retryable: false };
  if (status === 401) return { errorClass: 'authentication', retryable: false };
  if (status === 403) return { errorClass: 'permission', retryable: false };
  if (status === 404) return { errorClass: 'model_not_found', retryable: false };
  if (status === 429) return { errorClass: 'rate_limited', retryable: true };
  return null;
}

export class GeminiImageProvider implements ImageProvider {
  readonly id = 'google';
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
    private readonly base = GEMINI_API_BASE,
  ) {}

  async generate(request: ImageRequest): Promise<ImageOutcome> {
    const cap = imageModelCapability('google', request.model);
    if (!cap || !cap.aspectRatios.includes(request.aspectRatio) || !cap.resolutions.includes(request.resolution) || !cap.qualities.includes(request.quality)) {
      return { kind: 'rejected', errorClass: 'unsupported_request', retryable: false, retryAfterMs: 0 };
    }
    const body = JSON.stringify({
      model: request.model,
      input: request.prompt,
      response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: request.aspectRatio, image_size: request.resolution.toUpperCase() },
      // Not persisted by the provider; no tools, so no grounding.
      store: false,
    });
    let response;
    try {
      response = await this.fetchImpl(`${this.base}/interactions`, {
        method: 'POST',
        headers: { 'x-goog-api-key': this.apiKey, 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
      });
    } catch (error) {
      return { kind: 'unknown', errorClass: (error as Error).name === 'TimeoutError' ? 'image_timeout' : 'image_connection_lost' };
    }
    const text = await response.text().catch(() => null);
    if (response.status >= 200 && response.status < 300) {
      if (text === null) return { kind: 'unknown', errorClass: 'image_body_lost' };
      if (text.length > MAX_RESPONSE_CHARS) return { kind: 'generated', bytes: null, usage: null, images: 1, servedModel: null, providerRequestId: null, mismatch: null, reportedCostMicros: null };
      const json = safeJson(text) as Record<string, unknown> | null;
      if (!json) return { kind: 'unknown', errorClass: 'image_body_unreadable' };
      // Still running (it should not be: background is never requested): the result may yet be charged.
      if (json.status === 'in_progress' || json.status === 'requires_action') return { kind: 'unknown', errorClass: `interaction_${json.status}` };
      const steps = Array.isArray(json.steps) ? (json.steps as { type?: unknown; content?: unknown }[]) : [];
      const images = steps
        .filter((s) => s.type === 'model_output' && Array.isArray(s.content))
        .flatMap((s) => s.content as { type?: unknown; data?: unknown }[])
        .filter((c) => c.type === 'image');
      const b64 = json.status === 'completed' && typeof images[0]?.data === 'string' ? images[0].data : null;
      const bytes = b64 && /^[A-Za-z0-9+/]+={0,2}$/.test(b64) ? Buffer.from(b64, 'base64') : null;
      const model = typeof json.model === 'string' ? json.model.replace(/^models\//, '') : null;
      return {
        kind: 'generated',
        bytes: bytes && bytes.byteLength > 0 ? bytes : null,
        usage: geminiUsage(json),
        // A reply without an image is still charged for what it used; never counted as fewer than one image.
        images: Math.max(1, images.length),
        servedModel: model,
        providerRequestId: typeof json.id === 'string' ? json.id : null,
        mismatch: null,
        reportedCostMicros: null,
      };
    }
    const parsed = text === null ? null : safeJson(text);
    const refused = refusal(response.status, parsed);
    if (refused) {
      if (!refused.retryable) return { kind: 'rejected', ...refused, retryAfterMs: 0 };
      const wait = retryAfterMs(response.headers);
      if (wait === null) return { kind: 'rejected', errorClass: `${refused.errorClass}_hold`, retryable: false, retryAfterMs: 0 };
      return { kind: 'rejected', ...refused, retryAfterMs: wait };
    }
    // 408 and 5xx: Google's guidance is to retry, but for a paid call the outcome is unknown (AI-PROVIDER-09).
    return { kind: 'unknown', errorClass: `http_${response.status}` };
  }
}
