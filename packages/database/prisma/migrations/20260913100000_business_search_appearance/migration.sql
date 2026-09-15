-- A business listing's search appearance (SRS SEO 001), matching categories
-- and local areas: an optional title, description, keywords and share image,
-- each falling back to the listing's own name, description and photograph
-- when empty. Additive: no existing row or column changes.
ALTER TABLE `businesses` ADD COLUMN `seoTitle` VARCHAR(180) NULL,
    ADD COLUMN `seoDescription` VARCHAR(300) NULL,
    ADD COLUMN `seoKeywords` VARCHAR(255) NULL,
    ADD COLUMN `ogImageMediaId` VARCHAR(191) NULL;

-- Restrict, not set null: an image in use cannot be deleted from the library
-- (SRS MED 004), and the media screen names the listing that uses it.
ALTER TABLE `businesses` ADD CONSTRAINT `businesses_ogImageMediaId_fkey` FOREIGN KEY (`ogImageMediaId`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
