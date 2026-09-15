-- Phase 22 (SRS CFG 002, DIR 007): editable information pages and manual
-- featured placements. Both tables are new, so nothing existing is touched.
-- featured_placements deliberately has no payment or billing columns: paid
-- promotion is out of scope (FUT 002).
-- CreateTable
CREATE TABLE `static_pages` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(64) NOT NULL,
    `title` VARCHAR(180) NOT NULL,
    `sanitizedBody` MEDIUMTEXT NOT NULL,
    `bodySource` MEDIUMTEXT NOT NULL,
    `bodyFormat` ENUM('markdown', 'html') NOT NULL DEFAULT 'html',
    `seoTitle` VARCHAR(180) NULL,
    `seoDescription` VARCHAR(300) NULL,
    `status` ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
    `contactEmail` VARCHAR(255) NULL,
    `publishedAt` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `updatedByAdminId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `static_pages_slug_key`(`slug`),
    INDEX `static_pages_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `featured_placements` (
    `id` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NULL,
    `note` VARCHAR(500) NULL,
    `createdByAdminId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `featured_placements_startsAt_endsAt_idx`(`startsAt`, `endsAt`),
    INDEX `featured_placements_businessId_idx`(`businessId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `static_pages` ADD CONSTRAINT `static_pages_updatedByAdminId_fkey` FOREIGN KEY (`updatedByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `featured_placements` ADD CONSTRAINT `featured_placements_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `featured_placements` ADD CONSTRAINT `featured_placements_createdByAdminId_fkey` FOREIGN KEY (`createdByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
