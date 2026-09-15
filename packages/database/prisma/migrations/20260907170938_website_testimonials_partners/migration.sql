-- Testimonials and client/partner organisations (SRS 1.2 TSTM 001-005, PTNR 001-005).
--
-- Additive only: two new tables.
--
-- Approval and authorisation are evidence, not flags: each records the
-- administrator who gave it and when, with an optional note saying how it was
-- obtained. Publication is refused while they are null, so a testimonial cannot
-- be published without recorded consent and a logo cannot be published without
-- recorded authorisation and alternative text.
--
-- A partner organisation is public marketing content. It is not an account, it
-- carries no credentials and it grants nothing; the Logimart reference showed
-- exactly what happens when that boundary is allowed to blur.
--
-- Media and business references are ON DELETE SET NULL: removing an asset or a
-- listing must not delete the editorial record that pointed at it, and the
-- publication gates below then refuse to publish it until it is fixed.

-- CreateTable
CREATE TABLE `testimonials` (
    `id` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(120) NOT NULL,
    `relationship` VARCHAR(160) NULL,
    `quote` VARCHAR(1000) NOT NULL,
    `businessId` VARCHAR(191) NULL,
    `mediaId` VARCHAR(191) NULL,
    `approvedByAdminId` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `approvalNote` VARCHAR(300) NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
    `publishedAt` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdByAdminId` VARCHAR(191) NULL,
    `updatedByAdminId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `testimonials_status_displayOrder_idx`(`status`, `displayOrder`),
    INDEX `testimonials_businessId_idx`(`businessId`),
    INDEX `testimonials_mediaId_idx`(`mediaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_organisations` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `relationshipLabel` VARCHAR(120) NULL,
    `mediaId` VARCHAR(191) NULL,
    `logoAlt` VARCHAR(200) NULL,
    `websiteUrl` VARCHAR(300) NULL,
    `authorisedByAdminId` VARCHAR(191) NULL,
    `authorisedAt` DATETIME(3) NULL,
    `authorisationNote` VARCHAR(300) NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
    `publishedAt` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdByAdminId` VARCHAR(191) NULL,
    `updatedByAdminId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `partner_organisations_status_displayOrder_idx`(`status`, `displayOrder`),
    INDEX `partner_organisations_mediaId_idx`(`mediaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `testimonials` ADD CONSTRAINT `testimonials_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `businesses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `testimonials` ADD CONSTRAINT `testimonials_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `media_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `testimonials` ADD CONSTRAINT `testimonials_approvedByAdminId_fkey` FOREIGN KEY (`approvedByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `testimonials` ADD CONSTRAINT `testimonials_createdByAdminId_fkey` FOREIGN KEY (`createdByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `testimonials` ADD CONSTRAINT `testimonials_updatedByAdminId_fkey` FOREIGN KEY (`updatedByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_organisations` ADD CONSTRAINT `partner_organisations_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `media_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_organisations` ADD CONSTRAINT `partner_organisations_authorisedByAdminId_fkey` FOREIGN KEY (`authorisedByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_organisations` ADD CONSTRAINT `partner_organisations_createdByAdminId_fkey` FOREIGN KEY (`createdByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_organisations` ADD CONSTRAINT `partner_organisations_updatedByAdminId_fkey` FOREIGN KEY (`updatedByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
