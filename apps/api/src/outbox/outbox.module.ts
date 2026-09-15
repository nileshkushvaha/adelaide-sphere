import { Module } from '@nestjs/common';
import { BullmqQueue } from './bullmq.queue.js';
import { OutboxDispatcher } from './outbox.dispatcher.js';
import { QueuePort } from './queue.port.js';
import { OutboxService } from './outbox.service.js';

/** Outbox persistence plus the dispatcher that hands events to the queue (SRS EVT 001–002). */
@Module({ providers: [OutboxService, OutboxDispatcher, { provide: QueuePort, useClass: BullmqQueue }], exports: [OutboxService, OutboxDispatcher, QueuePort] })
export class OutboxModule {}
