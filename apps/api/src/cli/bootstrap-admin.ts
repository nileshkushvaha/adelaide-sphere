/**
 * One-time operator procedure to create the first Super Admin (SRS ADM 001).
 *
 *   ADMIN_BOOTSTRAP_EMAIL=you@example.com ADMIN_BOOTSTRAP_DISPLAY_NAME="Your Name" \
 *   ADMIN_BOOTSTRAP_PASSWORD='<12+ chars>' pnpm --filter api admin:bootstrap
 *
 * The password is read from the environment (never argv, never a default) and
 * is not echoed. Refuses to run when any administrator already exists; use the
 * admins.manage flows for additional accounts. Also seeds permissions/roles
 * idempotently (safe to re-run as `admin:seed-rbac`).
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { AuditService } from '../audit/audit.service.js';
import { PasswordService } from '../auth/password.service.js';
import { IdentityService, normaliseEmail } from '../identity/identity.service.js';
import { SUPER_ADMIN_ROLE } from '../identity/permissions.js';

async function main(): Promise<void> {
  const mode = process.argv[2] === '--seed-only' ? 'seed' : 'bootstrap';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'], abortOnError: false });
  try {
    const identity = app.get(IdentityService);
    const seeded = await identity.seedRbac();
    console.log(`[bootstrap] RBAC seeded (permissions created: ${seeded.permissionsCreated}, grants carried over: ${seeded.grantsCarriedOver}, role created: ${seeded.roleCreated})`);
    if (mode === 'seed') return;

    const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim();
    const displayName = process.env.ADMIN_BOOTSTRAP_DISPLAY_NAME?.trim();
    const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
    if (!email || !displayName || !password) {
      throw new Error('ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_DISPLAY_NAME and ADMIN_BOOTSTRAP_PASSWORD are required (password from the environment, never a default)');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('ADMIN_BOOTSTRAP_EMAIL is not a valid email address');
    const policyError = PasswordService.validate(password);
    if (policyError) throw new Error(policyError);
    if (normaliseEmail(email) === password.trim().toLowerCase()) throw new Error('Password must not be the email address');
    if ((await identity.countAdmins()) > 0) {
      throw new Error('An administrator already exists; bootstrap runs only once. Create further admins through the admin application.');
    }
    const passwords = app.get(PasswordService);
    const admin = await identity.createAdmin({ email, displayName, passwordHash: await passwords.hash(password), roleKeys: [SUPER_ADMIN_ROLE.key] });
    await app.get(AuditService).recordOrThrow({ action: 'admin.bootstrap', targetType: 'admin_user', targetId: admin.id, metadata: { role: SUPER_ADMIN_ROLE.key } });
    console.log(`[bootstrap] Super Admin created: ${admin.email} (${admin.id})`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(`[bootstrap] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
