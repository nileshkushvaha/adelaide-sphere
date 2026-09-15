-- Phase 22 (SRS BLOG 001/004, SEC 001): public author profiles gain the fields an
-- author card and profile actually need. Every added column is nullable, so
-- existing rows keep their current values and no backfill is required.
-- reviewed: the foreign key on authors.imageMediaId is dropped and recreated only
-- because the column widens from VARCHAR(64) to the VARCHAR(191) used by media
-- asset ids. Widening never truncates, and no rows are deleted.
-- DropForeignKey
ALTER TABLE `authors` DROP FOREIGN KEY `authors_imageMediaId_fkey`;

-- DropIndex
DROP INDEX `authors_imageMediaId_fkey` ON `authors`;

-- AlterTable
ALTER TABLE `authors` ADD COLUMN `expertise` JSON NULL,
    ADD COLUMN `location` VARCHAR(120) NULL,
    ADD COLUMN `pronouns` VARCHAR(40) NULL,
    ADD COLUMN `publicEmail` VARCHAR(255) NULL,
    ADD COLUMN `role` VARCHAR(120) NULL,
    ADD COLUMN `seoDescription` VARCHAR(300) NULL,
    ADD COLUMN `seoTitle` VARCHAR(180) NULL,
    ADD COLUMN `shortBio` VARCHAR(300) NULL,
    ADD COLUMN `websiteUrl` VARCHAR(500) NULL,
    MODIFY `imageMediaId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `author_links` (
    `id` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `kind` ENUM('website', 'facebook', 'instagram', 'x', 'linkedin', 'youtube', 'tiktok', 'threads', 'mastodon', 'github', 'other') NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `label` VARCHAR(60) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `author_links_authorId_sortOrder_idx`(`authorId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `authors` ADD CONSTRAINT `authors_imageMediaId_fkey` FOREIGN KEY (`imageMediaId`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `author_links` ADD CONSTRAINT `author_links_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `authors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
