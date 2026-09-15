import { renderCopyright } from './copyright';

describe('renderCopyright', () => {
  const context = { year: 2026, name: 'Adelaide Sphere' };

  it('substitutes the year and the application name', () => {
    expect(renderCopyright('© {year} {name}. All rights reserved.', context)).toBe('© 2026 Adelaide Sphere. All rights reserved.');
  });

  it('falls back to the built-in line when nothing is configured', () => {
    // Matches the API's own fallback, so the line never differs between tiers.
    expect(renderCopyright(null, context)).toBe('© 2026 Adelaide Sphere. All rights reserved.');
    expect(renderCopyright('', context)).toBe('© 2026 Adelaide Sphere. All rights reserved.');
    expect(renderCopyright('   ', context)).toBe('© 2026 Adelaide Sphere. All rights reserved.');
  });

  it('leaves an unknown placeholder alone rather than guessing', () => {
    // The API refuses to store one, so this only happens for a document saved
    // before that rule existed; printing it literally is the honest outcome.
    expect(renderCopyright('© {year} {org}', context)).toBe('© 2026 {org}');
  });

  it('substitutes every occurrence', () => {
    expect(renderCopyright('{name} · © {year} {name}', context)).toBe('Adelaide Sphere · © 2026 Adelaide Sphere');
  });
});
