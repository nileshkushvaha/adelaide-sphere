import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { IdentityModule } from '../identity/identity.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { SensitiveThrottleGuard } from '../authorization/sensitive-throttle.guard.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { AccountService } from './account.service.js';
import { AuthController } from './auth.controller.js';
import { FieldEncryptionService } from '../common/field-encryption.service.js';
import { TotpService } from './totp/totp.service.js';
import { AuthService } from './auth.service.js';
import { CsrfOriginGuard } from './guards/csrf-origin.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { SessionAuthGuard } from './guards/session-auth.guard.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { ConsoleMailer } from './mailer/console-mailer.js';
import { MailerPort } from './mailer/mailer.port.js';
import { NullMailer } from './mailer/null-mailer.js';
import { EmailDeliveryService } from '../email/email-delivery.service.js';
import { PasswordHistoryService } from './password-history.service.js';
import { SecurityConsequenceService } from './security-consequence.service.js';
import { SecurityPolicyService } from './security-policy.service.js';
import { RecordingMailer } from './mailer/recording-mailer.js';
import { ResendMailer } from './mailer/resend-mailer.js';
import { SmtpMailer } from './mailer/smtp-mailer.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';

/**
 * AuthenticationModule (SRS section 16). Registers the global guard chain in
 * order: CSRF origin → session → permissions. Guards are global so that every
 * future admin controller inherits them without opting in.
 */
@Module({
  imports: [IdentityModule, AuthorizationModule],
  controllers: [AuthController],
  providers: [
    PasswordService,
    SessionService,
    LoginThrottleService,
    SecurityPolicyService,
    SecurityConsequenceService,
    PasswordHistoryService,
    AuthService,
    AccountService,
    TotpService,
    FieldEncryptionService,
    {
      provide: MailerPort,
      useFactory: (config: ConfigService<EnvironmentVariables, true>, deliveries: EmailDeliveryService) => {
        const transport = config.get('MAIL_TRANSPORT', { infer: true });
        const mailer =
          transport === 'smtp'
            ? SmtpMailer.fromConfig(config)
            : transport === 'resend'
              ? ResendMailer.fromConfig(config)
              : transport === 'console'
                ? new ConsoleMailer()
                : new NullMailer();
        // Every transport is recorded the same way (SRS 1.2 MAIL 005), except
        // the null transport, which sends nothing and so has nothing to record.
        return transport === 'none' ? mailer : new RecordingMailer(mailer, deliveries);
      },
      inject: [ConfigService, EmailDeliveryService],
    },
    { provide: APP_GUARD, useClass: CsrfOriginGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // Last in the chain: it meters what an already-authorised administrator may
    // do in a burst, and never converts a missing permission into a 429.
    { provide: APP_GUARD, useClass: SensitiveThrottleGuard },
  ],
  exports: [SessionService, PasswordService, MailerPort, FieldEncryptionService, SecurityPolicyService, SecurityConsequenceService],
})
export class AuthModule {}
