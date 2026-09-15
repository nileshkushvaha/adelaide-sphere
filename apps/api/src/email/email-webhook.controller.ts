import { Controller, Header, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { EmailDeliveryStatus } from '@adelaide-sphere/database';
import { verifyResendWebhook } from '@adelaide-sphere/mail';
import { Logger } from '@nestjs/common';
import { Public } from '../auth/decorators.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { EmailDeliveryService } from './email-delivery.service.js';

/**
 * Resend event types we act on, mapped to our own status vocabulary. Anything
 * else — opens, clicks — is acknowledged and ignored: we do not track reading.
 */
const EVENT_STATUS: Record<string, EmailDeliveryStatus> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delayed',
  'email.failed': 'failed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.suppressed': 'suppressed',
};

interface ResendEvent {
  type?: unknown;
  created_at?: unknown;
  data?: { email_id?: unknown; bounce?: { type?: unknown } } | undefined;
}

/**
 * Provider delivery events (SRS 1.2 MAIL 007).
 *
 * The signature is verified over the raw body before anything is parsed; an
 * unsigned, wrongly signed, stale or replayed request is refused with 401 and a
 * body that says nothing about why. It is `@Public` by explicit declaration
 * rather than by omission, carries no cookie authentication, and answers
 * quickly: the work here is one indexed lookup and one insert.
 */
@ApiTags('webhooks')
@Public()
@Controller('webhooks/email')
export class EmailWebhookController {
  private readonly logger = new Logger(EmailWebhookController.name);

  constructor(
    private readonly deliveries: EmailDeliveryService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Post()
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  @ApiExcludeEndpoint()
  async receive(@Req() req: Request & { rawBody?: string }): Promise<{ data: { accepted: boolean } }> {
    const secret = this.config.get('RESEND_WEBHOOK_SECRET', { infer: true }) ?? null;
    const raw = req.rawBody ?? '';
    const verification = verifyResendWebhook(raw, {
      id: headerOf(req, 'svix-id'),
      timestamp: headerOf(req, 'svix-timestamp'),
      signature: headerOf(req, 'svix-signature'),
    }, secret);

    if (!verification.ok) {
      // The reason is useful to us and to nobody else.
      this.logger.warn(`email webhook refused (${verification.reason})`);
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Unauthorized' });
    }

    let event: ResendEvent;
    try {
      event = JSON.parse(raw) as ResendEvent;
    } catch {
      // Signed but unparseable: accepted so the provider stops retrying, recorded for us.
      this.logger.warn('email webhook body was signed but not valid JSON');
      return { data: { accepted: true } };
    }

    const status = typeof event.type === 'string' ? EVENT_STATUS[event.type] : undefined;
    const providerMessageId = typeof event.data?.email_id === 'string' ? event.data.email_id : null;
    if (!status || !providerMessageId) return { data: { accepted: true } };

    const occurredAt = typeof event.created_at === 'string' && !Number.isNaN(Date.parse(event.created_at)) ? new Date(event.created_at) : new Date();
    const bounceType = typeof event.data?.bounce?.type === 'string' ? event.data.bounce.type.slice(0, 40) : null;

    const outcome = await this.deliveries.applyProviderEvent({
      providerEventId: verification.id,
      providerMessageId,
      status,
      occurredAt,
      // Safe summary only: the event kind and, for a bounce, its class.
      detail: { event: String(event.type).slice(0, 40), ...(bounceType ? { bounceType } : {}) },
    });

    if (outcome === 'unknown_message') this.logger.warn(`email webhook referenced an unknown provider message id (${status})`);
    // Always 202: a provider retry after our own error would be a storm, and
    // the outcomes above are ours to reconcile, not the provider's.
    return { data: { accepted: true } };
  }
}

function headerOf(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
