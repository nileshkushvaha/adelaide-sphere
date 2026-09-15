import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { IdempotencyService } from '../common/idempotency.service.js';
import { DirectoryModule } from '../directory/directory.module.js';
import { ReportsService } from './reports.service.js';
import { ReportsAdminController, ReviewsAdminController, ReviewsPublicController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

@Module({
  imports: [AuthModule, DirectoryModule],
  controllers: [ReviewsPublicController, ReviewsAdminController, ReportsAdminController],
  providers: [ReviewsService, ReportsService, IdempotencyService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
