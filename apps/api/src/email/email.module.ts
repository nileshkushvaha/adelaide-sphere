import { Global, Module } from '@nestjs/common';
import { FieldEncryptionService } from '../common/field-encryption.service.js';
import { EmailDeliveryService } from './email-delivery.service.js';
import { EmailLogsController } from './email-logs.controller.js';
import { EmailWebhookController } from './email-webhook.controller.js';

/**
 * Transactional email delivery records, the provider webhook and the admin log
 * (SRS 1.2 MAIL 005–010). The transports themselves live in
 * `@adelaide-sphere/mail`; this module owns what is recorded about them.
 *
 * Global so the mailer can record a delivery without AuthModule importing this
 * module and this module importing AuthModule back. Guards are applied globally
 * (APP_GUARD), so no import is needed for authorisation either.
 */
@Global()
@Module({
  controllers: [EmailLogsController, EmailWebhookController],
  providers: [EmailDeliveryService, FieldEncryptionService],
  exports: [EmailDeliveryService],
})
export class EmailModule {}
