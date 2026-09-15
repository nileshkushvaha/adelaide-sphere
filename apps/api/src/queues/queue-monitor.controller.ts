import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import type { RequestContext } from '../auth/auth.service.js';
import { CurrentAdmin, RequirePermissions, type AuthenticatedRequest } from '../auth/decorators.js';
import { collectionMeta } from '../common/pagination.js';
import { getRequestId } from '../common/request-id.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { WorkerLivenessService } from '../observability/worker-liveness.service.js';
import { QueueMonitorService } from './queue-monitor.service.js';
import { CLEANABLE_STATES, LISTABLE_STATES, MAX_BULK_ITEMS, MAX_JOBS_PER_PAGE, MIN_CLEAN_AGE_HOURS, type CleanableState, type ListableState } from './queue-registry.js';

const ctxOf = (req: AuthenticatedRequest): RequestContext => ({ ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req) });

export class QueueSummaryDto {
  @ApiProperty() name!: string;
  @ApiProperty() label!: string;
  @ApiProperty() purpose!: string;
  @ApiProperty() pausable!: boolean;
  @ApiProperty({ description: 'What stops happening while this queue is paused; shown before the action is confirmed.' }) pauseConsequence!: string;
  @ApiProperty() paused!: boolean;
  @ApiProperty({ type: Object, nullable: true, description: 'Job counts by state; null while the queue is unreachable.' }) counts!: Record<string, number> | null;
  @ApiProperty({ type: Number, nullable: true }) oldestWaitingSeconds!: number | null;
  @ApiProperty({ type: Object, description: 'Worker availability, always labelled an estimate (QMON 005).' }) workers!: { count: number; estimated: boolean; detail: string };
  @ApiProperty() available!: boolean;
  @ApiProperty() detail!: string;
  @ApiProperty({ type: [Object] }) jobs!: { name: string; label: string; purpose: string }[];
}

export class QueueJobDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ enum: LISTABLE_STATES }) state!: ListableState;
  @ApiProperty() attemptsMade!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) processedAt!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) finishedAt!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'First line of the failure only; never a stack trace.' }) failedReason!: string | null;
  @ApiProperty({ type: Number, nullable: true }) progress!: number | null;
  @ApiProperty({ type: Object, description: 'Allowlisted payload summary; unrecognised payloads carry no fields (QMON 002).' })
  data!: { fields: { label: string; value: string }[]; unrecognised: boolean };
  @ApiProperty() canRetry!: boolean;
  @ApiProperty() canRemove!: boolean;
}

export class QueueBulkDto {
  @ApiProperty({ type: [String], maxItems: MAX_BULK_ITEMS, description: 'An explicit selection. There is no "all failed" sweep (QMON 004).' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK_ITEMS)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  jobIds!: string[];
}

export class QueuePauseDto {
  @ApiProperty() @IsBoolean() paused!: boolean;
}

export class QueueCleanDto {
  @ApiProperty({ enum: CLEANABLE_STATES }) @IsIn(CLEANABLE_STATES as readonly string[]) state!: CleanableState;
  @ApiProperty({ minimum: MIN_CLEAN_AGE_HOURS, maximum: 8_760 })
  @Type(() => Number)
  @IsInt()
  @Min(MIN_CLEAN_AGE_HOURS)
  @Max(8_760)
  olderThanHours!: number;
}

export class WorkerLivenessDto {
  @ApiProperty({ description: 'True only when a worker has checked in recently and the required schedule is running.' }) healthy!: boolean;
  @ApiProperty({ description: 'What an operator should do about it, in words.' }) detail!: string;
  @ApiProperty({ type: [Object], description: 'One entry per replica: identity, version and age only — never host or environment detail.' })
  workers!: { instanceId: string; version: string; startedAt: string; lastBeatAt: string; ageSeconds: number; queues: string[]; processed: number; failed: number }[];
  @ApiProperty({ type: Number, nullable: true }) oldestHeartbeatAgeSeconds!: number | null;
  @ApiProperty({ type: Object }) scheduler!: { healthy: boolean; detail: string; stale: { code: string; label: string; lastSuccessAt: string | null; staleAfterMinutes: number }[] };
}

export class QueueBulkResultDto {
  @ApiProperty() requested!: number;
  @ApiProperty({ type: [String] }) succeeded!: string[];
  @ApiProperty({ type: [Object], description: 'Per-item reasons; one failure never hides another item’s result.' }) failed!: { id: string; reason: string }[];
}

/**
 * Queue monitor (SRS 1.2 QMON 001–005).
 *
 * Reading, retrying, cancelling and pausing are four separate permissions, so
 * an operator who may look is not thereby able to act. Nothing here creates a
 * job or accepts a payload: every action names a queue in the registry and a
 * job that already exists.
 */
@ApiTags('admin-system')
@Controller('admin/system/queues')
export class QueueMonitorController {
  constructor(
    private readonly queues: QueueMonitorService,
    private readonly liveness: WorkerLivenessService,
  ) {}

  /**
   * Redis answering, and the queue existing, say nothing about whether anything
   * is consuming it. This separates the four states an operator has to tell
   * apart (QMON 005, post-audit remediation of F-01).
   */
  @RequirePermissions('system.queues.view')
  @Get('workers')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Worker liveness: which replicas are alive, and whether the required schedule is still running' })
  @ApiOkResponse({ type: WorkerLivenessDto })
  async workers() {
    return { data: await this.liveness.liveness() };
  }

  @RequirePermissions('system.queues.view')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Registered queues with depths, worker availability and the oldest waiting job' })
  @ApiOkResponse({ type: [QueueSummaryDto] })
  async overview() {
    return { data: await this.queues.overview() };
  }

  @RequirePermissions('system.queues.view')
  @Get(':name/jobs')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'One page of jobs in one state, with the payload reduced to allowlisted fields' })
  @ApiOkResponse({ type: [QueueJobDto] })
  async jobs(
    @Param('name') name: string,
    @Query('state') state?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const requested = (LISTABLE_STATES as readonly string[]).includes(state ?? '') ? (state as ListableState) : 'failed';
    const pageNumber = Math.max(1, Number(page ?? '1') || 1);
    const size = Math.min(MAX_JOBS_PER_PAGE, Math.max(1, Number(pageSize ?? '20') || 20));
    const { rows, total } = await this.queues.jobs(name, requested, pageNumber, size);
    return { data: rows, meta: collectionMeta(pageNumber, size, total) };
  }

  @RequirePermissions('system.queues.retry')
  @Post(':name/retry')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Retry an explicit selection of failed jobs; each is applied independently' })
  @ApiOkResponse({ type: QueueBulkResultDto })
  async retry(@Param('name') name: string, @Body() body: QueueBulkDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.queues.retry(name, body.jobIds, actor, ctxOf(req)) };
  }

  @RequirePermissions('system.queues.cancel')
  @Post(':name/remove')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Remove an explicit selection of jobs that have not completed' })
  @ApiOkResponse({ type: QueueBulkResultDto })
  async remove(@Param('name') name: string, @Body() body: QueueBulkDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.queues.remove(name, body.jobIds, actor, ctxOf(req)) };
  }

  @RequirePermissions('system.queues.pause')
  @Post(':name/pause')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Pause or resume a queue the registry allows to be paused' })
  async pause(@Param('name') name: string, @Body() body: QueuePauseDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.queues.setPaused(name, body.paused, actor, ctxOf(req)) };
  }

  @RequirePermissions('system.queues.clean')
  @Post(':name/clean')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Remove finished job metadata older than a stated age, within retention bounds' })
  async clean(@Param('name') name: string, @Body() body: QueueCleanDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.queues.clean(name, body.state, body.olderThanHours, actor, ctxOf(req)) };
  }
}
