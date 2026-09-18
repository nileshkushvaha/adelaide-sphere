-- AI Content Phase 1F: the daily slot (owner decisions of 19 Sep 2026).
-- Additive only: one nullable column and one new table. No existing data is changed.
-- AlterTable
ALTER TABLE `ai_content_items` ADD COLUMN `awaitingSlotSince` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `ai_schedule_slots` (
    `id` VARCHAR(191) NOT NULL,
    `strategyKey` VARCHAR(32) NOT NULL DEFAULT 'default',
    `localDate` CHAR(10) NOT NULL,
    `ordinal` INTEGER NOT NULL DEFAULT 1,
    `timeZone` VARCHAR(64) NOT NULL,
    `dueAt` DATETIME(3) NOT NULL,
    `settingsVersion` INTEGER NOT NULL,
    `state` ENUM('filled', 'missed', 'reviewed') NOT NULL,
    `reason` VARCHAR(64) NULL,
    `itemId` VARCHAR(191) NULL,
    `resolvedByAdminId` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `resolutionNote` VARCHAR(500) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ai_schedule_slots_state_localDate_idx`(`state`, `localDate`),
    INDEX `ai_schedule_slots_itemId_idx`(`itemId`),
    INDEX `ai_schedule_slots_resolvedByAdminId_idx`(`resolvedByAdminId`),
    UNIQUE INDEX `ai_schedule_slots_strategyKey_localDate_ordinal_key`(`strategyKey`, `localDate`, `ordinal`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ai_schedule_slots` ADD CONSTRAINT `ai_schedule_slots_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `ai_content_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_schedule_slots` ADD CONSTRAINT `ai_schedule_slots_resolvedByAdminId_fkey` FOREIGN KEY (`resolvedByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

