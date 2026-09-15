import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OutboxModule } from '../outbox/outbox.module.js';
import { BusinessGalleryController, MediaAdminController } from './media.controller.js';
import { MediaService } from './media.service.js';
import { S3ObjectStorage } from './s3.storage.js';
import { ObjectStoragePort } from './storage.port.js';

/** Media storage and lifecycle (SRS MED 001–004). */
@Global()
@Module({
  imports: [AuthModule, OutboxModule],
  controllers: [MediaAdminController, BusinessGalleryController],
  providers: [MediaService, { provide: ObjectStoragePort, useClass: S3ObjectStorage }],
  exports: [MediaService, ObjectStoragePort],
})
export class MediaModule {}
