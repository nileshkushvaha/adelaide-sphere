import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { IdempotencyService } from '../common/idempotency.service.js';
import { ReviewsModule } from '../reviews/reviews.module.js';
import { OutboxModule } from '../outbox/outbox.module.js';
import { AuthorsAdminController, BlogCategoriesAdminController, BlogTagsAdminController, PostsAdminController } from './blog.controller.js';
import { BlogPublicController } from './blog-public.controller.js';
import { BlogPublicService } from './blog-public.service.js';
import { CommentsAdminController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';
import { BlogService } from './blog.service.js';

@Module({
  imports: [AuthModule, OutboxModule, ReviewsModule],
  controllers: [AuthorsAdminController, BlogCategoriesAdminController, BlogTagsAdminController, PostsAdminController, BlogPublicController, CommentsAdminController],
  // Scheduled publication is the worker's `content.publish-scheduled` task (SRS BLOG 002, TASK 001).
  providers: [BlogService, BlogPublicService, CommentsService, IdempotencyService],
  exports: [BlogService, CommentsService],
})
export class BlogModule {}
