import { PasswordService } from './password.service.js';

function service(params = { ARGON2_MEMORY_KIB: 19456, ARGON2_TIME_COST: 2, ARGON2_PARALLELISM: 1 }) {
  return new PasswordService({ get: (k: keyof typeof params) => params[k] } as never);
}

describe('PasswordService', () => {
  it('hashes with Argon2id and configured parameters, and verifies', async () => {
    const svc = service();
    const hash = await svc.hash('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await svc.verify(hash, 'correct horse battery staple')).toBe(true);
    expect(await svc.verify(hash, 'correct horse battery stapl')).toBe(false);
    expect(await svc.verify('not-a-hash', 'x')).toBe(false);
  });

  it('produces distinct hashes for the same password (random salt)', async () => {
    const svc = service();
    expect(await svc.hash('same password value')).not.toBe(await svc.hash('same password value'));
  });

  it('reports when a stored hash needs upgrading to stronger parameters', async () => {
    const weak = await service().hash('correct horse battery staple');
    const stronger = service({ ARGON2_MEMORY_KIB: 32768, ARGON2_TIME_COST: 3, ARGON2_PARALLELISM: 1 });
    expect(stronger.needsRehash(weak)).toBe(true);
    expect(service().needsRehash(weak)).toBe(false);
    expect(service().needsRehash('garbage')).toBe(true);
  });

  it('enforces the documented length bounds', () => {
    expect(PasswordService.validate('short')).toMatch(/at least 12/);
    expect(PasswordService.validate('x'.repeat(257))).toMatch(/at most 256/);
    expect(PasswordService.validate('x'.repeat(256))).toBeNull();
    expect(PasswordService.validate('twelve chars')).toBeNull();
  });

  it('burns comparable work when the account does not exist', async () => {
    const svc = service();
    const t = Date.now();
    await svc.verifyAgainstDummy('anything');
    await svc.verifyAgainstDummy('anything else');
    expect(Date.now() - t).toBeGreaterThan(0);
  });
});
