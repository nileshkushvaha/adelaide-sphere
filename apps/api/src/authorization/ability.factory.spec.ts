import { AbilityFactory, ADMIN_SUBJECT } from './ability.factory.js';

const factory = new AbilityFactory();

describe('AbilityFactory', () => {
  it('grants exactly the codes it was given', () => {
    const ability = factory.build(['listings.read', 'reviews.moderate']);
    expect(AbilityFactory.allows(ability, ['listings.read'])).toBe(true);
    expect(AbilityFactory.allows(ability, ['listings.read', 'reviews.moderate'])).toBe(true);
    expect(AbilityFactory.allows(ability, ['listings.update'])).toBe(false);
    expect(AbilityFactory.allows(ability, ['listings.read', 'listings.update'])).toBe(false);
  });

  it('never lets a ".manage" code become a wildcard over its resource', () => {
    // CASL reserves the action "manage" for "every action". Splitting
    // `admins.manage` into can('manage', 'admins') would silently grant
    // `admins.access.manage` — the escalation this mapping exists to avoid.
    const ability = factory.build(['admins.view']);
    expect(AbilityFactory.allows(ability, ['admins.view'])).toBe(true);
    expect(AbilityFactory.allows(ability, ['admins.access.manage'])).toBe(false);
    expect(ability.can('manage', ADMIN_SUBJECT)).toBe(false);
  });

  it('ignores codes outside the catalogue instead of granting them', () => {
    const ability = factory.build(['listings.read', 'listings.everything', 'made.up']);
    expect(AbilityFactory.allows(ability, ['listings.read'])).toBe(true);
    expect(AbilityFactory.allows(ability, ['listings.everything'])).toBe(false);
    expect(AbilityFactory.allows(ability, ['made.up'])).toBe(false);
  });

  it('grants nothing to an administrator with no permissions', () => {
    const ability = factory.build([]);
    expect(AbilityFactory.allows(ability, ['listings.read'])).toBe(false);
    expect(AbilityFactory.allows(ability, [])).toBe(true); // a requirement of nothing is not a grant of anything
  });
});
