import { altTextProblem, effectiveImageMode, imagePromptProblems, imagePromptWithPolicy, imageCallCostMicros, imageUsageTokens, IMAGE_POLICY_SUFFIX, maxImageCallCostMicros, type ImagePrice } from './ai-images.js';

describe('image mode', () => {
  it('lets an article override the global mode, and treats anything unapproved as manual', () => {
    expect(effectiveImageMode('hybrid', null)).toBe('hybrid');
    expect(effectiveImageMode('hybrid', 'manual')).toBe('manual');
    expect(effectiveImageMode('manual', 'hybrid')).toBe('hybrid');
    // Automatic is not approved: it never enables a generation path.
    expect(effectiveImageMode('automatic', null)).toBe('manual');
    expect(effectiveImageMode(undefined, undefined)).toBe('manual');
  });
});

describe('image prompts', () => {
  const location = ['Adelaide, South Australia'];
  it('accepts a generic illustrative scene, the configured location included', () => {
    expect(imagePromptProblems('A sunny laneway café scene with outdoor tables, in Adelaide', location)).toBeNull();
    expect(imagePromptProblems('an illustrative cafe counter with pastries and coffee cups', location)).toBeNull();
  });
  it('refuses a prompt that names a business, venue or event, and empty or oversized prompts', () => {
    expect(imagePromptProblems('The front of Example Cafe on The Parade', location)).toMatchObject({ problem: 'names_a_place_or_business', names: expect.arrayContaining(['Example Cafe']) });
    expect(imagePromptProblems('a crowd at the Fringe Festival', location)?.problem).toBe('names_a_place_or_business');
    expect(imagePromptProblems('  ', location)?.problem).toBe('empty');
    expect(imagePromptProblems('x'.repeat(1001), location)?.problem).toBe('too_long');
  });
  it('always appends the illustrative-only policy', () => {
    expect(imagePromptWithPolicy(' a market stall ')).toBe(`a market stall\n\n${IMAGE_POLICY_SUFFIX}`);
    expect(IMAGE_POLICY_SUFFIX).toMatch(/not a photograph of a real place/);
  });
});

describe('alt text from the actual image', () => {
  it('requires a real description, not a placeholder or the pre-generation draft', () => {
    expect(altTextProblem('Illustration of a café counter with a coffee machine and pastries', 'Illustration of a cafe counter')).toBeNull();
    expect(altTextProblem('', null)).toMatch(/Describe/);
    expect(altTextProblem('Image', null)).toMatch(/actually shows/);
    expect(altTextProblem('Illustration of a cafe counter', 'Illustration of a cafe counter')).toMatch(/generated image/);
    expect(altTextProblem('x'.repeat(256), null)).toMatch(/255/);
  });
});

describe('image cost in the unit of the price (integer micro-units, fail closed)', () => {
  const token: ImagePrice = { unit: 'token', inputMicrosPerMTok: 5_000_000, outputMicrosPerMTok: 30_000_000, textOutputMicrosPerMTok: null, perImageMicros: null, maxOutputTokens: 2000, maxTextOutputTokens: null };
  const perImage: ImagePrice = { unit: 'image', inputMicrosPerMTok: 0, outputMicrosPerMTok: 0, textOutputMicrosPerMTok: null, perImageMicros: 40_000, maxOutputTokens: null, maxTextOutputTokens: null };
  // Image tokens plus billed thinking/text output (for example USD 60 and 3 per 1M).
  // Gemini-style: a published per-image price, plus prompt input and billed text/thinking output per token.
  const perImageThinking: ImagePrice = { unit: 'image', inputMicrosPerMTok: 500_000, outputMicrosPerMTok: 0, textOutputMicrosPerMTok: 3_000_000, perImageMicros: 67_000, maxOutputTokens: null, maxTextOutputTokens: 4000 };
  const thinking: ImagePrice = { unit: 'token', inputMicrosPerMTok: 500_000, outputMicrosPerMTok: 60_000_000, textOutputMicrosPerMTok: 3_000_000, perImageMicros: null, maxOutputTokens: 1120, maxTextOutputTokens: 4000 };
  it('bounds one call by its unit, and refuses what cannot be bounded', () => {
    // 400 prompt bytes at USD 5/M plus 2,000 image tokens at USD 30/M = 0.002 + 0.06.
    expect(maxImageCallCostMicros(token, 400)).toBe(2000 + 60_000);
    expect(maxImageCallCostMicros({ ...token, maxOutputTokens: null }, 400)).toBeNull();
    // Per image: the flat price (and prompt input, free here).
    expect(maxImageCallCostMicros(perImage, 400)).toBe(40_000);
    expect(maxImageCallCostMicros({ ...perImage, perImageMicros: null }, 400)).toBeNull();
    // Billed thinking needs its own bound: 400 * 0.5 + 1,120 * 60 + 4,000 * 3 (micro-USD per token).
    expect(maxImageCallCostMicros(thinking, 400)).toBe(200 + 67_200 + 12_000);
    expect(maxImageCallCostMicros({ ...thinking, maxTextOutputTokens: null }, 400)).toBeNull();
  });
  it('settles per image by count, and per token from usage, never pricing the unpriceable as zero', () => {
    expect(imageCallCostMicros(perImage, null, 1)).toBe(40_000);
    expect(imageCallCostMicros(perImage, null, 2)).toBe(80_000);
    expect(imageCallCostMicros(token, { textInputTokens: 60, imageInputTokens: 0, imageOutputTokens: 1600, textOutputTokens: 0 }, 1)).toBe(300 + 48_000);
    expect(imageCallCostMicros(thinking, { textInputTokens: 60, imageInputTokens: 0, imageOutputTokens: 1120, textOutputTokens: 900 }, 1)).toBe(30 + 67_200 + 2_700);
    // Unpriceable: missing usage on a token price; image input; text output with no rate; an invalid count.
    expect(imageCallCostMicros(token, null, 1)).toBeNull();
    expect(imageCallCostMicros(token, { textInputTokens: 60, imageInputTokens: 5, imageOutputTokens: 1600, textOutputTokens: 0 }, 1)).toBeNull();
    expect(imageCallCostMicros(token, { textInputTokens: 60, imageInputTokens: 0, imageOutputTokens: 1600, textOutputTokens: 3 }, 1)).toBeNull();
    expect(imageCallCostMicros(perImage, null, -1)).toBeNull();
    // Per image plus tokens: the image tokens are in the per-image price; input and thinking/text are added, never zero.
    expect(maxImageCallCostMicros(perImageThinking, 400)).toBe(200 + 67_000 + 12_000);
    expect(imageCallCostMicros(perImageThinking, { textInputTokens: 60, imageInputTokens: 0, imageOutputTokens: 1120, textOutputTokens: 900 }, 1)).toBe(30 + 67_000 + 2_700);
    expect(imageCallCostMicros(perImageThinking, null, 1)).toBeNull();
    expect(imageUsageTokens({ textInputTokens: 60, imageInputTokens: 0, imageOutputTokens: 1120, textOutputTokens: 900 })).toEqual({ inputTokens: 60, cachedInputTokens: 0, outputTokens: 2020 });
  });
});
