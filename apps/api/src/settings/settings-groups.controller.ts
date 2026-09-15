import { Body, Controller, Get, Header, Put, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestContext } from '../auth/auth.service.js';
import { CurrentAdmin, RequirePermissions, SessionOnly, type AuthenticatedRequest } from '../auth/decorators.js';
import { getRequestId } from '../common/request-id.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { SettingGroupDto, SettingGroupValuesDto, UpdateSettingGroupDto } from './dto/settings-registry.dto.js';
import { registryMetadata } from './registry.js';
import { SecurityConsequenceService } from '../auth/security-consequence.service.js';
import { SettingsStoreService } from './settings-store.service.js';

const ctxOf = (req: AuthenticatedRequest): RequestContext => ({ ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req) });

/**
 * Owned settings groups (SRS 1.2 SET 001–005).
 *
 * Each group has its own route pair and its own declared permissions, so the
 * guard decides statically from the code catalogue rather than from a group
 * name in the URL. The registry listing is session-only and filtered to the
 * groups the caller may actually view — the same shape as the principal
 * endpoint of RBAC 007, and the contract the admin settings screens build their
 * forms from. No response from this controller can carry a secret: secrets are
 * never settings (SET 004), and the registry carries metadata only.
 */
@ApiTags('admin-settings')
@Controller('admin/settings')
export class SettingsGroupsController {
  constructor(
    private readonly store: SettingsStoreService,
    private readonly consequences: SecurityConsequenceService,
  ) {}

  @SessionOnly()
  @Get('registry')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Declared settings groups and their setting metadata, filtered to what the caller may view' })
  @ApiOkResponse({ type: [SettingGroupDto] })
  registry(@CurrentAdmin() admin: AdminPrincipal) {
    const held = new Set(admin.permissions);
    const groups = registryMetadata().filter((group) => held.has(group.viewPermission));
    return { data: groups };
  }

  @RequirePermissions('security.settings.view')
  @Get('security')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Security settings values (SECS 001–008)' })
  @ApiOkResponse({ type: SettingGroupValuesDto })
  async security() {
    return { data: await this.store.read('security') };
  }

  @RequirePermissions('security.settings.update')
  @Put('security')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: SettingGroupValuesDto })
  async updateSecurity(@Body() body: UpdateSettingGroupDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    const ctx = ctxOf(req);
    const before = await this.store.read('security');
    const after = await this.store.update('security', body.values, body.expectedVersion, admin, ctx);
    // A security setting that must take effect now does so now, and the effect
    // is recorded (SRS 1.2 SECS 006/008).
    await this.consequences.apply(before.values, after.values, admin, ctx);
    return { data: after };
  }

  @RequirePermissions('system.settings.view')
  @Get('email')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Email settings values. The provider API key and signing secret are environment-managed and never appear here (SET 004).' })
  @ApiOkResponse({ type: SettingGroupValuesDto })
  async email() {
    return { data: await this.store.read('email') };
  }

  @RequirePermissions('system.settings.update')
  @Put('email')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: SettingGroupValuesDto })
  async updateEmail(@Body() body: UpdateSettingGroupDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.store.update('email', body.values, body.expectedVersion, admin, ctxOf(req)) };
  }

  @RequirePermissions('system.settings.view')
  @Get('operations')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Operational settings values (cache, queue and scheduled task behaviour)' })
  @ApiOkResponse({ type: SettingGroupValuesDto })
  async operations() {
    return { data: await this.store.read('operations') };
  }

  @RequirePermissions('system.settings.update')
  @Put('operations')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: SettingGroupValuesDto })
  async updateOperations(@Body() body: UpdateSettingGroupDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.store.update('operations', body.values, body.expectedVersion, admin, ctxOf(req)) };
  }
}
