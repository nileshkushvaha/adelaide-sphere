-- A category's own image and its search appearance (SRS CFG 003, SEO 001):
-- shown on the home-page tile and the landing page, all optional, each
-- falling back to the name or description when empty. Additive.
ALTER TABLE `categories` ADD COLUMN `imageMediaId` VARCHAR(191) NULL,
    ADD COLUMN `seoTitle` VARCHAR(180) NULL,
    ADD COLUMN `seoDescription` VARCHAR(300) NULL,
    ADD COLUMN `seoKeywords` VARCHAR(255) NULL,
    ADD COLUMN `ogImageMediaId` VARCHAR(191) NULL;

-- Restrict, not set null: an image in use cannot be deleted from the library
-- (SRS MED 004), and the media screen names the category that uses it.
ALTER TABLE `categories` ADD CONSTRAINT `categories_imageMediaId_fkey` FOREIGN KEY (`imageMediaId`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `categories` ADD CONSTRAINT `categories_ogImageMediaId_fkey` FOREIGN KEY (`ogImageMediaId`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
