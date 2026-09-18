import { Injectable, Logger } from '@nestjs/common';
import type { OutboxEvent, Prisma } from '@adelaide-sphere/database';
import { AI_OPERATION_EVENT, MAX_DISPATCH_ATTEMPTS, backoffMs } from '@adelaide-sphere/domain';
import { DatabaseService } from '../database/database.service.js';

/** Event names used by the outbox (SRS EVT 001). Payloads carry identifiers only. */
export const EVENT_TYPES = {
  enquiryAccepted: 'enquiry.accepted',
  postPublished: 'post.published',
  postUpdated: 'post.updated',
  postRemoved: 'post.removed',
  mediaUploaded: 'media.uploaded',
  cacheInvalidate: 'cache.invalidate',
  /** A durable AI operation is ready for the worker; written by the database package's automation seam. */
  aiOperationReady: AI_OPERATION_EVENT,
} as const;
export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export interface NewEvent {
  type: EventType;
  resourceType: string;
  resourceId: string;
  resourceVersion?: number;
  correlationId?: string | null;
  /** Identifiers only \u2014 never a private message body (SRS EVT 001). */
  payload: Record<string, string | number | boolean | null>;
}


/**
 * Transactional outbox writer and claimer (SRS EVT 001\u2013002). `write` must be
 * called with the same transaction client as the change it describes, so an
 * accepted request always leaves exactly one event behind.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly database: DatabaseService) {}

  async write(tx: Prisma.TransactionClient, event: NewEvent): Promise<string> {
    const row = await tx.outboxEvent.create({
      data: {
        type: event.type,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        resourceVersion: event.resourceVersion ?? 1,
        correlationId: event.correlationId ?? null,
        payload: event.payload as Prisma.InputJsonObject,
      },
      select: { id: true },
    });
    return row.id;
  }

  /**
   * Claims due pending events by moving them out of reach for the next pass.
   * Claiming is a conditional update, so two dispatchers cannot take the same
   * row; a crash after claiming simply delays the event by the backoff.
   */
  async claim(limit: number, now = new Date()): Promise<OutboxEvent[]> {
    const db = await this.database.client();
    const due = await db.outboxEvent.findMany({
      where: { status: 'pending', availableAt: { lte: now } },
      orderBy: [{ availableAt: 'asc' }, { occurredAt: 'asc' }],
      take: limit,
      select: { id: true, attempts: true },
    });
    const claimed: OutboxEvent[] = [];
    for (const candidate of due) {
      const attempts = candidate.attempts + 1;
      const result = await db.outboxEvent.updateMany({
        where: { id: candidate.id, status: 'pending', attempts: candidate.attempts },
        data: { attempts, availableAt: new Date(now.getTime() + backoffMs(attempts)) },
      });
      if (result.count === 1) claimed.push(await db.outboxEvent.findUniqueOrThrow({ where: { id: candidate.id } }));
    }
    return claimed;
  }

  async markDispatched(id: string): Promise<void> {
    const db = await this.database.client();
    await db.outboxEvent.update({ where: { id }, data: { status: 'dispatched', dispatchedAt: new Date(), lastError: null } });
  }

  /** Leaves the row pending for another pass until the attempt budget is spent (SRS EVT 002). */
  async markAttemptFailed(event: OutboxEvent, error: unknown): Promise<void> {
    const db = await this.database.client();
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown dispatch error';
    const exhausted = event.attempts >= MAX_DISPATCH_ATTEMPTS;
    if (exhausted) this.logger.error(`outbox event ${event.id} (${event.type}) failed after ${event.attempts} attempts`);
    await db.outboxEvent.update({ where: { id: event.id }, data: { status: exhausted ? 'failed' : 'pending', lastError: message } });
  }

  async pendingCount(): Promise<number> {
    const db = await this.database.client();
    return db.outboxEvent.count({ where: { status: 'pending' } });
  }
}
