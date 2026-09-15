import { FieldEncryptionService } from './field-encryption.service.js';

const KEY = Buffer.alloc(32, 7).toString('base64');
const svc = () => new FieldEncryptionService({ get: () => KEY } as never);

describe('FieldEncryptionService', () => {
  it('round-trips with a versioned, IV-randomised format and binds to the AAD', () => {
    const a = svc().encrypt('JBSWY3DPEHPK3PXP', 'admin-1');
    const b = svc().encrypt('JBSWY3DPEHPK3PXP', 'admin-1');
    expect(a).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('JBSWY3DPEHPK3PXP');
    expect(svc().decrypt(a, 'admin-1')).toBe('JBSWY3DPEHPK3PXP');
    expect(() => svc().decrypt(a, 'admin-2')).toThrow();
    const [v, iv, tag, ct] = a.split(':');
    const tampered = `${v}:${iv}:${tag}:${(ct![0] === 'A' ? 'B' : 'A') + ct!.slice(1)}`;
    expect(() => svc().decrypt(tampered, 'admin-1')).toThrow();
    expect(() => svc().decrypt('v0:x:y:z', 'admin-1')).toThrow(/Unsupported/);
  });

  it('fails with a different key', () => {
    const other = new FieldEncryptionService({ get: () => Buffer.alloc(32, 9).toString('base64') } as never);
    expect(() => other.decrypt(svc().encrypt('secret', 'x'), 'x')).toThrow();
  });
});
