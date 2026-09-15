import { Module } from '@nestjs/common';
import { SiteController } from './site.controller.js';
import { SiteMetricsService } from './site-metrics.service.js';

@Module({ controllers: [SiteController], providers: [SiteMetricsService] })
export class SiteModule {}
