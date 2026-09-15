import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { CaptchaPort, CaptchaUnavailableError, type CaptchaResult } from './captcha.port.js';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 5_000;

interface SiteverifyResponse {
  success: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
}

/**
 * Cloudflare Turnstile verification (SRS SEC 002): the token is checked server
 * side together with the expected hostname and action. Network or provider
 * failures raise `CaptchaUnavailableError` so the caller can answer 503 rather
 * than accept unverified content (SEC 003).
 */
@Injectable()
export class TurnstileVerifier extends CaptchaPort {
  readonly configured: boolean;
  private readonly secret: string;
  private readonly expectedHostname: string | undefined;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super();
    this.secret = config.get('TURNSTILE_SECRET_KEY', { infer: true }) ?? '';
    this.configured = this.secret.length > 0;
    const publicUrl = config.get('PUBLIC_SITE_URL', { infer: true });
    this.expectedHostname = publicUrl ? new URL(publicUrl).hostname : undefined;
  }

  async verify(token: string | undefined, action: string, remoteIp: string | undefined): Promise<CaptchaResult> {
    if (!this.configured) throw new CaptchaUnavailableError(new Error('TURNSTILE_SECRET_KEY is not configured'));
    if (!token) return { ok: false, reason: 'missing' };
    const body = new URLSearchParams({ secret: this.secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);
    let payload: SiteverifyResponse;
    try {
      const response = await fetch(SITEVERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) throw new Error(`siteverify ${response.status}`);
      payload = (await response.json()) as SiteverifyResponse;
    } catch (error) {
      this.logger.warn('turnstile verification failed to complete');
      throw new CaptchaUnavailableError(error);
    }
    if (!payload.success) {
      this.logger.debug(`turnstile rejected: ${(payload['error-codes'] ?? []).join(',')}`);
      return { ok: false, reason: 'invalid' };
    }
    if (this.expectedHostname && payload.hostname && payload.hostname !== this.expectedHostname) {
      this.logger.warn('turnstile hostname mismatch');
      return { ok: false, reason: 'invalid' };
    }
    // The site's widget always sends its action, so a missing one is a token minted elsewhere.
    if (payload.action !== action) {
      this.logger.warn('turnstile action mismatch');
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true };
  }
}
