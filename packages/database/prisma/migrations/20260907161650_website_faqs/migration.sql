-- Frequently asked questions (SRS 1.2 FAQ 001-005).
--
-- Additive only: one new table. Answers are stored twice on purpose, exactly as
-- articles and information pages already are: `answerSource` is what the editor
-- wrote, `answerHtml` is what the SEC 001 allowlist produced and the only thing
-- ever rendered publicly, so a change to the sanitiser can be re-applied without
-- losing the original.
--
-- `WebsiteContentStatus` and `ServiceAlertSeverity` are shared by the section 26
-- modules rather than repeated per table: the four modules differ in their
-- fields, not in what "published" means.
--
-- The composite index matches the public query exactly (published, ordered);
-- the admin list adds status to the same index.

-- CreateTable
CREATE TABLE `faqs` (
    `id` VARCHAR(191) NOT NULL,
    `question` VARCHAR(300) NOT NULL,
    `answerHtml` MEDIUMTEXT NOT NULL,
    `answerSource` MEDIUMTEXT NOT NULL,
    `answerFormat` ENUM('markdown', 'html') NOT NULL DEFAULT 'html',
    `groupName` VARCHAR(80) NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
    `publishedAt` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdByAdminId` VARCHAR(191) NULL,
    `updatedByAdminId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `faqs_status_displayOrder_idx`(`status`, `displayOrder`),
    INDEX `faqs_groupName_idx`(`groupName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `faqs` ADD CONSTRAINT `faqs_createdByAdminId_fkey` FOREIGN KEY (`createdByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `faqs` ADD CONSTRAINT `faqs_updatedByAdminId_fkey` FOREIGN KEY (`updatedByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
