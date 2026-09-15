-- A blog category's search appearance (SRS SEO 001, BLOG 005), matching
-- directory categories, local areas and listings: an optional title,
-- description, keywords and share image, each falling back to the category's
-- name, its generated description and the site image when empty. Additive: no
-- existing row or column changes.
ALTER TABLE `blog_categories` ADD COLUMN `seoTitle` VARCHAR(180) NULL,
    ADD COLUMN `seoDescription` VARCHAR(300) NULL,
    ADD COLUMN `seoKeywords` VARCHAR(255) NULL,
    ADD COLUMN `ogImageMediaId` VARCHAR(191) NULL;

-- Restrict, not set null: an image in use cannot be deleted from the library
-- (SRS MED 004), and the media screen names the category that uses it.
ALTER TABLE `blog_categories` ADD CONSTRAINT `blog_categories_ogImageMediaId_fkey` FOREIGN KEY (`ogImageMediaId`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
