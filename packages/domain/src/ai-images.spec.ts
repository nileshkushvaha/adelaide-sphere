import { altTextProblem, effectiveImageMode, imagePromptProblems, imagePromptWithPolicy, imageTokenUsage, IMAGE_POLICY_SUFFIX, maxImageCallCostMicros } from './ai-images.js';

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

describe('image cost (integer micro-units, fail closed)', () => {
  const rates = { inputMicrosPerMTok: 5_000_000, outputMicrosPerMTok: 30_000_000 };
  it('bounds a call by the prompt bytes and the approved output bound, and refuses without a bound', () => {
    // 400 prompt bytes at USD 5/M plus 2,000 output tokens at USD 30/M = 0.002 + 0.06 = USD 0.062.
    expect(maxImageCallCostMicros(rates, 400, 2000)).toBe(2000 + 60_000);
    expect(maxImageCallCostMicros(rates, 400, null)).toBeNull();
    expect(maxImageCallCostMicros(rates, 400, 0)).toBeNull();
  });
  it('maps reported usage to priced units, and anything unpriced to null, never zero', () => {
    expect(imageTokenUsage({ textInputTokens: 90, imageInputTokens: 0, imageOutputTokens: 1600, textOutputTokens: 0 })).toEqual({ inputTokens: 90, cachedInputTokens: 0, outputTokens: 1600 });
    expect(imageTokenUsage({ textInputTokens: 90, imageInputTokens: 10, imageOutputTokens: 1600, textOutputTokens: 0 })).toBeNull();
    expect(imageTokenUsage({ textInputTokens: 90, imageInputTokens: 0, imageOutputTokens: 1600, textOutputTokens: 5 })).toBeNull();
    expect(imageTokenUsage({ textInputTokens: -1, imageInputTokens: 0, imageOutputTokens: 1600, textOutputTokens: 0 })).toBeNull();
    expect(imageTokenUsage(null)).toBeNull();
  });
});
