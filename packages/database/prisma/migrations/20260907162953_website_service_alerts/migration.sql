-- Service alerts above the public header (SRS 1.2 ALRT 001-007).
--
-- Additive only: one new table. Two indexes because there are two questions:
-- "which alerts may show right now" (status and window) and "in what order"
-- (severity, priority, display order), and the public request asks both on
-- every page.
--
-- `contentVersion` is separate from `version`: `version` is optimistic
-- concurrency for editors, while `contentVersion` is what a viewer's dismissal
-- is keyed to, so editing the wording brings a dismissed alert back (ALRT 006).
--
-- `linkUrl` is validated at write time against an allowlisted scheme; nothing
-- here relies on the renderer to sniff it (ALRT 005).

-- CreateTable
CREATE TABLE `service_alerts` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `message` VARCHAR(400) NOT NULL,
    `severity` ENUM('informational', 'warning', 'emergency') NOT NULL DEFAULT 'informational',
    `linkLabel` VARCHAR(60) NULL,
    `linkUrl` VARCHAR(300) NULL,
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `dismissible` BOOLEAN NOT NULL DEFAULT true,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
    `contentVersion` INTEGER NOT NULL DEFAULT 1,
    `publishedAt` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdByAdminId` VARCHAR(191) NULL,
    `updatedByAdminId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `service_alerts_status_startsAt_endsAt_idx`(`status`, `startsAt`, `endsAt`),
    INDEX `service_alerts_severity_priority_displayOrder_idx`(`severity`, `priority`, `displayOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `service_alerts` ADD CONSTRAINT `service_alerts_createdByAdminId_fkey` FOREIGN KEY (`createdByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_alerts` ADD CONSTRAINT `service_alerts_updatedByAdminId_fkey` FOREIGN KEY (`updatedByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
