import { HttpException, HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/decorators.js';
import { SENSITIVE_MUTATION_KEY } from './decorators.js';
import { SensitiveThrottleService } from './sensitive-throttle.service.js';

/**
 * Ceiling on privileged mutations (SRS SEC 003). Runs after authentication and
 * authorization, so it bounds what a *legitimately privileged* session — or a
 * stolen one — can do in a burst, and never turns a missing permission into a
 * misleading 429.
 *
 * The refusal uses the standard envelope with `Retry-After`, and says only that
 * the ceiling was reached: not which counter, not how much budget remains.
 */
@Injectable()
export class SensitiveThrottleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly throttle: SensitiveThrottleService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const sensitive = this.reflector.getAllAndOverride<boolean>(SENSITIVE_MUTATION_KEY, [context.getHandler(), context.getClass()]);
    if (!sensitive) return true;
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.admin) return true; // authentication already refused it; nothing to meter
    const decision = await this.throttle.consume(req.admin.id, req.ip);
    if (decision.allowed) return true;
    context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(decision.retryAfterSeconds));
    throw new HttpException(
      { code: 'RATE_LIMITED', message: 'Too many access changes in a short time. Wait a moment and try again.' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
