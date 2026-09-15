-- CreateTable
CREATE TABLE `reviews` (
    `id` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(80) NOT NULL,
    `privateEmailEncrypted` VARCHAR(500) NOT NULL,
    `emailHash` CHAR(64) NOT NULL,
    `rating` TINYINT NOT NULL,
    `originalText` TEXT NOT NULL,
    `publicText` TEXT NULL,
    `redactionReason` VARCHAR(500) NULL,
    `status` ENUM('pending', 'approved', 'rejected', 'spam') NOT NULL DEFAULT 'pending',
    `moderationReason` VARCHAR(500) NULL,
    `moderatorAdminId` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `repeatFlagged` BOOLEAN NOT NULL DEFAULT false,
    `acknowledgedVersion` VARCHAR(32) NOT NULL,
    `acknowledgedAt` DATETIME(3) NOT NULL,
    `submitterIpHash` CHAR(64) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `reviews_businessId_status_createdAt_idx`(`businessId`, `status`, `createdAt`),
    INDEX `reviews_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `reviews_emailHash_businessId_createdAt_idx`(`emailHash`, `businessId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `abuse_reports` (
    `id` VARCHAR(191) NOT NULL,
    `reviewId` VARCHAR(191) NOT NULL,
    `reason` ENUM('spam', 'offensive', 'misleading', 'privacy', 'other') NOT NULL,
    `details` VARCHAR(1000) NULL,
    `reporterEmailEncrypted` VARCHAR(500) NULL,
    `reporterIpHash` CHAR(64) NULL,
    `targetSnapshot` TEXT NOT NULL,
    `status` ENUM('open', 'investigating', 'resolved') NOT NULL DEFAULT 'open',
    `outcome` ENUM('retain', 'remove', 'spam') NULL,
    `resolutionNote` VARCHAR(1000) NULL,
    `moderatorAdminId` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `abuse_reports_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `abuse_reports_reviewId_idx`(`reviewId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `idempotency_records` (
    `keyHash` CHAR(64) NOT NULL,
    `scope` VARCHAR(64) NOT NULL,
    `payloadFingerprint` CHAR(64) NOT NULL,
    `responseStatus` SMALLINT NOT NULL,
    `responseBody` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `idempotency_records_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`scope`, `keyHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_moderatorAdminId_fkey` FOREIGN KEY (`moderatorAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `abuse_reports` ADD CONSTRAINT `abuse_reports_reviewId_fkey` FOREIGN KEY (`reviewId`) REFERENCES `reviews`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `abuse_reports` ADD CONSTRAINT `abuse_reports_moderatorAdminId_fkey` FOREIGN KEY (`moderatorAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Rating is a whole number from 1 to 5 (SRS REV 001); enforced in the database as well as the DTO.
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_rating_range` CHECK (`rating` BETWEEN 1 AND 5);
