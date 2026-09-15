import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import type { RequestContext } from '../auth/auth.service.js';
import { CurrentAdmin, RequirePermissions, type AuthenticatedRequest } from '../auth/decorators.js';
import { collectionMeta } from '../common/pagination.js';
import { getRequestId } from '../common/request-id.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { SchedulesService } from './schedules.service.js';

const ctxOf = (req: AuthenticatedRequest): RequestContext => ({ ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req) });

export class ScheduledTaskDto {
  @ApiProperty({ description: 'Stable registry code; the only thing a request may name (TASK 003).' }) code!: string;
  @ApiProperty() label!: string;
  @ApiProperty() description!: string;
  @ApiProperty() scheduleLabel!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty({ enum: ['catch-up-once', 'skip-to-next', 'run-on-recovery'] }) missedRunPolicy!: string;
  @ApiProperty() timeoutMs!: number;
  @ApiProperty() retries!: number;
  @ApiProperty() manualRunAllowed!: boolean;
  @ApiProperty({ description: 'Publishes or deletes; the interface asks twice (TASK 005).' }) highImpact!: boolean;
  @ApiProperty({ description: 'Cannot be switched off from the interface (TASK 006).' }) requiredForCorrectness!: boolean;
  @ApiProperty() safeToOverlap!: boolean;
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) lastStartedAt!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) lastFinishedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) lastOutcome!: string | null;
  @ApiProperty({ type: Number, nullable: true }) lastDurationMs!: number | null;
  @ApiProperty({ type: String, nullable: true }) lastDetail!: string | null;
  @ApiProperty() running!: boolean;
}

export class ScheduledRunDto {
  @ApiProperty() id!: string;
  @ApiProperty() taskCode!: string;
  @ApiProperty({ enum: ['scheduled', 'manual'] }) trigger!: string;
  @ApiProperty({ enum: ['running', 'succeeded', 'failed', 'skipped', 'timedOut'] }) outcome!: string;
  @ApiProperty({ format: 'date-time' }) startedAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) finishedAt!: string | null;
  @ApiProperty({ type: Number, nullable: true }) durationMs!: number | null;
  @ApiProperty({ type: String, nullable: true, description: 'One short line: a count or the first line of an error, never task output.' }) detail!: string | null;
  @ApiProperty({ type: String, nullable: true }) actorAdminId!: string | null;
  @ApiProperty({ type: String, nullable: true }) runnerId!: string | null;
}

export class SetTaskEnabledDto {
  @ApiProperty() @IsBoolean() enabled!: boolean;
}

/**
 * Scheduled tasks (SRS 1.2 TASK 001–006). Viewing, running and enabling are
 * three permissions, and the only identifier any route accepts is a registered
 * task code — there is no field here for a command, a schedule or a payload.
 */
@ApiTags('admin-system')
@Controller('admin/system/schedules')
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @RequirePermissions('system.schedules.view')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Registered tasks with their schedule, state and last outcome' })
  @ApiOkResponse({ type: [ScheduledTaskDto] })
  async list() {
    return { data: await this.schedules.list() };
  }

  @RequirePermissions('system.schedules.view')
  @Get(':code/runs')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Execution history for one task; outcomes and durations only (TASK 002)' })
  @ApiOkResponse({ type: [ScheduledRunDto] })
  async runs(@Param('code') code: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const pageNumber = Math.max(1, Number(page ?? '1') || 1);
    const size = Math.min(50, Math.max(1, Number(pageSize ?? '20') || 20));
    const { rows, total } = await this.schedules.history(code, pageNumber, size);
    return { data: rows, meta: collectionMeta(pageNumber, size, total) };
  }

  @RequirePermissions('system.schedules.run')
  @Post(':code/run')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Dispatch one registered task to the worker; it never runs inside this request (TASK 003)' })
  async run(@Param('code') code: string, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.schedules.runNow(code, actor, ctxOf(req)) };
  }

  @RequirePermissions('system.schedules.manage')
  @Post(':code/enabled')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Enable or disable a task the registry allows to be controlled at runtime (TASK 006)' })
  async setEnabled(@Param('code') code: string, @Body() body: SetTaskEnabledDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.schedules.setEnabled(code, body.enabled, actor, ctxOf(req)) };
  }
}
