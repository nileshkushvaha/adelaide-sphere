import { Global, Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module.js';
import { CacheAdminController } from './cache-admin.controller.js';
import { CacheAdminService } from './cache-admin.service.js';
import { CacheService } from './cache.service.js';

/**
 * Public read cache and purge recording (SRS CACHE 001–003), plus the operator's
 * view of it and the only way to clear it (SRS 1.2 CMGR 001–005).
 */
@Global()
@Module({
  imports: [OutboxModule],
  controllers: [CacheAdminController],
  providers: [CacheService, CacheAdminService],
  exports: [CacheService],
})
export class CacheModule {}
