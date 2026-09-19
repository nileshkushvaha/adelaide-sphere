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

/**
 * Image providers and models (Phase 1E; provider amendment 01, P1). The
 * adapter/capability layer: everything provider-specific about an image model
 * is declared here and nowhere in the reusable domain. A model is usable only
 * when it is listed here (reviewed code) **and** an administrator has approved
 * a price for it; the owner picks among listed models in AI Settings.
 */
export type ImageProviderId = 'openai' | 'xai' | 'google';

export interface ImageModelCapability {
  provider: ImageProviderId;
  model: string;
  label: string;
  /** Provider-neutral request values the model accepts. */
  aspectRatios: readonly string[];
  resolutions: readonly string[];
  qualities: readonly string[];
  /**
   * Where the provider takes an exact pixel size rather than a tier (OpenAI),
   * the size sent for each supported aspect ratio and resolution. A pair not
   * listed is unsupported.
   */
  nativeSizes?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** How the provider bills: per token or per generated image (AI-IMAGE-PROVIDER-10). */
  priceUnit: 'token' | 'image';
  /** Whether text or thinking output is always billed with the image (AI-IMAGE-PROVIDER-07). */
  billsTextOutput: boolean;
  /** Inline bytes are the only accepted result (AI-IMAGE-PROVIDER-11): always, or only when requested. */
  inlineBytes: 'always' | 'on_request';
  /** Whether a result names the model that actually served it (AI-PROVIDER-13). */
  reportsServedModel: boolean;
  /** Whether the provider returns an id for the request. */
  suppliesRequestId: boolean;
  /**
   * Whether each response states what was actually billed (xAI: usage.cost_in_usd_ticks). Such a result
   * settles at the reported cost and must agree with the approved price for its configuration.
   */
  reportsCost: boolean;
  /** Whether a lost response can be looked up; "none" means an unknown outcome can only be abandoned. */
  reconciliation: 'none' | 'retrieve_by_id';
  /** Always "hold": an unknown outcome is never retried or regenerated automatically (AI-IMAGE-PROVIDER-09). */
  unknownOutcome: 'hold';
  /** Provider search/grounding: absent, or present and always disabled in requests (AI-PROVIDER-08). */
  grounding: 'none' | 'disabled';
  /** Where requests may be processed and how long the provider keeps them (AI-PROVIDER-14), from official docs. */
  processingLocation: string;
  retention: string;
  maxPromptChars: number;
  /** Official sources and the date they were checked. */
  source: string;
}

export const IMAGE_MODELS: readonly ImageModelCapability[] = [
  {
    provider: 'openai',
    model: 'gpt-image-2.5-flare',
    label: 'OpenAI gpt-image-2.5-flare',
    aspectRatios: ['3:2', '1:1', '2:3', '16:9'],
    resolutions: ['1k', '2k'],
    qualities: ['low', 'medium', 'high'],
    // Documented sizes, and 16:9 as a custom size: multiples of 16, within 1:3–3:1, not above 2560x1440.
    nativeSizes: { '3:2': { '1k': '1536x1024' }, '1:1': { '1k': '1024x1024' }, '2:3': { '1k': '1024x1536' }, '16:9': { '1k': '1536x864', '2k': '2048x1152' } },
    priceUnit: 'token',
    billsTextOutput: false,
    inlineBytes: 'always',
    reportsServedModel: false,
    suppliesRequestId: false,
    reportsCost: false,
    reconciliation: 'none',
    unknownOutcome: 'hold',
    grounding: 'none',
    processingLocation: 'Provider default; Australian regional storage available through OpenAI data residency (not configured).',
    retention: 'Not used for training by default; abuse-monitoring logs up to 30 days.',
    maxPromptChars: 32_000,
    source: 'developers.openai.com: models/gpt-image-2.5-flare, api-reference/images/create, guides/image-generation, guides/your-data (checked 19 Sep 2026)',
  },
  {
    provider: 'xai',
    model: 'grok-imagine-image-2.0',
    label: 'xAI grok-imagine-image-2.0',
    // Documented: 1:1 … 21:9 and "auto"; only the ratios this site uses are listed, never "auto".
    aspectRatios: ['3:2', '16:9', '1:1', '2:3'],
    resolutions: ['1k', '2k'],
    // Billed at the quality served; "auto" currently serves "low" for generation, so its price is not known
    // in advance. Only an explicit, separately priced quality is allowed.
    qualities: ['low', 'medium'],
    // Per image, priced by configuration (resolution and quality): each configuration needs its own approved price.
    priceUnit: 'image',
    billsTextOutput: false,
    // The default response is a temporary hosted URL: the adapter always asks for b64_json.
    inlineBytes: 'on_request',
    // The response carries the model as metadata; a retired model is silently redirected, so it is checked.
    reportsServedModel: true,
    suppliesRequestId: false,
    // usage.cost_in_usd_ticks: the exact amount billed (1 USD = 10^10 ticks).
    reportsCost: true,
    reconciliation: 'none',
    unknownOutcome: 'hold',
    grounding: 'none',
    processingLocation: 'United States (us-east-1, us-west-2); the global endpoint does not guarantee a region. No Australian region.',
    retention: 'Requests and responses kept 30 days for abuse auditing; not trained on without permission; Zero Data Retention optional.',
    // No prompt limit is documented: a conservative bound well above the 1E prompt and policy suffix.
    maxPromptChars: 8_000,
    source:
      'docs.x.ai: model-capabilities/images/generation, rest-api-reference/inference/images, cost-tracking, release-notes (auto quality, cost_in_usd_ticks), models/grok-imagine-image-2.0, pricing; x.ai/legal enterprise terms (checked 19 Sep 2026; configuration-dependent prices per owner recheck)',
  },
  {
    provider: 'google',
    model: 'gemini-3.1-flash-image',
    label: 'Google gemini-3.1-flash-image',
    aspectRatios: ['3:2', '16:9', '1:1', '2:3'],
    resolutions: ['1k', '2k'],
    // No quality setting exists: the one value is "auto", and a price covers it.
    qualities: ['auto'],
    // Published per image at each resolution tier; prompt input and text/thinking output are billed per token on top.
    priceUnit: 'image',
    billsTextOutput: true,
    inlineBytes: 'always',
    reportsServedModel: true,
    suppliesRequestId: true,
    reportsCost: false,
    // Sent with store=false (not persisted), so a lost response cannot be retrieved: an unknown outcome is held.
    reconciliation: 'none',
    unknownOutcome: 'hold',
    // Google Search grounding exists for image models; no tools are ever sent.
    grounding: 'disabled',
    processingLocation: 'Not documented for the Gemini Developer API (no region selection verified).',
    retention: 'Paid tier: not used to improve products. Interactions are sent with store=false (the default would keep them 55 days). SynthID watermark on every image.',
    maxPromptChars: 8_000,
    source: 'ai.google.dev: gemini-api/docs/image-generation, api/interactions-api, gemini-api/docs/interactions, pricing, gemini-api/terms (checked 19 Sep 2026)',
  },
  {
    provider: 'google',
    model: 'gemini-3.1-flash-lite-image',
    label: 'Google gemini-3.1-flash-lite-image (low-cost reference)',
    aspectRatios: ['3:2', '16:9', '1:1', '2:3'],
    resolutions: ['1k'],
    // No quality setting exists: the one value is "auto", and a price covers it.
    qualities: ['auto'],
    // Published per image at each resolution tier; prompt input and text/thinking output are billed per token on top.
    priceUnit: 'image',
    billsTextOutput: true,
    inlineBytes: 'always',
    reportsServedModel: true,
    suppliesRequestId: true,
    reportsCost: false,
    // Sent with store=false (not persisted), so a lost response cannot be retrieved: an unknown outcome is held.
    reconciliation: 'none',
    unknownOutcome: 'hold',
    // Google Search grounding exists for image models; no tools are ever sent.
    grounding: 'disabled',
    processingLocation: 'Not documented for the Gemini Developer API (no region selection verified).',
    retention: 'Paid tier: not used to improve products. Interactions are sent with store=false (the default would keep them 55 days). SynthID watermark on every image.',
    maxPromptChars: 8_000,
    source: 'ai.google.dev: gemini-api/docs/image-generation, api/interactions-api, gemini-api/docs/interactions, pricing, gemini-api/terms (checked 19 Sep 2026)',
  },
];

export function imageModelCapability(provider: string, model: string): ImageModelCapability | undefined {
  return IMAGE_MODELS.find((m) => m.provider === provider && m.model === model);
}

/** What is sent as the size: the provider-native pixel size where it takes one, otherwise the resolution tier. */
export function nativeImageSize(cap: ImageModelCapability, aspectRatio: string, resolution: string): string | null {
  if (!cap.nativeSizes) return resolution;
  return cap.nativeSizes[aspectRatio]?.[resolution] ?? null;
}

export type ImageCapabilityProblem = 'unknown_provider' | 'unknown_model' | 'unsupported_aspect_ratio' | 'unsupported_resolution' | 'unsupported_quality' | 'unsupported_size' | 'prompt_too_long';

/** Null when the listed model can serve this request; otherwise why not (checked before any reservation). */
export function imageCapabilityProblem(provider: string, model: string, aspectRatio: string, resolution: string, quality: string, promptChars: number): ImageCapabilityProblem | null {
  if (!IMAGE_MODELS.some((m) => m.provider === provider)) return 'unknown_provider';
  const cap = imageModelCapability(provider, model);
  if (!cap) return 'unknown_model';
  if (!cap.aspectRatios.includes(aspectRatio)) return 'unsupported_aspect_ratio';
  if (!cap.resolutions.includes(resolution)) return 'unsupported_resolution';
  if (!cap.qualities.includes(quality)) return 'unsupported_quality';
  if (nativeImageSize(cap, aspectRatio, resolution) === null) return 'unsupported_size';
  if (promptChars > cap.maxPromptChars) return 'prompt_too_long';
  return null;
}
