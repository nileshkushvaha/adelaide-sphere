-- CreateTable
CREATE TABLE `businesses` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `normalizedName` VARCHAR(120) NOT NULL,
    `slug` VARCHAR(140) NOT NULL,
    `description` TEXT NOT NULL,
    `status` ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
    `primaryCategoryId` VARCHAR(191) NOT NULL,
    `localAreaId` VARCHAR(191) NOT NULL,
    `publicPhone` VARCHAR(30) NULL,
    `normalizedPhone` VARCHAR(20) NULL,
    `publicEmail` VARCHAR(254) NULL,
    `publicUrl` VARCHAR(500) NULL,
    `addressVisibility` ENUM('full', 'areaOnly') NOT NULL DEFAULT 'full',
    `privateEnquiryEmailEncrypted` VARCHAR(500) NULL,
    `eligibilityVerifiedAt` DATETIME(3) NULL,
    `eligibilitySource` VARCHAR(255) NULL,
    `contentRightsReviewedAt` DATETIME(3) NULL,
    `contentRightsNote` VARCHAR(500) NULL,
    `duplicateOverrideReason` VARCHAR(500) NULL,
    `firstPublishedAt` DATETIME(3) NULL,
    `publishedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `businesses_slug_key`(`slug`),
    INDEX `businesses_status_primaryCategoryId_idx`(`status`, `primaryCategoryId`),
    INDEX `businesses_status_localAreaId_idx`(`status`, `localAreaId`),
    INDEX `businesses_status_firstPublishedAt_idx`(`status`, `firstPublishedAt`),
    INDEX `businesses_normalizedName_idx`(`normalizedName`),
    INDEX `businesses_normalizedPhone_idx`(`normalizedPhone`),
    INDEX `businesses_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_addresses` (
    `businessId` VARCHAR(191) NOT NULL,
    `line1` VARCHAR(120) NOT NULL,
    `line2` VARCHAR(120) NULL,
    `suburb` VARCHAR(80) NOT NULL,
    `postcode` CHAR(4) NOT NULL,
    `latitude` DECIMAL(9, 6) NULL,
    `longitude` DECIMAL(9, 6) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`businessId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_categories` (
    `businessId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,

    INDEX `business_categories_categoryId_idx`(`categoryId`),
    PRIMARY KEY (`businessId`, `categoryId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_services` (
    `businessId` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,

    INDEX `business_services_serviceId_idx`(`serviceId`),
    PRIMARY KEY (`businessId`, `serviceId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_ratings` (
    `businessId` VARCHAR(191) NOT NULL,
    `approvedCount` INTEGER NOT NULL DEFAULT 0,
    `ratingSum` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`businessId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `businesses` ADD CONSTRAINT `businesses_primaryCategoryId_fkey` FOREIGN KEY (`primaryCategoryId`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `businesses` ADD CONSTRAINT `businesses_localAreaId_fkey` FOREIGN KEY (`localAreaId`) REFERENCES `local_areas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_addresses` ADD CONSTRAINT `business_addresses_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_categories` ADD CONSTRAINT `business_categories_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_categories` ADD CONSTRAINT `business_categories_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_services` ADD CONSTRAINT `business_services_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_services` ADD CONSTRAINT `business_services_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_ratings` ADD CONSTRAINT `business_ratings_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
