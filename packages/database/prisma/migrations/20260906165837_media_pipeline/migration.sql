-- AlterTable
-- reviewed: widening the placeholder cover columns from VARCHAR(64) to the
-- VARCHAR(191) used by every id column, so they can carry a real foreign key to
-- media_assets. Both columns are currently NULL everywhere (no media existed
-- before this migration), so no data is truncated or rewritten.
ALTER TABLE `posts` MODIFY `coverMediaId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `media_assets` (
    `id` VARCHAR(191) NOT NULL,
    `sourceName` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(64) NOT NULL,
    `bytes` INTEGER NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `checksum` CHAR(64) NULL,
    `objectKey` VARCHAR(255) NOT NULL,
    `status` ENUM('quarantined', 'ready', 'rejected') NOT NULL DEFAULT 'quarantined',
    `rejectionReason` VARCHAR(500) NULL,
    `altText` VARCHAR(255) NULL,
    `credit` VARCHAR(255) NULL,
    `rightsNote` VARCHAR(500) NULL,
    `focalX` DECIMAL(4, 3) NULL,
    `focalY` DECIMAL(4, 3) NULL,
    `uploadedByAdminId` VARCHAR(191) NULL,
    `readyAt` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `media_assets_objectKey_key`(`objectKey`),
    INDEX `media_assets_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `media_variants` (
    `id` VARCHAR(191) NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `kind` ENUM('thumbnail', 'card', 'hero') NOT NULL,
    `objectKey` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(64) NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `bytes` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `media_variants_objectKey_key`(`objectKey`),
    UNIQUE INDEX `media_variants_assetId_kind_key`(`assetId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_media` (
    `businessId` VARCHAR(191) NOT NULL,
    `mediaId` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `caption` VARCHAR(255) NULL,
    `altOverride` VARCHAR(255) NULL,
    `isCover` BOOLEAN NOT NULL DEFAULT false,

    INDEX `business_media_mediaId_idx`(`mediaId`),
    INDEX `business_media_businessId_sortOrder_idx`(`businessId`, `sortOrder`),
    PRIMARY KEY (`businessId`, `mediaId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `authors` ADD CONSTRAINT `authors_imageMediaId_fkey` FOREIGN KEY (`imageMediaId`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `posts` ADD CONSTRAINT `posts_coverMediaId_fkey` FOREIGN KEY (`coverMediaId`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_uploadedByAdminId_fkey` FOREIGN KEY (`uploadedByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_variants` ADD CONSTRAINT `media_variants_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `media_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_media` ADD CONSTRAINT `business_media_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_media` ADD CONSTRAINT `business_media_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
