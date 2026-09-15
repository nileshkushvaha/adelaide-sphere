import { Injectable, Logger } from '@nestjs/common';

export type CaptchaResult = { ok: true } | { ok: false; reason: 'invalid' | 'missing' };

/** Thrown when the verifier itself is unreachable; public writes fail safe (SRS SEC 003). */
export class CaptchaUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Captcha verification unavailable', cause === undefined ? undefined : { cause });
    this.name = 'CaptchaUnavailableError';
  }
}

/**
 * Server-side human-verification port (SRS SEC 002). Implementations verify the
 * token, the expected hostname and the action; a passing challenge never grants
 * any authority beyond accepting one submission.
 */
@Injectable()
export abstract class CaptchaPort {
  protected readonly logger = new Logger(CaptchaPort.name);
  abstract verify(token: string | undefined, action: string, remoteIp: string | undefined): Promise<CaptchaResult>;
  /** False when no provider is configured, so callers can explain that submissions are closed instead of pretending. */
  abstract readonly configured: boolean;
}
