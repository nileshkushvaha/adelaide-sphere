-- Scheduled tasks (SRS 1.2 TASK 001-006).
--
-- Two additive tables, no destructive statement:
--   scheduled_task_runs   execution history: outcomes and durations only, kept
--                         30 days (TASK 002). `taskCode` is deliberately not a
--                         foreign key -- the task registry lives in code, and
--                         history has to outlive a task being retired.
--   scheduled_task_states runtime enable/disable, one row only once someone has
--                         changed the default (TASK 006). A task the registry
--                         marks required for correctness stays enabled whatever
--                         a row here says; the API refuses to write one.

-- CreateTable
CREATE TABLE `scheduled_task_runs` (
    `id` VARCHAR(191) NOT NULL,
    `taskCode` VARCHAR(64) NOT NULL,
    `trigger` ENUM('scheduled', 'manual') NOT NULL,
    `outcome` ENUM('running', 'succeeded', 'failed', 'skipped', 'timedOut') NOT NULL DEFAULT 'running',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `durationMs` INTEGER NULL,
    `detail` VARCHAR(300) NULL,
    `actorAdminId` VARCHAR(191) NULL,
    `runnerId` VARCHAR(64) NULL,

    INDEX `scheduled_task_runs_taskCode_startedAt_idx`(`taskCode`, `startedAt`),
    INDEX `scheduled_task_runs_startedAt_idx`(`startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `scheduled_task_states` (
    `taskCode` VARCHAR(64) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `updatedByAdminId` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`taskCode`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `scheduled_task_runs` ADD CONSTRAINT `scheduled_task_runs_actorAdminId_fkey` FOREIGN KEY (`actorAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scheduled_task_states` ADD CONSTRAINT `scheduled_task_states_updatedByAdminId_fkey` FOREIGN KEY (`updatedByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
