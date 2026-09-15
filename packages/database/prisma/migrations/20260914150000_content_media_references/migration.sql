-- Images used inside rich text (SRS MED 004, DAT 003).
--
-- Additive only: one new table. Article, page, author-bio, FAQ-answer and blog
-- landing-text bodies refer to images by URL, which no foreign key can see, so
-- the media library allowed deleting those images and the worker's retention
-- task removed them as unused. Each save now records the images its HTML shows;
-- the `media:backfill-content` command records the ones already stored.
--
-- The media reference is RESTRICT: an image a body still shows cannot be deleted
-- at the database level either. Resource ids carry no foreign key because the
-- table serves several resource types; the services remove the rows in the same
-- transaction that deletes a record.
-- CreateTable
CREATE TABLE `content_media_references` (
    `resourceType` VARCHAR(40) NOT NULL,
    `resourceId` VARCHAR(191) NOT NULL,
    `mediaId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `content_media_references_mediaId_idx`(`mediaId`),
    PRIMARY KEY (`resourceType`, `resourceId`, `mediaId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `content_media_references` ADD CONSTRAINT `content_media_references_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

