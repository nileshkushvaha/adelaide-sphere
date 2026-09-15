import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RedirectsAdminController, SeoPublicController } from './seo.controller.js';
import { RedirectsService } from './redirects.service.js';
import { SitemapService } from './sitemap.service.js';

/** Sitemaps, redirects and the data behind canonical URLs (SRS SEO 002/004). */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [SeoPublicController, RedirectsAdminController],
  providers: [RedirectsService, SitemapService],
  exports: [RedirectsService, SitemapService],
})
export class SeoModule {}
