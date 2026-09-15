import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { isAdminPath } from './admin-path.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF defence for cookie-authenticated admin mutations (SRS SEC 001), in
 * addition to SameSite=Strict: the request must prove it came from a trusted
 * browser origin via Origin, else Referer, else `Sec-Fetch-Site: same-origin`.
 * Applies to login too (login CSRF). Non-admin and read-only requests pass.
 */
@Injectable()
export class CsrfOriginGuard implements CanActivate {
  private readonly trusted: Set<string>;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.trusted = new Set(config.get('TRUSTED_ORIGINS', { infer: true }));
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!isAdminPath(req) || !MUTATING.has(req.method)) return true;
    if (this.isTrusted(req)) return true;
    throw new ForbiddenException({ code: 'CSRF_ORIGIN_REJECTED', message: 'Request origin is not allowed' });
  }

  isTrusted(req: Pick<Request, 'headers'>): boolean {
    const origin = header(req, 'origin');
    if (origin) return this.trusted.has(normalise(origin));
    const referer = header(req, 'referer');
    if (referer) {
      try {
        return this.trusted.has(new URL(referer).origin);
      } catch {
        return false;
      }
    }
    return header(req, 'sec-fetch-site') === 'same-origin';
  }
}

function header(req: Pick<Request, 'headers'>, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function normalise(origin: string): string {
  try {
    return new URL(origin).origin;
  } catch {
    return origin.replace(/\/+$/, '');
  }
}
