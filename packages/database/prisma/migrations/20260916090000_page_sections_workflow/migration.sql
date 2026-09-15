-- Pages built from sections, with scheduling, autosave and restorable
-- revisions (change log 1.17). Additive only: existing pages keep their body
-- and read as one text section until they are next saved; the status enum only
-- gains a value; no row or column is removed.

-- AlterTable
ALTER TABLE `static_pages` MODIFY `status` ENUM('draft', 'published', 'scheduled') NOT NULL DEFAULT 'draft',
    ADD COLUMN `sections` JSON NULL,
    ADD COLUMN `scheduledAt` DATETIME(3) NULL,
    ADD COLUMN `publishFailure` VARCHAR(300) NULL,
    ADD COLUMN `noindex` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `static_pages_status_scheduledAt_idx` ON `static_pages`(`status`, `scheduledAt`);

-- AlterTable
ALTER TABLE `content_revisions` ADD COLUMN `sectionsSnapshot` JSON NULL;

-- CreateTable
CREATE TABLE `page_autosaves` (
    `id` VARCHAR(191) NOT NULL,
    `pageId` VARCHAR(191) NOT NULL,
    `adminId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(180) NOT NULL,
    `sections` JSON NOT NULL,
    `baseVersion` INTEGER NOT NULL,
    `savedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `page_autosaves_adminId_idx`(`adminId`),
    UNIQUE INDEX `page_autosaves_pageId_adminId_key`(`pageId`, `adminId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `page_autosaves` ADD CONSTRAINT `page_autosaves_pageId_fkey` FOREIGN KEY (`pageId`) REFERENCES `static_pages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `page_autosaves` ADD CONSTRAINT `page_autosaves_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
