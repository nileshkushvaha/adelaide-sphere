import { Module } from '@nestjs/common';
import { AbilityFactory } from './ability.factory.js';
import { AuthorizationController } from './authorization.controller.js';
import { AuthorizationService } from './authorization.service.js';
import { EffectivePermissionsService } from './effective-permissions.service.js';
import { SensitiveThrottleService } from './sensitive-throttle.service.js';

/**
 * AuthorizationModule (SRS RBAC 002–012): the effective-permission resolver and
 * its cache, the CASL ability factory the guard decides with, and the access
 * administration API. The resolver and factory depend on nothing but the
 * database and Redis, so authentication can depend on them without a cycle:
 * identity is established first, then this module says what that identity may do.
 */
@Module({
  controllers: [AuthorizationController],
  providers: [EffectivePermissionsService, AbilityFactory, AuthorizationService, SensitiveThrottleService],
  exports: [EffectivePermissionsService, AbilityFactory, AuthorizationService, SensitiveThrottleService],
})
export class AuthorizationModule {}
