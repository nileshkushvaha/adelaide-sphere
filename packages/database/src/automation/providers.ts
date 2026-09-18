/**
 * Declared capabilities of the text-generation models this deployment may use
 * (plan §F: "Validate configuration against an allowlist; unsupported
 * size/model/capability yields a field error before charging"). Data only;
 * the worker's adapter for each provider performs the calls.
 *
 * Source: the provider's official model pages, checked 18 September 2026
 * (https://developers.openai.com/api/docs/models/gpt-5.6-terra and
 * .../gpt-5.6-luna): 1,050,000-token context, 128,000 maximum output tokens,
 * Structured Outputs and the Responses endpoint. gpt-5.6-sol is deliberately
 * absent: it is not approved for use (owner decision).
 */
/**
 * The approved provider and models (owner decision, 18 September 2026). Code,
 * not settings: a model ID changes only through a reviewed code change, never
 * silently, and there is no automatic fallback (gpt-5.6-sol is not approved).
 */
export const APPROVED_TEXT_MODELS = { provider: 'openai', article: 'gpt-5.6-terra', light: 'gpt-5.6-luna' } as const;

export interface ModelCapability {
  /** What the model may be used for here: article prose, or lightweight tasks only. */
  role: 'article' | 'light';
  structuredOutput: boolean;
  maxOutputTokens: number;
  contextTokens: number;
}

export const TEXT_PROVIDER_CAPABILITIES: Readonly<Record<string, Readonly<Record<string, ModelCapability>>>> = {
  openai: {
    'gpt-5.6-terra': { role: 'article', structuredOutput: true, maxOutputTokens: 128_000, contextTokens: 1_050_000 },
    'gpt-5.6-luna': { role: 'light', structuredOutput: true, maxOutputTokens: 128_000, contextTokens: 1_050_000 },
  },
};

export type CapabilityProblem = 'unknown_provider' | 'unknown_model' | 'wrong_role' | 'no_structured_output' | 'output_too_large' | 'input_too_large';

/** Null when the model can serve this request; otherwise why not (checked before any reservation). */
export function capabilityProblem(provider: string, model: string, role: ModelCapability['role'], maxOutputTokens: number, inputBytes: number): CapabilityProblem | null {
  const models = TEXT_PROVIDER_CAPABILITIES[provider];
  if (!models) return 'unknown_provider';
  const cap = models[model];
  if (!cap) return 'unknown_model';
  // The article model may do light work; a light model never writes article prose.
  if (role === 'article' && cap.role !== 'article') return 'wrong_role';
  if (!cap.structuredOutput) return 'no_structured_output';
  if (maxOutputTokens > cap.maxOutputTokens) return 'output_too_large';
  if (inputBytes + maxOutputTokens > cap.contextTokens) return 'input_too_large';
  return null;
}
