import { ForbiddenException, Injectable, Logger, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AbilityFactory } from '../../authorization/ability.factory.js';
import { isActivePermissionKey } from '../../identity/permissions.js';
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY, PUBLIC_ROUTE_KEY, SESSION_ONLY_KEY, type AuthenticatedRequest } from '../decorators.js';
import { isAdminPath } from './admin-path.js';

/**
 * Default-deny authorisation (SRS RBAC 006, MOD 002 acceptance): an admin route
 * must declare @Public, @SessionOnly or @RequirePermissions; anything else is
 * refused and logged as a programming error, so a new endpoint cannot ship open.
 *
 * The decision is taken through the CASL ability built from the administrator's
 * effective permissions, which the session guard has already resolved
 * (role-inherited ∪ direct, active only). Codes that are not in the code
 * catalogue, or are retired in it, can never satisfy a requirement — a typo or a
 * stale database row fails closed rather than granting access.
 *
 * The refusal message never says which permission was missing or where it would
 * have come from; the request id in the envelope is what a report quotes.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly abilities: AbilityFactory,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!isAdminPath(req)) return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, targets)) return true;
    if (!req.admin) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Access denied' });
    if (this.reflector.getAllAndOverride<boolean>(SESSION_ONLY_KEY, targets)) return true;

    const anyOf = this.reflector.getAllAndOverride<string[] | undefined>(ANY_PERMISSIONS_KEY, targets);
    if (anyOf && anyOf.length > 0) {
      const undeclaredAny = anyOf.filter((key) => !isActivePermissionKey(key));
      if (undeclaredAny.length > 0) {
        this.logger.error(`route ${req.method} ${req.path} accepts unregistered or retired permission(s): ${undeclaredAny.join(', ')}`);
        throw new ForbiddenException({ code: 'PERMISSION_UNDECLARED', message: 'Access denied' });
      }
      if (!AbilityFactory.allowsAny(this.abilities.build(req.admin.permissions), anyOf)) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You do not have permission to do that' });
      }
      return true;
    }
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, targets);
    if (!required || required.length === 0) {
      this.logger.error(`route ${req.method} ${req.path} declares no permission; denied by default`);
      throw new ForbiddenException({ code: 'PERMISSION_UNDECLARED', message: 'Access denied' });
    }
    const undeclared = required.filter((key) => !isActivePermissionKey(key));
    if (undeclared.length > 0) {
      this.logger.error(`route ${req.method} ${req.path} requires unregistered or retired permission(s): ${undeclared.join(', ')}`);
      throw new ForbiddenException({ code: 'PERMISSION_UNDECLARED', message: 'Access denied' });
    }
    const ability = this.abilities.build(req.admin.permissions);
    if (!AbilityFactory.allows(ability, required)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You do not have permission to do that' });
    }
    return true;
  }
}
