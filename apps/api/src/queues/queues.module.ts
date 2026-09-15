import { Module } from '@nestjs/common';
import { MetricsCollector } from '../observability/metrics.collector.js';
import { WorkerLivenessService } from '../observability/worker-liveness.service.js';
import { QueueMonitorController } from './queue-monitor.controller.js';
import { QueueMonitorService } from './queue-monitor.service.js';

/** Read-and-act view of the background queues (SRS 1.2 QMON 001–005). */
@Module({ controllers: [QueueMonitorController], providers: [QueueMonitorService, WorkerLivenessService, MetricsCollector] })
export class QueuesModule {}
