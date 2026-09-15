import { Controller, Get, Header, HttpStatus, Req, Res, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { DatabaseService } from '../database/database.service.js';
import { RedisService } from '../redis/redis.service.js';
import { sendErrorEnvelope } from '../common/error-envelope.js';
import { getRequestId, type RequestWithId } from '../common/request-id.js';

export interface HealthResponse {
  data: { status: 'ok' };
}

export interface ReadinessResponse {
  data: { status: 'ready'; checks: { database: 'ok'; redis: 'ok' } };
}

/**
 * GET /health       — liveness only: the process is up and routing works.
 * GET /health/ready — readiness: liveness plus bounded MySQL and Redis
 *                     connectivity checks (both are consumed: persistence and
 *                     login throttling). Redis down → not ready (sign-in
 *                     would fail safe anyway).
 * Neither exposes environment values, paths, versions or driver errors.
 */
@Controller('health')
export class HealthController {
  private readonly logger = new Logger('Health');

  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  getHealth(): HealthResponse {
    return { data: { status: 'ok' } };
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async getReadiness(@Req() req: RequestWithId, @Res() res: Response): Promise<void> {
    const [database, redis] = await Promise.all([this.database.ping(), this.redis.ping()]);
    if (!database.ok || !redis.ok) {
      // Which dependency failed is for the operator's log, not a public response.
      const failing = [!database.ok && 'database', !redis.ok && 'redis'].filter(Boolean).join(', ');
      this.logger.warn(`[${getRequestId(req)}] not ready: ${failing}`);
      sendErrorEnvelope(res, HttpStatus.SERVICE_UNAVAILABLE, {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service not ready',
        requestId: getRequestId(req),
      });
      return;
    }
    const body: ReadinessResponse = { data: { status: 'ready', checks: { database: 'ok', redis: 'ok' } } };
    res.status(HttpStatus.OK).setHeader('Cache-Control', 'no-store');
    res.json(body);
  }
}
