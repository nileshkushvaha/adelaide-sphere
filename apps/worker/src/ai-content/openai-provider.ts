import type { ProviderResult, TextRequest } from '@adelaide-sphere/database/automation';
import type { RetrieveOutcome, SubmitOutcome, TextProvider } from './text-provider.js';

/**
 * OpenAI Responses API adapter (the first approved text provider).
 *
 * Checked against the official documentation on 18 September 2026:
 * - Structured Outputs: `text.format = { type: 'json_schema', name, schema, strict: true }`.
 * - Background mode (`background: true`) returns a response id immediately;
 *   `GET /v1/responses/{id}` polls it until it leaves `queued`/`in_progress`.
 *   With `store: false` the result is kept only about ten minutes for polling,
 *   which keeps provider-side retention minimal.
 * - The Responses API does not document an Idempotency-Key, so none is relied
 *   on: a lost submission is an unknown outcome, never silently repeated.
 * - Usage: `usage.input_tokens`, `usage.input_tokens_details.cached_tokens`,
 *   `usage.output_tokens` (reasoning included), `output_tokens_details.reasoning_tokens`.
 *
 * The key is read from the worker's environment and sent only in the
 * Authorization header to the fixed API host; it is never logged or stored.
 */
export const OPENAI_API_BASE = 'https://api.openai.com/v1';
const SUBMIT_TIMEOUT_MS = 30_000;
const RETRIEVE_TIMEOUT_MS = 15_000;

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal }) => Promise<{ status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;

function retryAfterMs(headers: { get(name: string): string | null }): number {
  const value = Number(headers.get('retry-after'));
  return Number.isFinite(value) && value >= 0 ? Math.min(value, 3600) * 1000 : 0;
}

const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** Classifies an HTTP refusal. Only statuses that mean "not processed" are definite rejections. */
function classify(status: number, body: unknown): { errorClass: string; retryable: boolean } | null {
  const code = (body as { error?: { code?: string; type?: string } } | null)?.error?.code ?? (body as { error?: { type?: string } } | null)?.error?.type ?? '';
  if (status === 400 || status === 422) return { errorClass: 'invalid_request', retryable: false };
  if (status === 401) return { errorClass: 'authentication', retryable: false };
  if (status === 403) return { errorClass: 'permission', retryable: false };
  if (status === 404) return { errorClass: 'model_not_found', retryable: false };
  if (status === 429) return code === 'insufficient_quota' ? { errorClass: 'insufficient_quota', retryable: false } : { errorClass: 'rate_limited', retryable: true };
  if (status === 503) return { errorClass: 'provider_unavailable', retryable: true };
  return null;
}

export function mapResponse(body: Record<string, unknown>): ProviderResult {
  const usage = body.usage as { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number }; output_tokens_details?: { reasoning_tokens?: number } } | undefined;
  const items = Array.isArray(body.output) ? (body.output as { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[]) : [];
  const content = items.filter((i) => i.type === 'message').flatMap((i) => i.content ?? []);
  const refusal = content.find((c) => c.type === 'refusal')?.refusal ?? null;
  const text = content.filter((c) => c.type === 'output_text').map((c) => c.text ?? '').join('');
  const status = String(body.status);
  return {
    status: (['completed', 'incomplete', 'failed', 'cancelled'].includes(status) ? status : 'failed') as ProviderResult['status'],
    output: text ? safeJson(text) : null,
    refusal,
    incompleteReason: (body.incomplete_details as { reason?: string } | null)?.reason ?? null,
    usage:
      usage && Number.isInteger(usage.input_tokens) && Number.isInteger(usage.output_tokens)
        ? { inputTokens: usage.input_tokens!, cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? 0, outputTokens: usage.output_tokens! }
        : null,
    reasoningTokens: usage?.output_tokens_details?.reasoning_tokens ?? null,
    model: typeof body.model === 'string' ? body.model : null,
    serviceTier: typeof body.service_tier === 'string' ? body.service_tier : null,
    errorCode: (body.error as { code?: string } | null)?.code ?? null,
  };
}

export class OpenAiTextProvider implements TextProvider {
  readonly id = 'openai';
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
    private readonly base = OPENAI_API_BASE,
  ) {}

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' };
  }

  async submit(request: TextRequest): Promise<SubmitOutcome> {
    const body = JSON.stringify({
      model: request.model,
      instructions: request.instructions,
      input: request.input,
      text: { format: { type: 'json_schema', name: request.schemaName, schema: request.schema, strict: true } },
      max_output_tokens: request.maxOutputTokens,
      reasoning: { effort: 'medium' },
      // The approved price schedule is for the default tier; any other tier would be a pricing discrepancy.
      service_tier: 'default',
      background: true,
      store: false,
    });
    let response;
    try {
      response = await this.fetchImpl(`${this.base}/responses`, { method: 'POST', headers: this.headers(), body, signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS) });
    } catch (error) {
      // The request may have reached the provider before the connection failed.
      return { kind: 'unknown', errorClass: (error as Error).name === 'TimeoutError' ? 'submit_timeout' : 'submit_connection_lost' };
    }
    const text = await response.text().catch(() => '');
    const json = safeJson(text) as Record<string, unknown> | null;
    if (response.status >= 200 && response.status < 300) {
      const id = typeof json?.id === 'string' ? json.id : null;
      return id ? { kind: 'accepted', responseId: id } : { kind: 'unknown', errorClass: 'accepted_without_id' };
    }
    const refused = classify(response.status, json);
    if (refused) return { kind: 'rejected', ...refused, retryAfterMs: retryAfterMs(response.headers) };
    // 500, 502, 504 and anything unexpected: the provider may have started work.
    return { kind: 'unknown', errorClass: `http_${response.status}` };
  }

  async retrieve(responseId: string): Promise<RetrieveOutcome> {
    let response;
    try {
      response = await this.fetchImpl(`${this.base}/responses/${encodeURIComponent(responseId)}`, { method: 'GET', headers: this.headers(), signal: AbortSignal.timeout(RETRIEVE_TIMEOUT_MS) });
    } catch {
      return { kind: 'unavailable', errorClass: 'retrieve_connection_lost', permanent: false };
    }
    const json = safeJson(await response.text().catch(() => '')) as Record<string, unknown> | null;
    if (response.status === 404) return { kind: 'unavailable', errorClass: 'result_expired', permanent: true };
    if (response.status === 401 || response.status === 403) return { kind: 'unavailable', errorClass: 'authentication', permanent: false };
    if (response.status < 200 || response.status >= 300 || !json) return { kind: 'unavailable', errorClass: `retrieve_http_${response.status}`, permanent: false };
    if (json.status === 'queued' || json.status === 'in_progress') return { kind: 'pending' };
    return { kind: 'done', result: mapResponse(json) };
  }
}
