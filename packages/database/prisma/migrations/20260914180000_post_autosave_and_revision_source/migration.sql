-- Autosave and editable revision history for articles (SRS 1.10 BLOG 003).
--
-- Additive only. `post_autosaves` holds one row per article per administrator:
-- their unsaved work, private, never published and never a revision; it
-- cascades with the article and the administrator. `content_revisions` gains
-- the editable source, its format and the summary, so restoring a version
-- gives back what was written rather than only its sanitised HTML; existing
-- revisions keep null there and restore from their HTML snapshot.
-- AlterTable
ALTER TABLE `content_revisions` ADD COLUMN `bodyFormat` ENUM('markdown', 'html') NULL,
    ADD COLUMN `bodySource` MEDIUMTEXT NULL,
    ADD COLUMN `excerpt` VARCHAR(500) NULL;

-- CreateTable
CREATE TABLE `post_autosaves` (
    `id` VARCHAR(191) NOT NULL,
    `postId` VARCHAR(191) NOT NULL,
    `adminId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(180) NOT NULL,
    `excerpt` VARCHAR(500) NOT NULL,
    `bodyFormat` ENUM('markdown', 'html') NOT NULL,
    `bodySource` MEDIUMTEXT NOT NULL,
    `baseVersion` INTEGER NOT NULL,
    `savedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `post_autosaves_adminId_idx`(`adminId`),
    UNIQUE INDEX `post_autosaves_postId_adminId_key`(`postId`, `adminId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `post_autosaves` ADD CONSTRAINT `post_autosaves_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `post_autosaves` ADD CONSTRAINT `post_autosaves_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

