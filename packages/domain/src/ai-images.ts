/**
 * Pure rules for AI featured images (AI SRS §12; plan §H; owner decisions of
 * 19 September 2026). Browser-safe: no provider, database or network code.
 * Deployment wording (the disclosure) comes from settings, never from here.
 */
import { namePhrases, type TokenUsage } from './ai-generation.js';

export const IMAGE_PROMPT_MAX = 1000;
export const IMAGE_ALT_MAX = 255;
export const IMAGE_POLICY_VERSION = 'image-policy.v1';

/**
 * Appended to every image prompt. An AI image must never look like
 * documentary evidence of a real place's appearance (owner rule), so the
 * request asks for an illustration without identifiable venues, signage or
 * people. Deployment-neutral: it names no city or business.
 */
export const IMAGE_POLICY_SUFFIX =
  'Style: a clearly illustrative editorial image, not a photograph of a real place. Do not show real or identifiable businesses, venues, shopfronts, signage, logos, brand names, text or recognisable people.';

export type ImageMode = 'manual' | 'hybrid';

/** The article's override wins; anything unknown (including "automatic", which is not approved) is manual. */
export function effectiveImageMode(globalMode: unknown, override: unknown): ImageMode {
  const pick = override ?? globalMode;
  return pick === 'hybrid' ? 'hybrid' : 'manual';
}

export type ImagePromptProblem = 'empty' | 'too_long' | 'names_a_place_or_business';

/**
 * Checks an image prompt before any paid call. A prompt may not name a place,
 * business, event or person: only the configured location's own words are
 * allowed ("a café street scene in Adelaide"). This is deliberately strict:
 * a generated picture of a named venue would read as evidence of how it looks.
 */
export function imagePromptProblems(prompt: string, allowedNames: readonly string[]): { problem: ImagePromptProblem; names: string[] } | null {
  const text = prompt.trim();
  if (!text) return { problem: 'empty', names: [] };
  if (text.length > IMAGE_PROMPT_MAX) return { problem: 'too_long', names: [] };
  const allowed = new Set(allowedNames.flatMap((n) => n.split(/[\s,]+/)).map((w) => w.toLowerCase()).filter(Boolean));
  const names = namePhrases(text).filter((phrase) => !phrase.split(/\s+/).every((w) => allowed.has(w.toLowerCase().replace(/[’']s$/u, ''))));
  return names.length > 0 ? { problem: 'names_a_place_or_business', names: names.slice(0, 10) } : null;
}

export function imagePromptWithPolicy(prompt: string): string {
  return `${prompt.trim()}\n\n${IMAGE_POLICY_SUFFIX}`;
}

/** Alt text written by a person from the actual image: required, bounded, and not a placeholder. */
export function altTextProblem(alt: string, draft: string | null): string | null {
  const text = alt.trim();
  if (!text) return 'Describe what the image shows.';
  if (text.length > IMAGE_ALT_MAX) return `Keep alt text to ${IMAGE_ALT_MAX} characters.`;
  if (/^(image|picture|photo|illustration)( of)?\.?$/i.test(text)) return 'Describe what the image actually shows.';
  // The pre-generation draft describes the request, not the result, so it is never accepted as is.
  if (draft && text.toLowerCase() === draft.trim().toLowerCase()) return 'Write the alt text from the generated image, not the draft written before it existed.';
  return null;
}

export interface ImageUsage {
  textInputTokens: number;
  imageInputTokens: number;
  imageOutputTokens: number;
  textOutputTokens: number;
}

const perMillion = (tokens: number, microsPerMTok: number) => Math.ceil((tokens * microsPerMTok) / 1_000_000);

/**
 * How an approved image price is expressed (AI-IMAGE-PROVIDER-10): per token
 * (input, image output and, where a provider bills it, text/thinking output)
 * or per generated image. Provider-neutral: which unit a model uses is declared
 * in the capability layer, never assumed here.
 */
export type ImagePriceUnit = 'token' | 'image';

export interface ImagePrice {
  unit: ImagePriceUnit;
  inputMicrosPerMTok: number;
  /** Image output tokens (token unit). */
  outputMicrosPerMTok: number;
  /** Text or thinking output billed alongside the image, when the provider bills it; null when it never does. */
  textOutputMicrosPerMTok: number | null;
  /** Per generated image (image unit). */
  perImageMicros: number | null;
  /** Approved bound on image output tokens for one image (token unit). */
  maxOutputTokens: number | null;
  /** Approved bound on text/thinking output tokens for one image, required when that output is billed. */
  maxTextOutputTokens: number | null;
}

const count = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/**
 * Worst case for one image under the approved price: the prompt's bytes as
 * input tokens (a token is at least one byte), plus the image (its token bound,
 * or its per-image price), plus any billed text/thinking output at its bound.
 * Null whenever any part cannot be bounded: unknown cost fails closed.
 */
export function maxImageCallCostMicros(price: ImagePrice, promptBytes: number): number | null {
  if (!count(promptBytes)) return null;
  let micros = perMillion(promptBytes, price.inputMicrosPerMTok);
  if (price.unit === 'token') {
    if (!price.maxOutputTokens || !count(price.maxOutputTokens)) return null;
    micros += perMillion(price.maxOutputTokens, price.outputMicrosPerMTok);
  } else {
    if (!price.perImageMicros || !count(price.perImageMicros)) return null;
    micros += price.perImageMicros;
  }
  if (price.textOutputMicrosPerMTok !== null) {
    if (price.maxTextOutputTokens === null || !count(price.maxTextOutputTokens)) return null;
    micros += perMillion(price.maxTextOutputTokens, price.textOutputMicrosPerMTok);
  }
  return micros;
}

/**
 * The actual charge for a finished call, in the price's own unit: per-image
 * prices multiply the images returned; token prices price the reported usage.
 * Anything the price does not cover (image input tokens; text output without a
 * rate; missing usage on a token price; an invalid count) is unpriceable: null,
 * which settlement records as the full reservation, never as zero.
 */
export function imageCallCostMicros(price: ImagePrice, usage: ImageUsage | null, images: number): number | null {
  if (!count(images)) return null;
  if (usage) {
    const values = [usage.textInputTokens, usage.imageInputTokens, usage.imageOutputTokens, usage.textOutputTokens];
    if (!values.every(count) || usage.imageInputTokens > 0) return null;
    if (usage.textOutputTokens > 0 && price.textOutputMicrosPerMTok === null) return null;
  }
  const text = usage ? perMillion(usage.textInputTokens, price.inputMicrosPerMTok) + (usage.textOutputTokens > 0 ? perMillion(usage.textOutputTokens, price.textOutputMicrosPerMTok!) : 0) : 0;
  if (price.unit === 'image') {
    if (!price.perImageMicros) return null;
    // A per-image price that also bills tokens (prompt input, text or thinking) needs the usage to price them.
    if (!usage && (price.inputMicrosPerMTok > 0 || price.textOutputMicrosPerMTok !== null)) return null;
    return images * price.perImageMicros + text;
  }
  if (!usage) return null;
  return text + perMillion(usage.imageOutputTokens, price.outputMicrosPerMTok);
}

/** Reported usage as the token counts recorded on the operation (never used to price it). */
export function imageUsageTokens(usage: ImageUsage | null): TokenUsage | null {
  if (!usage || ![usage.textInputTokens, usage.imageOutputTokens, usage.textOutputTokens].every(count)) return null;
  return { inputTokens: usage.textInputTokens, cachedInputTokens: 0, outputTokens: usage.imageOutputTokens + usage.textOutputTokens };
}
