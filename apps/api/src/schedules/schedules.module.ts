import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module.js';
import { SchedulesController } from './schedules.controller.js';
import { SchedulesService } from './schedules.service.js';

/** Scheduled task registry, history and dispatch (SRS 1.2 TASK 001–006). */
@Module({ imports: [OutboxModule], controllers: [SchedulesController], providers: [SchedulesService] })
export class SchedulesModule {}
