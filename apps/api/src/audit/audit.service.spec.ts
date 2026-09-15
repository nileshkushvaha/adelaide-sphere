import { sanitiseMetadata } from './audit.service.js';

describe('audit metadata sanitisation', () => {
  it('drops sensitive-looking keys and non-scalar values, and caps strings', () => {
    const out = sanitiseMetadata({
      reason: 'x'.repeat(500),
      password: 'nope',
      resetToken: 'nope',
      cookie: 'nope',
      passwordHash: 'nope',
      nested: { a: 1 },
      count: 3,
      flag: false,
      nothing: null,
    });
    expect(Object.keys(out).sort()).toEqual(['count', 'flag', 'nothing', 'reason']);
    expect((out.reason as string).length).toBe(200);
  });
});
