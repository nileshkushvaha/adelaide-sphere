-- AI Content Phase 1E: featured images through the existing media pipeline (owner decisions of 19 Sep 2026).
-- Additive only: enum widening, nullable columns and one new table. No existing data is changed.
-- AlterTable
ALTER TABLE `ai_budget_buckets` MODIFY `scope` ENUM('day', 'month', 'image_day', 'image_month') NOT NULL;

-- AlterTable
ALTER TABLE `ai_content_items` ADD COLUMN `imageMode` ENUM('manual', 'hybrid') NULL;

-- AlterTable
ALTER TABLE `ai_operations` MODIFY `kind` ENUM('apply', 'research', 'discovery', 'generate', 'image') NOT NULL;

-- AlterTable
ALTER TABLE `ai_price_schedules` ADD COLUMN `imageQuality` VARCHAR(16) NULL,
    ADD COLUMN `imageSize` VARCHAR(16) NULL,
    ADD COLUMN `maxOutputTokens` INTEGER NULL;

-- CreateTable
CREATE TABLE `ai_image_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `slot` ENUM('featured') NOT NULL DEFAULT 'featured',
    `imageVersion` INTEGER NOT NULL,
    `operationId` VARCHAR(191) NOT NULL,
    `status` ENUM('requested', 'stored', 'approved', 'rejected', 'failed', 'outcome_unknown', 'superseded') NOT NULL DEFAULT 'requested',
    `prompt` VARCHAR(1500) NOT NULL,
    `promptHash` CHAR(64) NOT NULL,
    `policyVersion` VARCHAR(32) NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `model` VARCHAR(64) NOT NULL,
    `size` VARCHAR(16) NOT NULL,
    `quality` VARCHAR(16) NOT NULL,
    `mediaAssetId` VARCHAR(191) NULL,
    `checksum` CHAR(64) NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `disclosureText` VARCHAR(255) NOT NULL,
    `disclosureHash` CHAR(64) NOT NULL,
    `requestedByAdminId` VARCHAR(191) NULL,
    `approvedByAdminId` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `approvedChecksum` CHAR(64) NULL,
    `approvedAltHash` CHAR(64) NULL,
    `approvedDisclosureHash` CHAR(64) NULL,
    `approvedPostVersion` INTEGER NULL,
    `reviewNote` VARCHAR(500) NULL,
    `failureCode` VARCHAR(64) NULL,
    `supersededAt` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ai_image_jobs_operationId_key`(`operationId`),
    UNIQUE INDEX `ai_image_jobs_mediaAssetId_key`(`mediaAssetId`),
    INDEX `ai_image_jobs_requestedByAdminId_idx`(`requestedByAdminId`),
    INDEX `ai_image_jobs_approvedByAdminId_idx`(`approvedByAdminId`),
    UNIQUE INDEX `ai_image_jobs_itemId_slot_imageVersion_key`(`itemId`, `slot`, `imageVersion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ai_image_jobs` ADD CONSTRAINT `ai_image_jobs_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `ai_content_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_image_jobs` ADD CONSTRAINT `ai_image_jobs_operationId_fkey` FOREIGN KEY (`operationId`) REFERENCES `ai_operations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_image_jobs` ADD CONSTRAINT `ai_image_jobs_mediaAssetId_fkey` FOREIGN KEY (`mediaAssetId`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_image_jobs` ADD CONSTRAINT `ai_image_jobs_requestedByAdminId_fkey` FOREIGN KEY (`requestedByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_image_jobs` ADD CONSTRAINT `ai_image_jobs_approvedByAdminId_fkey` FOREIGN KEY (`approvedByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

