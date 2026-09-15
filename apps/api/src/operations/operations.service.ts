import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { OperationsSignalDto, OperationsStatusDto } from './operations.dto.js';

/**
 * Thresholds from the alerting policy (SRS MON 002). They live in code so the
 * API, the runbook and any external alert rule describe the same conditions.
 */
export const ALERT_THRESHOLDS = {
  /** Oldest undelivered outbound job, in seconds. */
  oldestPendingJobSeconds: 300,
  /** Scheduled publishing later than this is stuck, in seconds. */
  scheduledPublishingLateSeconds: 300,
  /** Any failed cache purge is investigated immediately (CACHE 002). */
  failedPurges: 1,
  /** Any failed enquiry delivery needs a human. */
  failedEnquiries: 1,
  /** Moderation backlog worth paging about. */
  moderationBacklog: 50,
  /** Uploads stuck in quarantine mean the worker is not processing media. */
  stuckMediaSeconds: 900,
} as const;

/**
 * Operational signals for monitoring and alerting (SRS MON 001–002). Counts and
 * ages only: no message bodies, addresses or other private content ever appears
 * here, so the endpoint is safe for a dashboard.
 */
@Injectable()
export class OperationsService {
  constructor(private readonly database: DatabaseService) {}

  async status(now = new Date()): Promise<OperationsStatusDto> {
    const db = await this.database.client();
    const ageSeconds = (date: Date | null | undefined): number => (date ? Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000)) : 0);

    const [oldestPending, failedEvents, failedEnquiries, pendingReviews, pendingComments, openReports, lateScheduled, oldestQuarantined] = await Promise.all([
      db.outboxEvent.findFirst({ where: { status: 'pending' }, orderBy: { occurredAt: 'asc' }, select: { occurredAt: true } }),
      db.outboxEvent.count({ where: { status: 'failed' } }),
      db.enquiry.count({ where: { deliveryStatus: 'failed' } }),
      db.review.count({ where: { status: 'pending' } }),
      db.comment.count({ where: { status: 'pending' } }),
      db.abuseReport.count({ where: { status: 'open' } }),
      db.post.findFirst({ where: { status: 'scheduled', scheduledAt: { lte: new Date(now.getTime() - ALERT_THRESHOLDS.scheduledPublishingLateSeconds * 1000) } }, orderBy: { scheduledAt: 'asc' }, select: { scheduledAt: true } }),
      db.mediaAsset.findFirst({ where: { status: 'quarantined' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    ]);

    const signal = (input: Omit<OperationsSignalDto, 'breached'>): OperationsSignalDto => ({ ...input, breached: input.value >= input.threshold && input.value > 0 });

    const signals: OperationsSignalDto[] = [
      signal({
        key: 'oldest_pending_job_age',
        label: 'Age of the oldest undelivered outbound job',
        value: ageSeconds(oldestPending?.occurredAt),
        unit: 'seconds',
        threshold: ALERT_THRESHOLDS.oldestPendingJobSeconds,
        action: 'Check Redis and the worker; the outbox row is the recovery source, so nothing is lost while it is pending.',
      }),
      signal({
        key: 'failed_events',
        label: 'Outbox events that exhausted their attempts',
        value: failedEvents,
        unit: 'count',
        threshold: ALERT_THRESHOLDS.failedPurges,
        action: 'Inspect lastError on outbox_events; a failed cache purge must be investigated immediately (SRS CACHE 002).',
      }),
      signal({
        key: 'failed_enquiries',
        label: 'Enquiries that failed to send',
        value: failedEnquiries,
        unit: 'count',
        threshold: ALERT_THRESHOLDS.failedEnquiries,
        action: 'Open the Enquiries queue and retry once the mail provider is healthy.',
      }),
      signal({
        key: 'scheduled_publishing_lateness',
        label: 'How late the oldest due scheduled article is',
        value: ageSeconds(lateScheduled?.scheduledAt),
        unit: 'seconds',
        threshold: ALERT_THRESHOLDS.scheduledPublishingLateSeconds,
        action: 'Check the scheduled-publishing job; the catch-up scan is idempotent, so it is safe to run again.',
      }),
      signal({
        key: 'moderation_backlog',
        label: 'Pending reviews, comments and open reports',
        value: pendingReviews + pendingComments + openReports,
        unit: 'count',
        threshold: ALERT_THRESHOLDS.moderationBacklog,
        action: 'Assign a moderator; nothing is published automatically, so a backlog delays contributors rather than exposing content.',
      }),
      signal({
        key: 'stuck_media_age',
        label: 'Age of the oldest upload still in quarantine',
        value: ageSeconds(oldestQuarantined?.createdAt),
        unit: 'seconds',
        threshold: ALERT_THRESHOLDS.stuckMediaSeconds,
        action: 'Check the worker and object storage credentials; quarantined objects are never publicly reachable.',
      }),
    ];

    return { state: signals.some((entry) => entry.breached) ? 'degraded' : 'ok', signals, generatedAt: now.toISOString() };
  }
}
