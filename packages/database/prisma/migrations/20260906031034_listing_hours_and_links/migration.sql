-- AlterTable
ALTER TABLE `businesses` ADD COLUMN `hoursMode` ENUM('unknown', 'scheduled') NOT NULL DEFAULT 'unknown';

-- CreateTable
CREATE TABLE `opening_intervals` (
    `id` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `weekday` TINYINT NOT NULL,
    `allDay` BOOLEAN NOT NULL DEFAULT false,
    `startMinute` SMALLINT NULL,
    `endMinute` SMALLINT NULL,
    `endNextDay` BOOLEAN NOT NULL DEFAULT false,

    INDEX `opening_intervals_businessId_weekday_idx`(`businessId`, `weekday`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hours_exceptions` (
    `id` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `kind` ENUM('closed', 'open24', 'custom') NOT NULL,
    `startMinute` SMALLINT NULL,
    `endMinute` SMALLINT NULL,
    `endNextDay` BOOLEAN NOT NULL DEFAULT false,
    `note` VARCHAR(120) NULL,

    INDEX `hours_exceptions_businessId_date_idx`(`businessId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_links` (
    `id` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `kind` ENUM('facebook', 'instagram', 'x', 'linkedin', 'youtube', 'tiktok', 'other') NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `label` VARCHAR(60) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `business_links_businessId_sortOrder_idx`(`businessId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `opening_intervals` ADD CONSTRAINT `opening_intervals_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hours_exceptions` ADD CONSTRAINT `hours_exceptions_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_links` ADD CONSTRAINT `business_links_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
