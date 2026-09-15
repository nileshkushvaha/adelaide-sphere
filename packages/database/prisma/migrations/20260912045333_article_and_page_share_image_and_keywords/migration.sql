-- AlterTable
ALTER TABLE `posts` ADD COLUMN `ogImageMediaId` VARCHAR(191) NULL,
    ADD COLUMN `seoKeywords` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `static_pages` ADD COLUMN `ogImageMediaId` VARCHAR(191) NULL,
    ADD COLUMN `seoKeywords` VARCHAR(255) NULL;

-- AddForeignKey
ALTER TABLE `posts` ADD CONSTRAINT `posts_ogImageMediaId_fkey` FOREIGN KEY (`ogImageMediaId`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `static_pages` ADD CONSTRAINT `static_pages_ogImageMediaId_fkey` FOREIGN KEY (`ogImageMediaId`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
