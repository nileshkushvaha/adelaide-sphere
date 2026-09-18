import type { Prisma } from '../generated/prisma/client.js';

export const AI_CONTROL_ID = 'default';
const SETTINGS_GROUP = 'ai_content';
const SETTINGS_KEY = 'defaults';

export interface AutomationControl {
  /** Advances whenever a safety-relevant AI setting changes; in-flight work captured an older one. */
  epoch: number;
  /** The configured enable switch; a missing settings row means the disabled default. */
  enabled: boolean;
  settingsVersion: number;
}

/**
 * Live controls, read inside the caller's transaction. The control row is
 * read with a shared lock, so a settings save that advances the epoch waits
 * for, or is seen by, the transaction that relies on it.
 */
export async function readAutomationControl(tx: Prisma.TransactionClient): Promise<AutomationControl> {
  const rows = await tx.$queryRaw<{ epoch: number }[]>`SELECT epoch FROM ai_automation_controls WHERE id = ${AI_CONTROL_ID} FOR SHARE`;
  const setting = await tx.setting.findUnique({ where: { group_key: { group: SETTINGS_GROUP, key: SETTINGS_KEY } }, select: { data: true, version: true } });
  const data = (setting?.data ?? {}) as { enabled?: unknown };
  return { epoch: Number(rows[0]?.epoch ?? 0), enabled: data.enabled === true, settingsVersion: setting?.version ?? 0 };
}

/** Fences all in-flight AI work; called in the transaction that saves a safety-relevant setting. */
export async function advanceControlEpoch(tx: Prisma.TransactionClient): Promise<number> {
  await tx.$executeRaw`INSERT INTO ai_automation_controls (id, epoch, updatedAt) VALUES (${AI_CONTROL_ID}, 2, UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE epoch = epoch + 1, updatedAt = UTC_TIMESTAMP(3)`;
  const rows = await tx.$queryRaw<{ epoch: number }[]>`SELECT epoch FROM ai_automation_controls WHERE id = ${AI_CONTROL_ID}`;
  return Number(rows[0]?.epoch ?? 0);
}
