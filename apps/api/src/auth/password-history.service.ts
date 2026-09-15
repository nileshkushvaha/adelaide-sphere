import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { PasswordService } from './password.service.js';
import { SecurityPolicyService } from './security-policy.service.js';

/**
 * Password reuse prevention (SRS 1.2 SECS 003).
 *
 * Two rules:
 *
 *  * **The current password is always refused.** "Changing" a password to
 *    itself is not a change, whatever the history setting says — it used to be
 *    allowed whenever the depth was zero.
 *  * **The configured depth is how many earlier passwords are refused too**
 *    (default 3, set in the security settings). A depth of zero keeps no
 *    history and prunes what is there, so the setting means what it says.
 *
 * Only hashes are kept, and only as many as the depth needs: a candidate is
 * verified against them, never compared, and nothing here can reveal a previous
 * password.
 */
@Injectable()
export class PasswordHistoryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly passwords: PasswordService,
    private readonly policy: SecurityPolicyService,
  ) {}

  /** Refuses the current password, and any the administrator used within the configured depth. */
  async assertNotReused(adminId: string, candidate: string, currentHash: string | null): Promise<void> {
    const { passwordHistoryDepth } = await this.policy.policy();
    if (currentHash && (await this.passwords.verify(currentHash, candidate))) {
      throw this.refusal(passwordHistoryDepth);
    }
    if (passwordHistoryDepth === 0) return;

    const db = await this.database.client();
    const previous = await db.adminPasswordHistory.findMany({
      where: { adminId },
      orderBy: { createdAt: 'desc' },
      take: passwordHistoryDepth,
      select: { passwordHash: true },
    });
    for (const entry of previous) {
      if (await this.passwords.verify(entry.passwordHash, candidate)) throw this.refusal(passwordHistoryDepth);
    }
  }

  /**
   * Records the hash being replaced and prunes beyond the configured depth, so
   * the store never holds more history than the policy asks for.
   */
  async record(adminId: string, replacedHash: string | null): Promise<void> {
    const { passwordHistoryDepth } = await this.policy.policy();
    const db = await this.database.client();
    if (passwordHistoryDepth === 0) {
      await db.adminPasswordHistory.deleteMany({ where: { adminId } });
      return;
    }
    if (replacedHash) await db.adminPasswordHistory.create({ data: { adminId, passwordHash: replacedHash } });

    const keep = await db.adminPasswordHistory.findMany({ where: { adminId }, orderBy: { createdAt: 'desc' }, take: passwordHistoryDepth, select: { id: true } });
    await db.adminPasswordHistory.deleteMany({ where: { adminId, id: { notIn: keep.map((row) => row.id) } } });
  }

  private refusal(depth: number): HttpException {
    const message =
      depth === 0
        ? 'Choose a password that is different from your current one.'
        : `Choose a password that is different from your current one and the ${depth} before it.`;
    return new HttpException(
      { code: 'PASSWORD_REUSED', message, fields: { newPassword: ['You have used this password recently. Choose a different one.'] } },
      HttpStatus.BAD_REQUEST,
    );
  }
}
