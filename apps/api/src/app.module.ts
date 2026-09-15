import { Module } from '@nestjs/common';
import { CacheModule } from './cache/cache.module.js';
import { CaptchaModule } from './common/captcha/captcha.module.js';
import { AppConfigModule } from './config/app-config.module.js';
import { AdminsModule } from './admins/admins.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { DatabaseModule } from './database/database.module.js';
import { DirectoryModule } from './directory/directory.module.js';
import { HealthModule } from './health/health.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { AuthorizationModule } from './authorization/authorization.module.js';
import { OperationsModule } from './operations/operations.module.js';
import { RedisModule } from './redis/redis.module.js';
import { MediaModule } from './media/media.module.js';
import { BlogModule } from './blog/blog.module.js';
import { EnquiriesModule } from './enquiries/enquiries.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { SeoModule } from './seo/seo.module.js';
import { EmailModule } from './email/email.module.js';
import { WebsiteModule } from './website/website.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { SettingsStoreModule } from './settings/settings-store.module.js';
import { SiteModule } from './site/site.module.js';
import { QueuesModule } from './queues/queues.module.js';
import { SchedulesModule } from './schedules/schedules.module.js';
import { TaxonomyModule } from './taxonomy/taxonomy.module.js';

@Module({
  imports: [AppConfigModule, CacheModule, CaptchaModule, DatabaseModule, RedisModule, AuditModule, AuthorizationModule, IdentityModule, AuthModule, AdminsModule, TaxonomyModule, DirectoryModule, ReviewsModule,
    EnquiriesModule,
    BlogModule,
    MediaModule,
    DashboardModule,
    OperationsModule,
    SeoModule,
    SettingsStoreModule,
    SettingsModule,
    EmailModule,
    WebsiteModule,
    QueuesModule, SchedulesModule, SiteModule, HealthModule],
})
export class AppModule {}
