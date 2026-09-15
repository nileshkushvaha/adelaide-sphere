-- A blog tag's search appearance (SRS SEO 001, change log 1.15), matching blog
-- categories: an optional title, description, keywords and share image, each
-- falling back to the tag's name, its composed description and the site image
-- when empty. Additive: no existing row or column changes.
ALTER TABLE `blog_tags` ADD COLUMN `seoTitle` VARCHAR(180) NULL,
    ADD COLUMN `seoDescription` VARCHAR(300) NULL,
    ADD COLUMN `seoKeywords` VARCHAR(255) NULL,
    ADD COLUMN `ogImageMediaId` VARCHAR(191) NULL;

-- Restrict, not set null: an image in use cannot be deleted from the library
-- (SRS MED 004), and the media screen names the tag that uses it.
ALTER TABLE `blog_tags` ADD CONSTRAINT `blog_tags_ogImageMediaId_fkey` FOREIGN KEY (`ogImageMediaId`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
