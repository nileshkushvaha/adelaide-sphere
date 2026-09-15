import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators.js';
import { OperationsStatusDto } from './operations.dto.js';
import { OperationsService } from './operations.service.js';

/** Operational signals behind the audit permission (SRS MON 001–002). */
@ApiTags('admin-operations')
@Controller('admin/operations')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @RequirePermissions('system.status.view')
  @Get('status')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Queue age, failed events, delivery failures, publishing lateness and moderation backlog' })
  @ApiOkResponse({ type: OperationsStatusDto })
  async status() {
    return { data: await this.operations.status() };
  }
}
