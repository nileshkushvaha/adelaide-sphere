import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAdmin, SessionOnly } from '../auth/decorators.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { DashboardDto } from './dashboard.dto.js';
import { DashboardService } from './dashboard.service.js';

/** Operational overview (SRS ADM 003): counts scoped to the caller's permissions. */
@ApiTags('admin-dashboard')
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @SessionOnly()
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Moderation, enquiry, publishing and audit counts the caller is allowed to see' })
  @ApiOkResponse({ type: DashboardDto })
  async summary(@CurrentAdmin() actor: AdminPrincipal) {
    return { data: await this.dashboard.summary(actor) };
  }
}
