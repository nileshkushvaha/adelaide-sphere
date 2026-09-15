-- An administrator's default author profile (SRS 1.10 BLOG 001).
--
-- Additive only: one nullable column, its index and a foreign key that clears
-- when the author profile is deleted. It is a private preference that
-- pre-selects the author on new articles; public author identity stays
-- separate from login identity and never exposes this link.
-- AlterTable
ALTER TABLE `admin_users` ADD COLUMN `defaultAuthorId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `admin_users_defaultAuthorId_idx` ON `admin_users`(`defaultAuthorId`);

-- AddForeignKey
ALTER TABLE `admin_users` ADD CONSTRAINT `admin_users_defaultAuthorId_fkey` FOREIGN KEY (`defaultAuthorId`) REFERENCES `authors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

