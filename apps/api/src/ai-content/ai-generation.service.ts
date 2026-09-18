import { ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import {
  GenerationCommandError,
  ResearchCommandError,
  applyProposal,
  approveContent,
  approvePrice,
  budgetStatus,
  proposePrice,
  recheckFacts,
  requestGeneration,
  resolveUnknownOperation,
  resumePaidCalls,
} from '@adelaide-sphere/database/automation';
import type { RequestContext } from '../auth/auth.service.js';
import { databaseCode, retryTransaction } from '../common/database-retry.js';
import { DatabaseService } from '../database/database.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import type { ApplyProposalDto, ApproveContentDto, GenerateDto, ProposePriceDto, ResolveOperationDto, TopicArticleSettingsDto } from './ai-generation.dto.js';
import { AiContentService } from './ai-content.service.js';

type Violation = { field?: string; token?: string; reason?: string };

/** Seam decisions onto the API envelope; unsupported facts become readable field messages. */
export function aiCommandHttp(error: unknown): never {
  if (!(error instanceof GenerationCommandError) && !(error instanceof ResearchCommandError)) throw error;
  const fields: Record<string, string[]> = { ...((error.details?.fields as Record<string, string[]>) ?? {}) };
  const violations = error.details?.violations as Violation[] | undefined;
  if (violations) fields.facts = violations.slice(0, 20).map((v) => `${v.field}: "${v.token}" (${String(v.reason).replace(/_/g, ' ')})`);
  throw new HttpException({ code: error.code, message: error.message, fields }, error.status);
}

/**
 * Generation, review, budget and pricing (AI SRS §10–14, §19). HTTP concerns
 * only: every decision is the shared database seam's, which the worker also uses.
 */
@Injectable()
export class AiGenerationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly topics: AiContentService,
  ) {}

  private async run<T>(work: (tx: Parameters<Parameters<Awaited<ReturnType<DatabaseService['client']>>['$transaction']>[0]>[0]) => Promise<T>): Promise<T> {
    const db = await this.database.client();
    try {
      return await retryTransaction(() => db.$transaction((tx) => work(tx)));
    } catch (error) {
      return aiCommandHttp(error);
    }
  }

  async setArticleSettings(itemId: string, input: TopicArticleSettingsDto, actor: AdminPrincipal, ctx: RequestContext) {
    await this.run(async (tx) => {
      const item = await tx.aIContentItem.findUnique({ where: { id: itemId }, select: { version: true, status: true } });
      if (!item) throw new NotFoundException();
      if (item.version !== input.expectedVersion) throw new ConflictException({ code: 'STALE_VERSION', message: 'This topic changed. Reload it before trying again.' });
      if (['published', 'cancelled', 'rejected', 'scheduled', 'approved'].includes(item.status)) throw new ConflictException({ code: 'INVALID_TRANSITION', message: 'The category cannot change at this stage.' });
      if (input.categoryId) {
        const category = await tx.blogCategory.findUnique({ where: { id: input.categoryId }, select: { active: true } });
        if (!category?.active) throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Some fields are invalid', fields: { categoryId: ['Choose an existing active category'] } }, 400);
      }
      const updated = await tx.aIContentItem.updateMany({ where: { id: itemId, version: input.expectedVersion }, data: { categoryId: input.categoryId ?? null, version: { increment: 1 } } });
      if (updated.count !== 1) throw new ConflictException({ code: 'STALE_VERSION', message: 'This topic changed. Reload it before trying again.' });
      await tx.auditLog.create({ data: { action: 'ai_content.topic.category_set', actorAdminId: actor.id, targetType: 'ai_topic', targetId: itemId, requestId: ctx.requestId, metadata: { categorySet: Boolean(input.categoryId) } } });
    });
    return this.topics.detail(itemId);
  }

  async generate(itemId: string, input: GenerateDto, key: string | undefined, actor: AdminPrincipal, ctx: RequestContext) {
    if (!key || !/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Some fields are invalid', fields: { idempotencyKey: ['Supply an Idempotency-Key of 16–100 letters, digits, hyphens or underscores'] } }, 400);
    const result = await this.run((tx) => requestGeneration(tx, { itemId, expectedVersion: input.expectedVersion, scope: input.scope, adminId: actor.id, requestKey: key, requestId: ctx.requestId }));
    return { operationId: result.operationId, created: result.created, topic: await this.topics.detail(itemId) };
  }

  async history(itemId: string) {
    const db = await this.database.client();
    const item = await db.aIContentItem.findUnique({ where: { id: itemId }, select: { id: true, postId: true } });
    if (!item) throw new NotFoundException();
    const [runs, operations, approvals, post] = await Promise.all([
      db.aIGenerationRun.findMany({
        where: { itemId },
        orderBy: { generationVersion: 'desc' },
        take: 20,
        select: { id: true, generationVersion: true, status: true, proposalReason: true, scope: true, provider: true, model: true, promptVersion: true, promptHash: true, schemaVersion: true, schemaHash: true, researchPacketId: true, researchPacketHash: true, disclosureText: true, factCheck: true, coverage: true, imageBriefs: true, internalLinks: true, artifact: true, expectedPostVersion: true, appliedPostVersion: true, createdAt: true },
      }),
      db.aIOperation.findMany({
        where: { itemId, kind: { in: ['generate', 'apply'] } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, kind: true, scope: true, state: true, attempts: true, provider: true, model: true, providerPhase: true, resultCode: true, errorClass: true, estimatedMaxMicros: true, reservedMicros: true, settledMicros: true, costState: true, inputTokens: true, cachedInputTokens: true, outputTokens: true, reasoningTokens: true, resolutionNote: true, createdAt: true, updatedAt: true, priceSchedule: { select: { version: true, currency: true } } },
      }),
      db.aIApproval.findMany({ where: { itemId }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, postVersion: true, adminId: true, reason: true, createdAt: true, invalidatedAt: true, invalidationReason: true, researchPacketId: true } }),
      item.postId ? db.post.findUnique({ where: { id: item.postId }, select: { id: true, version: true, title: true, excerpt: true, seoTitle: true, seoDescription: true, seoKeywords: true, status: true, firstPublishedAt: true } }) : null,
    ]);
    return { runs, operations, approvals, post };
  }

  async approve(itemId: string, input: ApproveContentDto, actor: AdminPrincipal, ctx: RequestContext) {
    await this.run((tx) => approveContent(tx, { itemId, expectedVersion: input.expectedVersion, postVersion: input.postVersion, adminId: actor.id, note: input.note ?? null, requestId: ctx.requestId }));
    return this.topics.detail(itemId);
  }

  async recheck(itemId: string, expectedVersion: number, actor: AdminPrincipal, ctx: RequestContext) {
    const result = await this.run((tx) => recheckFacts(tx, { itemId, expectedVersion, adminId: actor.id, requestId: ctx.requestId }));
    return { status: result.status, violations: result.violations, topic: await this.topics.detail(itemId) };
  }

  async applyProposal(runId: string, input: ApplyProposalDto, actor: AdminPrincipal, ctx: RequestContext) {
    return this.run((tx) => applyProposal(tx, { runId, expectedPostVersion: input.expectedPostVersion, adminId: actor.id, requestId: ctx.requestId }));
  }

  async resolve(operationId: string, input: ResolveOperationDto, actor: AdminPrincipal, ctx: RequestContext) {
    await this.run((tx) => resolveUnknownOperation(tx, { operationId, action: input.action, note: input.note, adminId: actor.id, requestId: ctx.requestId }));
    return { resolved: true };
  }

  async budget() {
    const db = await this.database.client();
    return db.$transaction((tx) => budgetStatus(tx));
  }

  async resume(note: string, actor: AdminPrincipal, ctx: RequestContext) {
    await this.run((tx) => resumePaidCalls(tx, { adminId: actor.id, note, requestId: ctx.requestId }));
    return this.budget();
  }

  async prices() {
    const db = await this.database.client();
    return db.aIPriceSchedule.findMany({ orderBy: [{ provider: 'asc' }, { model: 'asc' }, { createdAt: 'desc' }], take: 100 });
  }

  async propose(input: ProposePriceDto, actor: AdminPrincipal, ctx: RequestContext) {
    try {
      return await this.run((tx) => proposePrice(tx, { ...input, effectiveFrom: new Date(input.effectiveFrom), adminId: actor.id, requestId: ctx.requestId }));
    } catch (error) {
      if (databaseCode(error) === 'P2002') throw new ConflictException({ code: 'DUPLICATE_PRICE_VERSION', message: 'This price version already exists.' });
      throw error;
    }
  }

  async approvePrice(priceId: string, actor: AdminPrincipal, ctx: RequestContext) {
    return this.run((tx) => approvePrice(tx, { priceId, adminId: actor.id, requestId: ctx.requestId }));
  }
}
