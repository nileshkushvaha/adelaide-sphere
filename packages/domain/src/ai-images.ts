/**
 * Pure rules for AI featured images (AI SRS §12; plan §H; owner decisions of
 * 19 September 2026). Browser-safe: no provider, database or network code.
 * Deployment wording (the disclosure) comes from settings, never from here.
 */
import { namePhrases, type TokenRates, type TokenUsage } from './ai-generation.js';

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
 * Worst case for one image: the prompt's bytes as text tokens (a token is at
 * least one byte) plus the approved bound on output tokens for the configured
 * size and quality. Null when no bound is approved: unknown cost fails closed.
 */
export function maxImageCallCostMicros(rates: Pick<TokenRates, 'inputMicrosPerMTok' | 'outputMicrosPerMTok'>, promptBytes: number, maxOutputTokens: number | null): number | null {
  if (!maxOutputTokens || !Number.isInteger(maxOutputTokens) || maxOutputTokens <= 0 || !Number.isInteger(promptBytes) || promptBytes < 0) return null;
  return perMillion(promptBytes, rates.inputMicrosPerMTok) + perMillion(maxOutputTokens, rates.outputMicrosPerMTok);
}

/**
 * Maps reported image usage onto the priced token units: text input and image
 * output. Anything the approved price does not cover (image input, text
 * output) or any invalid count makes the call unpriceable: null, which the
 * settlement records as the full reservation, never as zero.
 */
export function imageTokenUsage(usage: ImageUsage | null): TokenUsage | null {
  if (!usage) return null;
  const values = [usage.textInputTokens, usage.imageInputTokens, usage.imageOutputTokens, usage.textOutputTokens];
  if (values.some((v) => !Number.isInteger(v) || v < 0)) return null;
  if (usage.imageInputTokens > 0 || usage.textOutputTokens > 0) return null;
  return { inputTokens: usage.textInputTokens, cachedInputTokens: 0, outputTokens: usage.imageOutputTokens };
}
