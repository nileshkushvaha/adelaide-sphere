-- A local area's own image and its search appearance, the same shape the
-- categories carry. All optional; additive.
ALTER TABLE `local_areas` ADD COLUMN `imageMediaId` VARCHAR(191) NULL,
    ADD COLUMN `seoTitle` VARCHAR(180) NULL,
    ADD COLUMN `seoDescription` VARCHAR(300) NULL,
    ADD COLUMN `seoKeywords` VARCHAR(255) NULL,
    ADD COLUMN `ogImageMediaId` VARCHAR(191) NULL;

ALTER TABLE `local_areas` ADD CONSTRAINT `local_areas_imageMediaId_fkey` FOREIGN KEY (`imageMediaId`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `local_areas` ADD CONSTRAINT `local_areas_ogImageMediaId_fkey` FOREIGN KEY (`ogImageMediaId`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
