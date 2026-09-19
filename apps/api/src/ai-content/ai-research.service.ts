import { ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@adelaide-sphere/database';
import {
  ResearchCommandError,
  addEditorClaim,
  admitTopic,
  assessNovelty,
  noveltyDetailJson,
  normalizeResearchUrl,
  refreshResearch,
  requestDiscovery,
  resolveClaim,
} from '@adelaide-sphere/database/automation';
import type { RequestContext } from '../auth/auth.service.js';
import { databaseCode, retryTransaction } from '../common/database-retry.js';
import { DatabaseService } from '../database/database.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import type { AddClaimDto, ResearchActionDto, ResearchSourceInputDto, ResolveClaimDto, TopicSourcesDto, UpdateResearchSourceDto } from './ai-research.dto.js';
import { AiContentService } from './ai-content.service.js';

const EVIDENCE_PREVIEW = 2_000;
const HOST = /^(?=.{4,253}$)(?!-)[a-z0-9-]{1,63}(?:\.(?!-)[a-z0-9-]{1,63})+$/;

function invalid(field: string, message: string): never {
  throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Some fields are invalid', fields: { [field]: [message] } }, 400);
}

type NoveltyJson = { title?: string; reason?: string; kind?: string; status?: string }[];

/** Maps seam decisions onto the API's error envelope; novelty matches become readable field messages. */
function toHttp(error: unknown): never {
  if (!(error instanceof ResearchCommandError)) throw error;
  const fields: Record<string, string[]> = {};
  const detailFields = error.details?.fields as Record<string, string[]> | undefined;
  if (detailFields) Object.assign(fields, detailFields);
  const novelty = error.details?.novelty as NoveltyJson | undefined;
  if (novelty) fields.novelty = novelty.map((m) => `${m.title} (${m.kind} ${m.status}: ${String(m.reason).replace(/_/g, ' ')})`);
  throw new HttpException({ code: error.code, message: error.message, fields }, error.status);
}

/**
 * Research, fact review, discovery requests and the source registry (AI SRS
 * §7, §9, §14; plan §G). Commands delegate to the shared database seam so the
 * worker and the API apply one policy; this service owns HTTP concerns only.
 */
@Injectable()
export class AiResearchService {
  constructor(
    private readonly database: DatabaseService,
    private readonly topics: AiContentService,
  ) {}

  async research(itemId: string) {
    const db = await this.database.client();
    const item = await db.aIContentItem.findUnique({ where: { id: itemId }, select: { id: true } });
    if (!item) throw new NotFoundException();
    const packets = await db.aIResearchPacket.findMany({
      where: { itemId },
      orderBy: { version: 'desc' },
      take: 10,
      select: { id: true, version: true, status: true, reasons: true, changes: true, freshUntil: true, evaluatedAt: true, createdAt: true, failureCode: true },
    });
    const latest = packets[0];
    if (!latest) return { packets: [], packet: null };
    const [context, evidence, claims] = await Promise.all([
      db.aIResearchPacket.findUniqueOrThrow({ where: { id: latest.id }, select: { context: true } }),
      db.aISourceEvidence.findMany({
        where: { packetId: latest.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, url: true, finalUrl: true, host: true, tier: true, fetchStatus: true, httpStatus: true, contentType: true, contentHash: true, title: true, sourceDate: true, fetchedAt: true, text: true },
      }),
      db.aIFactClaim.findMany({
        where: { packetId: latest.id },
        orderBy: [{ status: 'asc' }, { kind: 'asc' }, { subject: 'asc' }],
        include: { sources: { select: { evidenceId: true, excerpt: true, location: true } } },
      }),
    ]);
    return {
      packets,
      packet: {
        ...latest,
        context: context.context,
        evidence: evidence.map(({ text, ...e }) => ({ ...e, textPreview: text ? text.slice(0, EVIDENCE_PREVIEW) : null, textLength: text?.length ?? 0 })),
        claims: claims.map((c) => ({
          id: c.id,
          kind: c.kind,
          subject: c.subject,
          value: c.value,
          material: c.material,
          origin: c.origin,
          status: c.status,
          reason: c.reason,
          validUntil: c.validUntil,
          freshUntil: c.freshUntil,
          excluded: c.excluded,
          accepted: c.accepted,
          resolutionNote: c.resolutionNote,
          resolvedAt: c.resolvedAt,
          version: c.version,
          sources: c.sources,
        })),
      },
    };
  }

  /** Recomputes the advisory novelty decision (local inventory only) and stores it for review. */
  async checkNovelty(itemId: string) {
    const db = await this.database.client();
    await db.$transaction(async (tx) => {
      const item = await tx.aIContentItem.findUnique({ where: { id: itemId }, select: { title: true } });
      if (!item) throw new NotFoundException();
      const novelty = await assessNovelty(tx, { title: item.title, itemId });
      // Derived data, not an editorial change: no version bump, so an open editor is not disturbed.
      await tx.aIContentItem.update({
        where: { id: itemId },
        data: { noveltyStatus: novelty.status, noveltyCheckedAt: new Date(), noveltyDetail: noveltyDetailJson(novelty.matches), intentKey: novelty.fingerprint.intentKey, eventKey: novelty.fingerprint.eventKey, topicTokens: novelty.fingerprint.topicTokens, version: undefined },
      });
    });
    return this.topics.detail(itemId);
  }

  async setSources(itemId: string, input: TopicSourcesDto, actor: AdminPrincipal, ctx: RequestContext) {
    const normalized = input.sources.map((source, index) => {
      const url = normalizeResearchUrl(source.url);
      if (!url) invalid(`sources.${index}.url`, 'Use a public https page address');
      return { url, tier: source.tier ?? null };
    });
    if (new Set(normalized.map((s) => s.url)).size !== normalized.length) invalid('sources', 'Each page may be listed once');
    const db = await this.database.client();
    await retryTransaction(() =>
      db.$transaction(async (tx) => {
        const item = await tx.aIContentItem.findUnique({ where: { id: itemId }, select: { status: true, version: true } });
        if (!item) throw new NotFoundException();
        if (item.version !== input.expectedVersion) throw new ConflictException({ code: 'STALE_VERSION', message: 'This topic changed. Reload it before trying again.' });
        if (!['queued', 'paused', 'failed', 'researching', 'needs_fact_review'].includes(item.status)) {
          throw new ConflictException({ code: 'INVALID_TRANSITION', message: 'Sources can only change before or during research.' });
        }
        const updated = await tx.aIContentItem.updateMany({ where: { id: itemId, version: input.expectedVersion }, data: { researchUrls: normalized as Prisma.InputJsonArray, version: { increment: 1 } } });
        if (updated.count !== 1) throw new ConflictException({ code: 'STALE_VERSION', message: 'This topic changed. Reload it before trying again.' });
        await tx.auditLog.create({ data: { action: 'ai_content.topic.sources_updated', actorAdminId: actor.id, targetType: 'ai_topic', targetId: itemId, requestId: ctx.requestId, metadata: { count: normalized.length } } });
      }),
    );
    return this.topics.detail(itemId);
  }

  async researchAction(itemId: string, input: ResearchActionDto, actor: AdminPrincipal, ctx: RequestContext) {
    const followUp = input.followUpOfPostId ? { postId: input.followUpOfPostId, reason: input.followUpReason?.trim() ?? '' } : null;
    if (input.action !== 'refresh' && followUp && followUp.reason.length < 10) invalid('followUpReason', 'Explain in a sentence why this follow-up is a different, useful article');
    if (input.action === 'refresh' && followUp) invalid('followUpOfPostId', 'Only approval takes a follow-up');
    const correction = input.correctionReason !== undefined ? { reason: input.correctionReason.trim() } : null;
    if (correction && input.action === 'refresh') invalid('correctionReason', 'Only approval takes a correction');
    if (correction && correction.reason.length < 10) invalid('correctionReason', 'Say in a sentence what was wrong with the cancelled topic');
    const db = await this.database.client();
    try {
      await retryTransaction(() =>
        db.$transaction((tx) =>
          input.action !== 'refresh'
            ? admitTopic(tx, { itemId, expectedVersion: input.expectedVersion, adminId: actor.id, requestId: ctx.requestId, followUp, correction, forSlot: input.action === 'approve_for_slot' })
            : refreshResearch(tx, { itemId, expectedVersion: input.expectedVersion, adminId: actor.id, requestId: ctx.requestId }),
        ),
      );
    } catch (error) {
      toHttp(error);
    }
    return this.topics.detail(itemId);
  }

  async resolve(claimId: string, input: ResolveClaimDto, actor: AdminPrincipal, ctx: RequestContext) {
    const db = await this.database.client();
    try {
      return await retryTransaction(() => db.$transaction((tx) => resolveClaim(tx, { claimId, expectedVersion: input.expectedVersion, action: input.action, note: input.note ?? null, adminId: actor.id, requestId: ctx.requestId })));
    } catch (error) {
      return toHttp(error);
    }
  }

  async addClaim(packetId: string, input: AddClaimDto, actor: AdminPrincipal, ctx: RequestContext) {
    const db = await this.database.client();
    try {
      return await retryTransaction(() =>
        db.$transaction((tx) =>
          addEditorClaim(tx, { packetId, evidenceId: input.evidenceId, kind: input.kind, subject: input.subject, value: input.value, excerpt: input.excerpt, material: input.material, validUntil: input.validUntil ? new Date(input.validUntil) : null, adminId: actor.id, requestId: ctx.requestId }),
        ),
      );
    } catch (error) {
      return toHttp(error);
    }
  }

  async discover(key: string | undefined, actor: AdminPrincipal) {
    if (!key || !/^[a-zA-Z0-9_-]{16,100}$/.test(key)) invalid('idempotencyKey', 'Supply an Idempotency-Key of 16–100 letters, digits, hyphens or underscores');
    const db = await this.database.client();
    const settings = await db.setting.findUnique({ where: { group_key: { group: 'ai_content', key: 'defaults' } }, select: { data: true } });
    const data = (settings?.data ?? {}) as Record<string, unknown>;
    if (data.enabled !== true) throw new ConflictException({ code: 'AUTOMATION_DISABLED', message: 'AI automation is switched off, so discovery cannot run.' });
    if (data.titleMode !== 'automatic' && data.titleMode !== 'hybrid') throw new ConflictException({ code: 'MANUAL_TITLE_MODE', message: 'Discovery needs the automatic or hybrid topic mode.' });
    const result = await retryTransaction(() => db.$transaction((tx) => requestDiscovery(tx, { adminId: actor.id, requestKey: key })));
    return this.operation(result.operationId);
  }

  async operation(id: string) {
    const db = await this.database.client();
    const op = await db.aIOperation.findUnique({ where: { id }, select: { id: true, kind: true, state: true, attempts: true, resultCode: true, createdAt: true, updatedAt: true } });
    if (!op || op.kind !== 'discovery') throw new NotFoundException();
    return op;
  }

  async listSources() {
    const db = await this.database.client();
    return db.aIResearchSource.findMany({ orderBy: [{ active: 'desc' }, { host: 'asc' }], take: 500 });
  }

  private validateSource(host: string, feedUrl: string | null | undefined) {
    const normalizedHost = host.trim().toLowerCase().replace(/^www\./, '');
    if (!HOST.test(normalizedHost) || /(^|\.)(localhost|local|internal|localdomain|home|lan|corp|intranet|arpa)$/.test(normalizedHost) || /^[\d.]+$/.test(normalizedHost)) {
      invalid('host', 'Enter a public host name such as example.org');
    }
    let feed: string | null = null;
    if (feedUrl) {
      feed = normalizeResearchUrl(feedUrl);
      const feedHost = feed ? new URL(feed).hostname : '';
      if (!feed || !(feedHost === normalizedHost || feedHost.endsWith(`.${normalizedHost}`))) invalid('feedUrl', 'Use an https feed on this host');
    }
    return { host: normalizedHost, feedUrl: feed };
  }

  async createSource(input: ResearchSourceInputDto, actor: AdminPrincipal, ctx: RequestContext) {
    const { host, feedUrl } = this.validateSource(input.host, input.feedUrl);
    const db = await this.database.client();
    try {
      return await db.$transaction(async (tx) => {
        const row = await tx.aIResearchSource.create({ data: { host, label: input.label.trim(), tier: input.tier, feedUrl, active: input.active ?? true, createdByAdminId: actor.id } });
        await tx.auditLog.create({ data: { action: 'ai_content.source.created', actorAdminId: actor.id, targetType: 'ai_research_source', targetId: row.id, requestId: ctx.requestId, metadata: { host, tier: input.tier, feed: Boolean(feedUrl) } } });
        return row;
      });
    } catch (error) {
      if (databaseCode(error) === 'P2002') throw new ConflictException({ code: 'DUPLICATE_SOURCE', message: 'This host is already in the registry.' });
      throw error;
    }
  }

  async updateSource(id: string, input: UpdateResearchSourceDto, actor: AdminPrincipal, ctx: RequestContext) {
    const db = await this.database.client();
    return db.$transaction(async (tx) => {
      const current = await tx.aIResearchSource.findUnique({ where: { id } });
      if (!current) throw new NotFoundException();
      const { feedUrl } = input.feedUrl === undefined ? { feedUrl: current.feedUrl } : this.validateSource(current.host, input.feedUrl);
      const updated = await tx.aIResearchSource.updateMany({
        where: { id, version: input.expectedVersion },
        data: { label: input.label?.trim() ?? current.label, tier: input.tier ?? current.tier, feedUrl, active: input.active ?? current.active, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConflictException({ code: 'STALE_VERSION', message: 'This source changed. Reload it before trying again.' });
      await tx.auditLog.create({ data: { action: 'ai_content.source.updated', actorAdminId: actor.id, targetType: 'ai_research_source', targetId: id, requestId: ctx.requestId, metadata: { tier: input.tier ?? current.tier, active: input.active ?? current.active, feed: Boolean(feedUrl) } } });
      return tx.aIResearchSource.findUniqueOrThrow({ where: { id } });
    });
  }
}
