import { ConflictException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@adelaide-sphere/database';
import { advanceControlEpoch } from '@adelaide-sphere/database/automation';
import { AuditService, type AuditWriteClient } from '../audit/audit.service.js';
import { CacheService } from '../cache/cache.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { databaseCode, retryTransaction } from '../common/database-retry.js';
import { groupDefaults, settingGroup, validateGroupPayload, type SettingGroupDeclaration, type SettingGroupKey } from './registry.js';

/** AI settings pinned per run as editorial context; changing them does not fence in-flight work. */
const AI_PINNED_CONTEXT_KEYS = new Set(['location', 'editorialStrategy']);

export interface SettingDocument<T = unknown> {
  data: T;
  /** 0 when nothing has been stored and the caller's defaults apply. */
  version: number;
  updatedAt: string;
  updatedByAdminId: string | null;
}

export interface SettingGroupRecord {
  group: SettingGroupKey;
  values: Record<string, boolean | number | string>;
  version: number;
  updatedAt: string;
  updatedByAdminId: string | null;
}

export interface WriteDocumentInput {
  group: SettingGroupKey;
  key: string;
  data: Prisma.InputJsonObject;
  expectedVersion: number;
  actor: AdminPrincipal;
  ctx: RequestContext;
  audit: { action: string; metadata: Record<string, string | number | boolean | null> };
  /** Cache tags this change invalidates; empty means the change caches nothing. */
  tags: readonly string[];
}

/**
 * The one place settings are read and written (SRS 1.2 SET 001–005).
 *
 * Every settings group — the registry-declared security, email and operations
 * groups and the established website group (`home`, `general`) — shares this
 * path, so the change contract of SET 003 exists once instead of being restated
 * per group: `expectedVersion` with 409 on a concurrent change, the change and
 * its audit record committed in one transaction, the declared cache tags
 * invalidated, and the stored version returned.
 *
 * Separation between groups is by *ownership* — which module may read and write
 * a group, which permissions it needs, how it validates and what its change
 * invalidates — and that lives in `registry.ts` and in the owning service. It
 * does not need one table per group: a group and key the registry does not
 * declare cannot be reached, so the single `settings` table is typed by code
 * rather than being an untyped dumping ground, and no secret is ever stored in
 * it (SET 004).
 *
 * Domain validation stays with the owner: the registry groups validate against
 * their declarations here, while the website group's richer rules (hero slides,
 * branding media, contact details) stay in `SettingsService`, which hands this
 * service an already-validated document.
 */
@Injectable()
export class SettingsStoreService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
  ) {}

  // ---- document primitives, shared by every group ---------------------------

  /** Stored document for one group key, or version 0 when nothing is stored. */
  async readDocument<T = unknown>(group: SettingGroupKey, key: string): Promise<SettingDocument<T | null>> {
    const db = await this.database.client();
    const row = await db.setting.findUnique({ where: { group_key: { group, key } } });
    if (!row) return { data: null, version: 0, updatedAt: new Date(0).toISOString(), updatedByAdminId: null };
    return { data: row.data as T, version: row.version, updatedAt: row.updatedAt.toISOString(), updatedByAdminId: row.updatedByAdminId };
  }

  /**
   * Version-checks, commits, audits and invalidates in one path. The caller has
   * already validated `data` against whatever rules own that group.
   */
  async writeDocument(input: WriteDocumentInput): Promise<SettingDocument> {
    const { group, key, actor, ctx } = input;
    const db = await this.database.client();
    const current = await db.setting.findUnique({ where: { group_key: { group, key } } });
    if ((current?.version ?? 0) !== input.expectedVersion) {
      throw new ConflictException({ code: 'STALE_VERSION', message: 'These settings were changed by someone else. Reload and try again.' });
    }

    const row = await retryTransaction(() => db.$transaction(async (tx) => {
      // updateMany produces the conditional UPDATE itself, rather than relying
      // on a unique-record pre-read by the ORM. Exactly one writer may win.
      let saved;
      if (current) {
        const result = await tx.setting.updateMany({ where: { group, key, version: input.expectedVersion }, data: { data: input.data, version: { increment: 1 }, updatedByAdminId: actor.id } });
        if (result.count !== 1) throw new ConflictException({ code: 'STALE_VERSION', message: 'These settings were changed by someone else. Reload and try again.' });
        saved = await tx.setting.findUniqueOrThrow({ where: { group_key: { group, key } } });
      } else {
        saved = await tx.setting.create({ data: { group, key, data: input.data, version: 1, updatedByAdminId: actor.id } });
      }

      // Committed with the change, so a settings edit that cannot be recorded is
      // rolled back rather than applied silently (SET 003).
      await this.audit.recordWith(tx as unknown as AuditWriteClient, {
        action: input.audit.action,
        actorAdminId: actor.id,
        targetType: 'setting',
        targetId: `${group}.${key}`,
        metadata: input.audit.metadata,
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      });

      if (input.tags.length > 0) {
        await this.cache.recordInvalidation(tx, { resourceType: 'setting', resourceId: `${group}.${key}`, correlationId: ctx.requestId, tags: [...input.tags] });
      }
      if (group === 'ai_content' && key === 'defaults') {
        const before = current?.data as Record<string, unknown> | undefined;
        // Live restrictive controls win over in-flight work (AI plan §I, F37/F38):
        // any change other than the pinned editorial context advances the control
        // epoch in this transaction, so a worker that started earlier cannot apply.
        const after = input.data as Record<string, unknown>;
        const safetyChanged = Object.keys({ ...before, ...after }).some(
          (field) => !AI_PINNED_CONTEXT_KEYS.has(field) && JSON.stringify(before?.[field]) !== JSON.stringify(after[field]),
        );
        if (safetyChanged) await advanceControlEpoch(tx);
        if ((before?.enabled ?? false) !== input.data.enabled) {
          await this.audit.recordWith(tx as unknown as AuditWriteClient, {
            action: input.data.enabled ? 'settings.ai_content.enabled' : 'settings.ai_content.disabled',
            actorAdminId: actor.id, targetType: 'setting', targetId: 'ai_content.defaults',
            requestId: ctx.requestId, metadata: { enabled: Boolean(input.data.enabled), executionActive: false },
          });
        }
      }
      return saved;
    })).catch((error: unknown) => {
      if (databaseCode(error) === 'P2002' || databaseCode(error) === 'P2025') {
        throw new ConflictException({ code: 'STALE_VERSION', message: 'These settings were changed by someone else. Reload and try again.' });
      }
      throw error;
    });

    if (input.tags.length > 0) await this.cache.bumpNamespace();
    return { data: row.data, version: row.version, updatedAt: row.updatedAt.toISOString(), updatedByAdminId: row.updatedByAdminId };
  }

  // ---- registry-declared groups ---------------------------------------------

  /**
   * Group resolution, kept as one overridable seam so the change contract can be
   * exercised against a fixture declaration in tests without any fixture setting
   * reaching the production registry.
   */
  protected resolveGroup(key: SettingGroupKey): SettingGroupDeclaration {
    return settingGroup(key);
  }

  private toRecord(group: SettingGroupDeclaration, document: SettingDocument<unknown>): SettingGroupRecord {
    const stored = (document.data && typeof document.data === 'object' && !Array.isArray(document.data) ? document.data : {}) as Record<string, unknown>;
    // Only declared keys are served, so a value left behind by a retired
    // declaration stays in the row for history but never reaches a response.
    const values: Record<string, boolean | number | string> = groupDefaults(group);
    for (const setting of group.settings) {
      const value = stored[setting.key];
      if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') values[setting.key] = value;
    }
    return { group: group.key, values, version: document.version, updatedAt: document.updatedAt, updatedByAdminId: document.updatedByAdminId };
  }

  /** Stored values for a registry group, or its declared defaults. */
  async read(groupKey: SettingGroupKey): Promise<SettingGroupRecord> {
    const group = this.resolveGroup(groupKey);
    return this.toRecord(group, await this.readDocument(group.key, group.storeKey));
  }

  /**
   * Validates a submitted payload against the group's declarations and applies
   * it. `input` carries only the settings being changed: omitted keys keep their
   * stored value and unknown keys are rejected rather than ignored.
   */
  async update(groupKey: SettingGroupKey, input: Record<string, unknown>, expectedVersion: number, actor: AdminPrincipal, ctx: RequestContext): Promise<SettingGroupRecord> {
    const group = this.resolveGroup(groupKey);
    const current = this.toRecord(group, await this.readDocument(group.key, group.storeKey));

    const { errors, value } = validateGroupPayload(group, input, current.values);
    if (Object.keys(errors).length > 0) {
      // The envelope carries a list of messages per field (SRS API 002), so a
      // single message is still reported as a one-item list.
      const fields = Object.fromEntries(Object.entries(errors).map(([key, message]) => [key, [message]]));
      throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Some settings are invalid', fields }, HttpStatus.BAD_REQUEST);
    }
    if (current.version !== expectedVersion) {
      throw new ConflictException({ code: 'STALE_VERSION', message: 'These settings were changed by someone else. Reload and try again.' });
    }

    const changed = group.settings.filter((setting) => current.values[setting.key] !== value[setting.key]).map((setting) => setting.key);
    // An unchanged save is a successful no-op: no write, no version bump, no
    // audit noise for "opened the page and pressed save" (SET 003).
    if (changed.length === 0) return current;

    const document = await this.writeDocument({
      group: group.key,
      key: group.storeKey,
      data: value as unknown as Prisma.InputJsonObject,
      expectedVersion,
      actor,
      ctx,
      audit: {
        action: `settings.${group.key}.update`,
        metadata: {
          changed: changed.join(', '),
          ...this.summarise(group, current.values, group.key === 'ai_content' ? changed.filter((key) => !['location', 'editorialStrategy'].includes(key)) : changed, 'before'),
          ...this.summarise(group, value, group.key === 'ai_content' ? changed.filter((key) => !['location', 'editorialStrategy'].includes(key)) : changed, 'after'),
        },
      },
      tags: this.invalidatedTags(group, changed),
    });
    return this.toRecord(group, document);
  }

  /** Declared cache tags for the settings that actually changed (SET 002/003). */
  private invalidatedTags(group: SettingGroupDeclaration, changed: string[]): string[] {
    const tags = new Set<string>();
    for (const setting of group.settings) {
      if (changed.includes(setting.key)) for (const tag of setting.invalidates) tags.add(tag);
    }
    return [...tags];
  }

  /**
   * Before/after summary restricted to the changed keys. Sensitive values are
   * never stored (SET 004), so this records values; the check keeps that true if
   * a declaration ever changes.
   */
  private summarise(
    group: SettingGroupDeclaration,
    values: Record<string, boolean | number | string>,
    changed: string[],
    prefix: 'before' | 'after',
  ): Record<string, string | number | boolean | null> {
    const summary: Record<string, string | number | boolean | null> = {};
    for (const setting of group.settings) {
      if (changed.includes(setting.key)) summary[`${prefix}.${setting.key}`] = setting.sensitive ? '[redacted]' : (values[setting.key] ?? null);
    }
    return summary;
  }
}
