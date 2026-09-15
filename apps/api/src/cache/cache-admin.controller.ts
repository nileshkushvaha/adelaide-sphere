import { Body, Controller, Get, Header, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';
import type { RequestContext } from '../auth/auth.service.js';
import { CurrentAdmin, RequirePermissions, type AuthenticatedRequest } from '../auth/decorators.js';
import { getRequestId } from '../common/request-id.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { CacheAdminService } from './cache-admin.service.js';

const ctxOf = (req: AuthenticatedRequest): RequestContext => ({ ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req) });

export class CacheStatusDto {
  @ApiProperty({ type: Object, description: 'Whether Redis is reachable, and what it means for the site if it is not.' })
  redis!: { available: boolean; detail: string };
  @ApiProperty({ type: [Object], description: 'Caches this API holds. Entry counts are approximate and capped.' })
  namespaces!: unknown[];
  @ApiProperty({ type: [Object], description: 'Public page caches, cleared through the ordinary invalidation pipeline.' })
  tags!: unknown[];
}

export class ClearCacheDto {
  @ApiProperty({ enum: ['namespace', 'tag'], description: 'Which registry the key belongs to.' })
  @IsIn(['namespace', 'tag'])
  kind!: 'namespace' | 'tag';

  @ApiProperty({ maxLength: 40, description: 'A registered cache key. Patterns and raw Redis keys are not accepted.' })
  @IsString()
  @MaxLength(40)
  key!: string;
}

export class ClearCacheResultDto {
  @ApiPropertyOptional({ description: 'Entries removed, for a namespace held by this API.' }) cleared?: number;
  @ApiProperty() accepted!: boolean;
}

/**
 * Cache manager (SRS 1.2 CMGR 001–005).
 *
 * Read and clear are separate permissions, clearing is metered by the
 * privileged-mutation ceiling that already guards admin writes, and the only
 * things that can be cleared are the registered namespaces and tags — there is
 * no route here that accepts a key, a pattern or a command.
 */
@ApiTags('admin-system')
@Controller('admin/system/cache')
export class CacheAdminController {
  constructor(private readonly cache: CacheAdminService) {}

  @RequirePermissions('system.cache.view')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Cache availability, registered caches and when each was last cleared' })
  @ApiOkResponse({ type: CacheStatusDto })
  async status() {
    return { data: await this.cache.status() };
  }

  @RequirePermissions('system.cache.invalidate')
  @Post('clear')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Clear one registered cache. Unknown keys are refused; nothing accepts a pattern.' })
  @ApiOkResponse({ type: ClearCacheResultDto })
  async clear(@Body() body: ClearCacheDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    const ctx = ctxOf(req);
    if (body.kind === 'namespace') {
      const { cleared } = await this.cache.clearNamespace(body.key, admin, ctx);
      return { data: { cleared, accepted: true } };
    }
    await this.cache.clearTag(body.key, admin, ctx);
    return { data: { accepted: true } };
  }
}
