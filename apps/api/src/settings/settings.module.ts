import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { HomePublicController, SettingsAdminController, SiteSettingsPublicController, StaticPagePreviewController, StaticPagesAdminController, StaticPagesPublicController } from './settings.controller.js';
import { SettingsGroupsController } from './settings-groups.controller.js';
import { SettingsService } from './settings.service.js';

import { StaticPagesService } from './static-pages.service.js';

/**
 * Site settings and the editable information pages (SRS CFG 001–002), plus the
 * owned settings groups and their registry (SRS 1.2 SET 001–005).
 */
@Module({
  imports: [AuthModule],
  controllers: [HomePublicController, SiteSettingsPublicController, SettingsAdminController, SettingsGroupsController, StaticPagesAdminController, StaticPagesPublicController, StaticPagePreviewController],
  providers: [SettingsService, StaticPagesService],
  exports: [SettingsService, StaticPagesService],
})
export class SettingsModule {}
