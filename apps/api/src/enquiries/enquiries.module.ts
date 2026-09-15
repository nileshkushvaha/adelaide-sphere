import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { IdempotencyService } from '../common/idempotency.service.js';
import { OutboxModule } from '../outbox/outbox.module.js';
import { ReviewsModule } from '../reviews/reviews.module.js';
import { EnquiriesAdminController, EnquiriesPublicController } from './enquiries.controller.js';
import { EnquiriesService } from './enquiries.service.js';

@Module({
  imports: [AuthModule, OutboxModule, ReviewsModule],
  controllers: [EnquiriesPublicController, EnquiriesAdminController],
  providers: [EnquiriesService, IdempotencyService],
  exports: [EnquiriesService],
})
export class EnquiriesModule {}
