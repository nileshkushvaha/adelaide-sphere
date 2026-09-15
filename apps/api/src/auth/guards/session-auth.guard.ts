import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { parseCookie } from 'cookie';
import type { Response } from 'express';
import { IdentityService } from '../../identity/identity.service.js';
import { PUBLIC_ROUTE_KEY, type AuthenticatedRequest } from '../decorators.js';
import { SESSION_COOKIE_NAME, SessionService } from '../session.service.js';
import { isAdminPath } from './admin-path.js';

/**
 * Global guard: every /api/v1/admin route (except @Public) needs a valid,
 * unexpired, unrevoked session whose admin is active. Attaches the principal
 * and session to the request for the permission guard and handlers.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly identity: IdentityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!isAdminPath(req)) return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const token = readSessionCookie(req);
    const validation = await this.sessions.validate(token);
    if (!validation.ok) {
      if (token) this.sessions.clearCookie(context.switchToHttp().getResponse<Response>());
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Sign in to continue' });
    }
    const principal = await this.identity.getPrincipal(validation.adminId);
    if (!principal || principal.status !== 'active') {
      await this.sessions.revoke(validation.session.id, principal ? 'account_disabled' : 'account_missing');
      this.sessions.clearCookie(context.switchToHttp().getResponse<Response>());
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Sign in to continue' });
    }
    req.admin = principal;
    req.session = validation.session;
    req.sessionToken = token;
    return true;
  }
}

export function readSessionCookie(req: Pick<AuthenticatedRequest, 'headers'>): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  return parseCookie(header)[SESSION_COOKIE_NAME];
}
