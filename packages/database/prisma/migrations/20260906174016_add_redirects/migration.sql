-- Phase 21 (SRS SEO 004): public path redirects.
-- sourcePath is unique so one path can never resolve two ways; targetPath is
-- always site-relative and is NULL only for kind='gone' (410). Chains and
-- cycles are prevented in RedirectsService, which repoints existing aliases at
-- the newest target instead of linking redirects together.
-- CreateTable
CREATE TABLE `redirects` (
    `id` VARCHAR(191) NOT NULL,
    `sourcePath` VARCHAR(255) NOT NULL,
    `targetPath` VARCHAR(255) NULL,
    `kind` ENUM('permanent', 'gone') NOT NULL DEFAULT 'permanent',
    `reason` VARCHAR(500) NULL,
    `resourceType` VARCHAR(32) NULL,
    `resourceId` VARCHAR(64) NULL,
    `createdByAdminId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `redirects_sourcePath_key`(`sourcePath`),
    INDEX `redirects_targetPath_idx`(`targetPath`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `redirects` ADD CONSTRAINT `redirects_createdByAdminId_fkey` FOREIGN KEY (`createdByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
