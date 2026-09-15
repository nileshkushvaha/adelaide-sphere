import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OperationsController } from './operations.controller.js';
import { OperationsService } from './operations.service.js';

/** Monitoring signals for dashboards and alert rules (SRS MON 001-002). */
@Module({ imports: [AuthModule], controllers: [OperationsController], providers: [OperationsService], exports: [OperationsService] })
export class OperationsModule {}
