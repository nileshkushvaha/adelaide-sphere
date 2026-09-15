import { Injectable } from '@nestjs/common';
import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import { isActivePermissionKey } from '../identity/permissions.js';

/** The subject every administrative rule is expressed against; the action is the permission code. */
export const ADMIN_SUBJECT = 'AdminResource' as const;

export type AdminAbility = MongoAbility<[string, typeof ADMIN_SUBJECT]>;

/**
 * Builds the CASL ability for an administrator from their effective permission
 * codes (SRS RBAC 006). This is the NestJS-documented CASL pattern implemented
 * first-party: the factory owns the rules, the guard owns the decision, and the
 * resolver owns where the codes come from.
 *
 * **The whole permission code is the CASL action**, on one fixed subject, rather
 * than splitting `resource.action` into subject and action. CASL reserves two
 * words: the action `manage` means *every* action and the subject `all` means
 * *every* subject. Splitting would turn this catalogue's `admins.manage` into
 * `can('manage', 'admins')` — a wildcard granting `admins.access.manage` and any
 * future `admins.*` code as well. A code always contains a dot, so it can never
 * collide with `manage`, and the rules stay exactly as narrow as the catalogue.
 *
 * `createMongoAbility` is used rather than a bare `PureAbility` so a future
 * condition-based rule (an object-level policy on a loaded record) can be added
 * without changing the guard contract. No conditions are declared today, and no
 * Prisma-coupled matcher is introduced (see ADR 0001).
 */
@Injectable()
export class AbilityFactory {
  /** Codes are the effective set; anything unregistered or retired is ignored, never granted. */
  build(permissions: readonly string[]): AdminAbility {
    const { can, build } = new AbilityBuilder<AdminAbility>(createMongoAbility);
    for (const code of permissions) {
      if (!isActivePermissionKey(code)) continue;
      can(code, ADMIN_SUBJECT);
    }
    return build();
  }

  /** True when the ability allows every required code. Unregistered codes are always false. */
  static allows(ability: AdminAbility, required: readonly string[]): boolean {
    return required.every((code) => isActivePermissionKey(code) && ability.can(code, ADMIN_SUBJECT));
  }

  /** True when the ability allows at least one of the codes (lookup routes shared by several screens). */
  static allowsAny(ability: AdminAbility, accepted: readonly string[]): boolean {
    return accepted.some((code) => isActivePermissionKey(code) && ability.can(code, ADMIN_SUBJECT));
  }
}
