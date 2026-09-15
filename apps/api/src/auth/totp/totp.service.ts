import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import * as OTPAuth from 'otpauth';

export const TOTP_ISSUER = 'Adelaide Sphere Admin';
export const RECOVERY_CODE_COUNT = 10;

/**
 * RFC 6238 TOTP (SHA-1, 6 digits, 30 s, ±1 step window) and hashed single-use
 * recovery codes (SRS AUTH 003). Secrets are handled only as base32 strings in
 * memory; persistence encrypts them (FieldEncryptionService).
 */
@Injectable()
export class TotpService {
  generateSecret(): string {
    return new OTPAuth.Secret({ size: 20 }).base32;
  }

  otpauthUri(secretBase32: string, accountLabel: string): string {
    return new OTPAuth.TOTP({ issuer: TOTP_ISSUER, label: accountLabel, algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secretBase32) }).toString();
  }

  /** Returns the matched time-step delta, or null when the code is invalid. */
  verify(secretBase32: string, code: string, timestamp = Date.now()): number | null {
    if (!/^\d{6}$/.test(code)) return null;
    const totp = new OTPAuth.TOTP({ issuer: TOTP_ISSUER, algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secretBase32) });
    return totp.validate({ token: code, window: 1, timestamp });
  }

  /** Human-friendly codes "xxxx-xxxx" (base32 alphabet minus ambiguous chars). */
  generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
    const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: count }, () => {
      const bytes = randomBytes(8);
      const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
      return `${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
    });
  }

  static normaliseRecoveryCode(code: string): string {
    return code.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  static hashRecoveryCode(code: string): string {
    return createHash('sha256').update(TotpService.normaliseRecoveryCode(code)).digest('hex');
  }
}
