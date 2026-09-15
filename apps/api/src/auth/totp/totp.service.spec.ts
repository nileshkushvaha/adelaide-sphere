import * as OTPAuth from 'otpauth';
import { TotpService } from './totp.service.js';

describe('TotpService', () => {
  const svc = new TotpService();

  it('generates a base32 secret and an otpauth URI with issuer and label', () => {
    const secret = svc.generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    const uri = svc.otpauthUri(secret, 'admin@example.com');
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('issuer=Melbourne%20Sphere%20Admin');
    expect(uri).toContain(`secret=${secret}`);
  });

  it('verifies current codes within a one-step window and rejects malformed or stale codes', () => {
    const secret = svc.generateSecret();
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 });
    const now = Date.now();
    expect(svc.verify(secret, totp.generate({ timestamp: now }), now)).toBe(0);
    expect(svc.verify(secret, totp.generate({ timestamp: now - 30_000 }), now)).toBe(-1);
    expect(svc.verify(secret, totp.generate({ timestamp: now - 90_000 }), now)).toBeNull();
    expect(svc.verify(secret, '12345', now)).toBeNull();
    expect(svc.verify(secret, 'abcdef', now)).toBeNull();
  });

  it('recovery codes are unique, human-friendly, normalised and hashed', () => {
    const codes = svc.generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(TotpService.hashRecoveryCode(' ABCD-EFGH ')).toBe(TotpService.hashRecoveryCode('abcdefgh'));
    expect(TotpService.hashRecoveryCode(codes[0]!)).not.toContain(codes[0]!.replace('-', ''));
  });
});
