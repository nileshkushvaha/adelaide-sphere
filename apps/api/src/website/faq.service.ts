import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { Faq, Prisma } from '@adelaide-sphere/database';
import { CACHE_TAGS } from '@adelaide-sphere/domain';
import { AuditService } from '../audit/audit.service.js';
import { CacheService } from '../cache/cache.service.js';
import { DatabaseService } from '../database/database.service.js';
import { renderSanitisedBody, toPlainText } from '../blog/sanitise.js';
import type { RequestContext } from '../auth/auth.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { assertVersion, publicVisibilityChanged, recordContentActivity } from './content-support.js';
import { clearContentMedia, syncContentMedia } from '../media/content-media.js';

/** Documented maximum lengths (SRS 1.2 FAQ 001): an unbounded answer is an unbounded page. */
export const FAQ_LIMITS = { question: 300, answer: 8000, group: 80 } as const;

export interface FaqInput {
  question: string;
  answer: string;
  answerFormat?: 'markdown' | 'html';
  groupName?: string | null;
  displayOrder?: number;
}

/**
 * Frequently asked questions (SRS 1.2 FAQ 001–005).
 *
 * Answers are sanitised by the existing SEC 001 allowlist — the same path as
 * articles and information pages, not a second one — and stored twice: the
 * source the editor wrote and the HTML that is the only thing ever rendered.
 * Publication is an explicit action, never a writable status field, and every
 * mutation writes an activity event in the same transaction as the change.
 */
@Injectable()
export class FaqService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
  ) {}

  private validate(input: FaqInput): { question: string; answerSource: string; answerHtml: string; answerFormat: 'markdown' | 'html'; groupName: string | null; displayOrder: number } {
    const fields: Record<string, string[]> = {};
    const question = (input.question ?? '').trim();
    const answerSource = (input.answer ?? '').trim();
    const groupName = (input.groupName ?? '')?.trim() || null;
    const displayOrder = input.displayOrder ?? 0;
    const answerFormat = input.answerFormat ?? 'html';

    if (question.length < 5) fields.question = ['A question needs at least 5 characters'];
    else if (question.length > FAQ_LIMITS.question) fields.question = [`A question is at most ${FAQ_LIMITS.question} characters`];
    if (answerSource.length < 5) fields.answer = ['An answer needs at least 5 characters'];
    else if (answerSource.length > FAQ_LIMITS.answer) fields.answer = [`An answer is at most ${FAQ_LIMITS.answer} characters`];
    if (groupName && groupName.length > FAQ_LIMITS.group) fields.groupName = [`A group name is at most ${FAQ_LIMITS.group} characters`];
    if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 9999) fields.displayOrder = ['Display order must be a whole number between 0 and 9999'];

    const answerHtml = Object.keys(fields).length === 0 ? renderSanitisedBody(answerSource, answerFormat) : '';
    // Sanitisation can empty an answer that was nothing but disallowed markup.
    if (Object.keys(fields).length === 0 && toPlainText(answerHtml).trim().length === 0) {
      fields.answer = ['After removing unsupported formatting there is no answer left'];
    }
    if (Object.keys(fields).length > 0) throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Some fields are invalid', fields }, HttpStatus.BAD_REQUEST);

    return { question, answerSource, answerHtml, answerFormat, groupName, displayOrder };
  }

  private async purge(tx: Prisma.TransactionClient, ctx: RequestContext, id: string): Promise<void> {
    await this.cache.recordInvalidation(tx, { resourceType: 'faq', resourceId: id, correlationId: ctx.requestId, tags: [CACHE_TAGS.faqs] });
  }

  // ---- admin ---------------------------------------------------------------

  async list(query: { page: number; pageSize: number; status?: 'draft' | 'published'; groupName?: string; q?: string }) {
    const db = await this.database.client();
    const where: Prisma.FaqWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.groupName ? { groupName: query.groupName } : {}),
      ...(query.q ? { question: { contains: query.q } } : {}),
    };
    const [rows, total] = await Promise.all([
      db.faq.findMany({ where, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      db.faq.count({ where }),
    ]);
    return { rows, total };
  }

  async get(id: string): Promise<Faq> {
    const db = await this.database.client();
    const row = await db.faq.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'No such question' });
    return row;
  }

  async create(input: FaqInput, actor: AdminPrincipal, ctx: RequestContext): Promise<Faq> {
    const value = this.validate(input);
    const db = await this.database.client();
    return db.$transaction(async (tx) => {
      const created = await tx.faq.create({
        data: { ...value, createdByAdminId: actor.id, updatedByAdminId: actor.id },
      });
      await syncContentMedia(tx, 'faq', created.id, created.answerHtml);
      await recordContentActivity(tx, this.audit, {
        action: 'website.faq.create',
        targetType: 'faq',
        targetId: created.id,
        actor,
        ctx,
        metadata: { question: created.question.slice(0, 120), group: created.groupName },
      });
      // A new question starts as a draft, so nothing public has changed yet.
      return created;
    });
  }

  async update(id: string, input: FaqInput & { expectedVersion: number }, actor: AdminPrincipal, ctx: RequestContext): Promise<Faq> {
    const value = this.validate(input);
    const current = await this.get(id);
    assertVersion(current.version, input.expectedVersion);

    const db = await this.database.client();
    return db.$transaction(async (tx) => {
      const updated = await tx.faq.update({
        where: { id },
        data: { ...value, version: { increment: 1 }, updatedByAdminId: actor.id },
      });
      await syncContentMedia(tx, 'faq', id, updated.answerHtml);
      await recordContentActivity(tx, this.audit, {
        action: 'website.faq.update',
        targetType: 'faq',
        targetId: id,
        actor,
        ctx,
        metadata: { question: updated.question.slice(0, 120), published: updated.status === 'published' },
      });
      if (publicVisibilityChanged(current, updated)) await this.purge(tx, ctx, id);
      return updated;
    });
  }

  /** Publication is an explicit action, not a writable status field (FAQ 002). */
  async setPublished(id: string, published: boolean, expectedVersion: number, actor: AdminPrincipal, ctx: RequestContext): Promise<Faq> {
    const current = await this.get(id);
    assertVersion(current.version, expectedVersion);
    if ((current.status === 'published') === published) {
      throw new HttpException({ code: 'INVALID_STATE', message: published ? 'This question is already published' : 'This question is not published' }, HttpStatus.CONFLICT);
    }

    const db = await this.database.client();
    const updated = await db.$transaction(async (tx) => {
      const row = await tx.faq.update({
        where: { id },
        data: {
          status: published ? 'published' : 'draft',
          // The first publication timestamp is kept; unpublishing does not erase it.
          publishedAt: published ? (current.publishedAt ?? new Date()) : current.publishedAt,
          version: { increment: 1 },
          updatedByAdminId: actor.id,
        },
      });
      await recordContentActivity(tx, this.audit, {
        action: published ? 'website.faq.publish' : 'website.faq.unpublish',
        targetType: 'faq',
        targetId: id,
        actor,
        ctx,
        metadata: { question: row.question.slice(0, 120) },
      });
      await this.purge(tx, ctx, id);
      return row;
    });
    await this.cache.bumpNamespace();
    return updated;
  }

  /** Reordering is one bounded operation, so the public list never shows a half-applied order. */
  async reorder(order: { id: string; displayOrder: number }[], actor: AdminPrincipal, ctx: RequestContext): Promise<void> {
    if (order.length === 0 || order.length > 200) {
      throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Provide between 1 and 200 questions to reorder', fields: { order: ['Between 1 and 200 items'] } }, HttpStatus.BAD_REQUEST);
    }
    const db = await this.database.client();
    await db.$transaction(async (tx) => {
      for (const entry of order) {
        await tx.faq.update({ where: { id: entry.id }, data: { displayOrder: entry.displayOrder, updatedByAdminId: actor.id } });
      }
      await recordContentActivity(tx, this.audit, {
        action: 'website.faq.reorder',
        targetType: 'faq',
        targetId: order[0]!.id,
        actor,
        ctx,
        metadata: { count: order.length },
      });
      await this.purge(tx, ctx, order[0]!.id);
    });
    await this.cache.bumpNamespace();
  }

  async remove(id: string, actor: AdminPrincipal, ctx: RequestContext): Promise<void> {
    const current = await this.get(id);
    const db = await this.database.client();
    await db.$transaction(async (tx) => {
      await clearContentMedia(tx, 'faq', id);
      await tx.faq.delete({ where: { id } });
      await recordContentActivity(tx, this.audit, {
        action: 'website.faq.delete',
        targetType: 'faq',
        targetId: id,
        actor,
        ctx,
        metadata: { question: current.question.slice(0, 120), wasPublished: current.status === 'published' },
      });
      if (current.status === 'published') await this.purge(tx, ctx, id);
    });
    if (current.status === 'published') await this.cache.bumpNamespace();
  }

  // ---- public --------------------------------------------------------------

  /**
   * Published questions in display order, grouped as authored (FAQ 004).
   * Filtering happens here, in the backend, so an unpublished question cannot
   * reach a page by any route.
   */
  async publicList(): Promise<{ id: string; question: string; answerHtml: string; groupName: string | null }[]> {
    const db = await this.database.client();
    const rows = await db.faq.findMany({
      where: { status: 'published' },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, question: true, answerHtml: true, groupName: true },
      take: 200,
    });
    return rows;
  }
}
