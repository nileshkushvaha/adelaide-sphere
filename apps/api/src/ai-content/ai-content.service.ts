import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@adelaide-sphere/database';
import { assessNovelty, bumpInventoryEpoch, cancelItemOperations, noveltyDetailJson } from '@adelaide-sphere/database/automation';
import { AuditService, type AuditWriteClient } from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import {
  collectionMeta,
  skipFor,
  type CollectionMeta,
} from '../common/pagination.js';
import { DatabaseService } from '../database/database.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { SettingsStoreService } from '../settings/settings-store.service.js';
import type {
  CreateTopicDto,
  ReorderEntryDto,
  TopicActionDto,
  TopicQueryDto,
  TopicDto,
} from './ai-content.dto.js';
import {
  activeTopic,
  databaseCode,
  digest,
  nextTopicStatus,
  normalizeTopic,
  preProcessingTopic,
  TOPIC_STATUSES,
  retryTransaction,
  topicPayloadHash,
  topicRequestKey,
} from './topic-rules.js';

const PUBLIC_SELECT = {
  id: true,
  title: true,
  brief: true,
  priority: true,
  source: true,
  status: true,
  reason: true,
  createdByAdminId: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  postId: true,
  humanModifiedAt: true,
  failureStage: true,
  failureCode: true,
  selectionReason: true,
  noveltyStatus: true,
  noveltyCheckedAt: true,
  noveltyDetail: true,
  researchUrls: true,
  topicApprovedAt: true,
  topicApprovedByAdminId: true,
  followUpOfPostId: true,
  followUpReason: true,
  categoryId: true,
  imageMode: true,
} as const;
const stale = () =>
  new ConflictException({
    code: 'STALE_VERSION',
    message: 'This topic changed. Reload it before trying again.',
  });
function invalid(field: string, message: string): never {
  throw new HttpException(
    {
      code: 'VALIDATION_ERROR',
      message: 'Some fields are invalid',
      fields: { [field]: [message] },
    },
    HttpStatus.BAD_REQUEST,
  );
}
@Injectable()
export class AiContentService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly settings: SettingsStoreService,
  ) {}

  async overview() {
    const db = await this.database.client();
    const [counts, settings] = await Promise.all([
      db.aIContentItem.groupBy({ by: ['status'], _count: true }),
      this.settings.read('ai_content'),
    ]);
    return {
      enabled: settings.values.enabled,
      // Research and discovery run only while enabled; generation does not exist in this release.
      executionActive: settings.values.enabled === true,
      // Drafts need automation on and a chosen byline; price approval and budget are checked per request.
      generationAvailable: settings.values.enabled === true && typeof settings.values.articleAuthorId === 'string' && settings.values.articleAuthorId.length > 0,
      counts: Object.fromEntries(
        TOPIC_STATUSES.map((status) => [
          status,
          counts.find((row) => row.status === status)?._count ?? 0,
        ]),
      ),
    };
  }
  async list(
    query: TopicQueryDto,
  ): Promise<{ data: TopicDto[]; meta: CollectionMeta }> {
    const db = await this.database.client();
    const where: Prisma.AIContentItemWhereInput = {
      status: query.status,
      ...(query.q?.trim() ? { title: { contains: query.q.trim() } } : {}),
    };
    const [data, total] = await db.$transaction([
      db.aIContentItem.findMany({
        where,
        select: PUBLIC_SELECT,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
        skip: skipFor(query.page, query.pageSize),
        take: query.pageSize,
      }),
      db.aIContentItem.count({ where }),
    ]);
    return { data, meta: collectionMeta(query.page, query.pageSize, total) };
  }
  async detail(id: string): Promise<TopicDto> {
    const db = await this.database.client();
    const row = await db.aIContentItem.findUnique({
      where: { id },
      select: PUBLIC_SELECT,
    });
    if (!row) throw new NotFoundException();
    return row;
  }
  async create(
    input: CreateTopicDto,
    key: string | undefined,
    actor: AdminPrincipal,
    ctx: RequestContext,
  ): Promise<TopicDto> {
    if (!key || !/^[a-zA-Z0-9_-]{16,100}$/.test(key))
      invalid(
        'idempotencyKey',
        'Supply an Idempotency-Key of 16–100 letters, digits, hyphens or underscores',
      );
    const title = input.title.trim();
    if (title.length < 3 || !normalizeTopic(title))
      invalid(
        'title',
        'Enter a topic of at least 3 characters containing letters or numbers',
      );
    const brief = input.brief?.trim() || null;
    const requestKey = topicRequestKey(actor.id, key);
    const payloadHash = topicPayloadHash({
      title: input.title,
      brief: input.brief,
      priority: input.priority,
    });
    const db = await this.database.client();
    const replay = async () => {
      const prior = await db.aIContentItem.findUnique({
        where: { requestKey },
      });
      if (!prior) return null;
      if (prior.payloadHash !== payloadHash)
        throw new ConflictException({
          code: 'IDEMPOTENCY_MISMATCH',
          message:
            'This request key was already used with different input. Keep the original input or start a new request.',
        });
      return this.detail(prior.id);
    };
    const prior = await replay();
    if (prior) return prior;
    try {
      return await retryTransaction(() =>
        db.$transaction(async (tx) => {
          // Advisory at creation; binding novelty is decided under the inventory lock at approval.
          const novelty = await assessNovelty(tx, { title });
          const row = await tx.aIContentItem.create({
            data: {
              selectionReason: 'Manual topic',
              intentKey: novelty.fingerprint.intentKey,
              eventKey: novelty.fingerprint.eventKey,
              topicTokens: novelty.fingerprint.topicTokens,
              noveltyStatus: novelty.status,
              noveltyCheckedAt: new Date(),
              noveltyDetail: noveltyDetailJson(novelty.matches),
              title,
              brief,
              priority: input.priority,
              source: 'manual',
              status: 'queued',
              requestKey,
              payloadHash,
              activeTitleHash: digest(normalizeTopic(title)),
              createdByAdminId: actor.id,
            },
            select: PUBLIC_SELECT,
          });
          await this.record(tx, 'created', row.id, actor, ctx, {
            status: row.status,
            priority: row.priority,
            version: row.version,
          });
          return row;
        }),
      );
    } catch (error) {
      if (databaseCode(error) !== 'P2002') throw error;
      const existing = await replay();
      if (existing) return existing;
      throw new ConflictException({
        code: 'DUPLICATE_ACTIVE_TOPIC',
        message:
          'An active topic with this normalized title already exists. Check queued and paused topics.',
      });
    }
  }
  async action(
    id: string,
    input: TopicActionDto,
    actor: AdminPrincipal,
    ctx: RequestContext,
  ): Promise<TopicDto> {
    const reason = input.reason?.trim() || null;
    if ((input.action === 'cancel' || input.action === 'reject') && !reason)
      invalid('reason', 'A reason is required');
    if ((input.action === 'pause' || input.action === 'resume') && reason)
      invalid(
        'reason',
        'Reasons are only accepted for cancellation or rejection',
      );
    const db = await this.database.client();
    return retryTransaction(() =>
      db.$transaction(async (tx) => {
        const current = await tx.aIContentItem.findUnique({ where: { id } });
        if (!current) throw new NotFoundException();
        if (current.version !== input.expectedVersion) throw stale();
        const status = nextTopicStatus(current.status, input.action);
        if (!status)
          throw new ConflictException({
            code: 'INVALID_TRANSITION',
            message: 'This action is not allowed for the current topic status.',
          });
        const updated = await tx.aIContentItem.updateMany({
          where: { id, version: input.expectedVersion },
          data: {
            status,
            reason,
            activeTitleHash: activeTopic(status)
              ? current.activeTitleHash
              : null,
            version: { increment: 1 },
          },
        });
        if (!updated.count) throw stale();
        // Cancelling fences any unfinished worker operation for the item (AI-199):
        // a running owner's lease assertion then fails and it commits nothing.
        const operationsCancelled =
          status === 'cancelled' ? await cancelItemOperations(tx, id) : 0;
        // Leaving the active inventory changes what later topics are compared with.
        if (status === 'cancelled' || status === 'rejected') await bumpInventoryEpoch(tx);
        await this.record(
          tx,
          {
            pause: 'paused',
            resume: 'resumed',
            cancel: 'cancelled',
            reject: 'rejected',
          }[input.action],
          id,
          actor,
          ctx,
          {
            beforeStatus: current.status,
            status,
            version: current.version + 1,
            reasonProvided: Boolean(reason),
            operationsCancelled,
          },
        );
        return tx.aIContentItem.findUniqueOrThrow({
          where: { id },
          select: PUBLIC_SELECT,
        });
      }),
    );
  }
  async reorder(
    items: ReorderEntryDto[],
    actor: AdminPrincipal,
    ctx: RequestContext,
  ): Promise<TopicDto[]> {
    const db = await this.database.client();
    return retryTransaction(() =>
      db.$transaction(async (tx) => {
        const result = [];
        // Consistent locking order avoids inverse-order batch deadlocks.
        for (const item of [...items].sort((a, b) =>
          a.id.localeCompare(b.id),
        )) {
          const current = await tx.aIContentItem.findUnique({
            where: { id: item.id },
          });
          if (!current) throw new NotFoundException();
          if (current.version !== item.expectedVersion) throw stale();
          if (!preProcessingTopic(current.status))
            throw new ConflictException({
              code: 'INVALID_TRANSITION',
              message: 'Only queued or paused topics can be reprioritized.',
            });
          // Even a no-op asserts the version under a row lock; a concurrent cancel cannot be missed.
          const saved = await tx.aIContentItem.updateMany({
            where: { id: item.id, version: item.expectedVersion },
            data: {
              priority: item.priority,
              ...(current.priority === item.priority ? { updatedAt: current.updatedAt } : {}),
              version: {
                increment: current.priority === item.priority ? 0 : 1,
              },
            },
          });
          if (!saved.count) throw stale();
          if (current.priority !== item.priority)
            await this.record(tx, 'reprioritized', item.id, actor, ctx, {
              beforePriority: current.priority,
              priority: item.priority,
              version: current.version + 1,
            });
          result.push(
            await tx.aIContentItem.findUniqueOrThrow({
              where: { id: item.id },
              select: PUBLIC_SELECT,
            }),
          );
        }
        return result;
      }),
    );
  }
  private record(
    tx: Prisma.TransactionClient,
    action: string,
    id: string,
    actor: AdminPrincipal,
    ctx: RequestContext,
    metadata: Record<string, string | number | boolean | null>,
  ) {
    return this.audit.recordWith(tx as unknown as AuditWriteClient, {
      action: `ai_content.topic.${action}`,
      targetType: 'ai_topic',
      targetId: id,
      actorAdminId: actor.id,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
      metadata,
    });
  }
}
