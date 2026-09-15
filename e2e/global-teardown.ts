import { canProvision, cleanUp } from './specs/provisioning.js';

/**
 * Playwright global teardown: retire every authentication artifact the
 * journeys can create (provisioned administrators, their sessions, their
 * reset/set-up links, e2e roles). It runs whether the run passed, failed or
 * was interrupted after the first test, and only where provisioning itself is
 * allowed (never production, never an unmarked database).
 */
export default async function globalTeardown(): Promise<void> {
  if (!canProvision()) return;
  await cleanUp();
}
