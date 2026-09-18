import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BackupStatusService, backupStateDirProvider } from './backup-status.service.js';
import { OperationsController } from './operations.controller.js';
import { OperationsService } from './operations.service.js';

/** Monitoring signals for dashboards and alert rules (SRS MON 001-002). */
@Module({ imports: [AuthModule], controllers: [OperationsController], providers: [OperationsService, BackupStatusService, backupStateDirProvider], exports: [OperationsService] })
export class OperationsModule {}
