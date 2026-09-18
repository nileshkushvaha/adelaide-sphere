-- AI Content Phase 1B: additive canonical Post mapping, generation runs, durable leased
-- operations, immutable approvals and the automation control epoch. No Post data is
-- rewritten; existing topic statuses are kept (the enum only gains values).


-- AlterTable
ALTER TABLE `ai_content_items` ADD COLUMN `failureCode` VARCHAR(64) NULL,
    ADD COLUMN `failureStage` VARCHAR(16) NULL,
    ADD COLUMN `humanModifiedAt` DATETIME(3) NULL,
    ADD COLUMN `humanModifiedByAdminId` VARCHAR(191) NULL,
    ADD COLUMN `postId` VARCHAR(191) NULL,
    MODIFY `status` ENUM('queued', 'paused', 'researching', 'generating', 'needs_fact_review', 'ready_for_review', 'approved', 'scheduled', 'published', 'failed', 'cancelled', 'rejected') NOT NULL DEFAULT 'queued';

-- CreateTable
CREATE TABLE `ai_automation_controls` (
    `id` VARCHAR(16) NOT NULL,
    `epoch` INTEGER NOT NULL DEFAULT 1,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_generation_runs` (
    `id` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `generationVersion` INTEGER NOT NULL,
    `status` ENUM('pending', 'applied', 'proposal', 'failed') NOT NULL DEFAULT 'pending',
    `proposalReason` VARCHAR(64) NULL,
    `settingsVersion` INTEGER NOT NULL,
    `controlEpoch` INTEGER NOT NULL,
    `expectedPostVersion` INTEGER NULL,
    `expectedMaterialHash` CHAR(64) NULL,
    `artifact` JSON NOT NULL,
    `artifactHash` CHAR(64) NOT NULL,
    `factCheck` ENUM('pending', 'passed', 'failed') NOT NULL DEFAULT 'pending',
    `appliedPostVersion` INTEGER NULL,
    `appliedMaterialHash` CHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ai_generation_runs_itemId_generationVersion_key`(`itemId`, `generationVersion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_operations` (
    `id` VARCHAR(191) NOT NULL,
    `operationKey` CHAR(64) NOT NULL,
    `kind` ENUM('apply') NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NULL,
    `state` ENUM('pending', 'running', 'succeeded', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastEnqueuedAt` DATETIME(3) NULL,
    `leaseOwner` VARCHAR(64) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `fencingToken` INTEGER NOT NULL DEFAULT 0,
    `controlEpoch` INTEGER NOT NULL,
    `resultCode` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ai_operations_operationKey_key`(`operationKey`),
    INDEX `ai_operations_state_nextAttemptAt_idx`(`state`, `nextAttemptAt`),
    INDEX `ai_operations_state_leaseUntil_idx`(`state`, `leaseUntil`),
    INDEX `ai_operations_itemId_idx`(`itemId`),
    INDEX `ai_operations_runId_idx`(`runId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_approvals` (
    `id` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NULL,
    `kind` ENUM('content') NOT NULL,
    `postId` VARCHAR(191) NOT NULL,
    `postVersion` INTEGER NOT NULL,
    `materialHash` CHAR(64) NOT NULL,
    `adminId` VARCHAR(191) NULL,
    `reason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `invalidatedAt` DATETIME(3) NULL,
    `invalidationReason` VARCHAR(64) NULL,

    INDEX `ai_approvals_itemId_invalidatedAt_idx`(`itemId`, `invalidatedAt`),
    INDEX `ai_approvals_runId_idx`(`runId`),
    INDEX `ai_approvals_adminId_idx`(`adminId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `ai_content_items_postId_key` ON `ai_content_items`(`postId`);

-- CreateIndex
CREATE INDEX `ai_content_items_humanModifiedByAdminId_idx` ON `ai_content_items`(`humanModifiedByAdminId`);

-- AddForeignKey
ALTER TABLE `ai_content_items` ADD CONSTRAINT `ai_content_items_humanModifiedByAdminId_fkey` FOREIGN KEY (`humanModifiedByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_content_items` ADD CONSTRAINT `ai_content_items_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `posts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_generation_runs` ADD CONSTRAINT `ai_generation_runs_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `ai_content_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_operations` ADD CONSTRAINT `ai_operations_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `ai_content_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_operations` ADD CONSTRAINT `ai_operations_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `ai_generation_runs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_approvals` ADD CONSTRAINT `ai_approvals_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `ai_content_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_approvals` ADD CONSTRAINT `ai_approvals_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `ai_generation_runs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_approvals` ADD CONSTRAINT `ai_approvals_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- The single deployment control row; the epoch advances with safety-relevant AI settings.
INSERT INTO `ai_automation_controls` (`id`, `epoch`, `updatedAt`) VALUES ('default', 1, CURRENT_TIMESTAMP(3));
