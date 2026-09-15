-- CreateTable
CREATE TABLE `enquiries` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('business', 'site') NOT NULL DEFAULT 'business',
    `businessId` VARCHAR(191) NULL,
    `name` VARCHAR(80) NOT NULL,
    `emailEncrypted` VARCHAR(500) NOT NULL,
    `phoneEncrypted` VARCHAR(500) NULL,
    `subject` VARCHAR(150) NOT NULL,
    `message` TEXT NOT NULL,
    `acknowledgedVersion` VARCHAR(32) NOT NULL,
    `acknowledgedAt` DATETIME(3) NOT NULL,
    `submitterIpHash` CHAR(64) NULL,
    `handlingStatus` ENUM('new', 'inProgress', 'closed') NOT NULL DEFAULT 'new',
    `deliveryStatus` ENUM('queued', 'providerAccepted', 'delivered', 'retrying', 'failed', 'suppressed') NOT NULL DEFAULT 'queued',
    `deliveryAttempts` INTEGER NOT NULL DEFAULT 0,
    `providerMessageId` VARCHAR(255) NULL,
    `lastError` VARCHAR(500) NULL,
    `suppressionReason` VARCHAR(500) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `handledByAdminId` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `enquiries_handlingStatus_createdAt_idx`(`handlingStatus`, `createdAt`),
    INDEX `enquiries_deliveryStatus_createdAt_idx`(`deliveryStatus`, `createdAt`),
    INDEX `enquiries_businessId_createdAt_idx`(`businessId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `outbox_events` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(64) NOT NULL,
    `resourceType` VARCHAR(32) NOT NULL,
    `resourceId` VARCHAR(64) NOT NULL,
    `resourceVersion` INTEGER NOT NULL DEFAULT 1,
    `correlationId` VARCHAR(64) NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('pending', 'dispatched', 'failed') NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dispatchedAt` DATETIME(3) NULL,
    `lastError` VARCHAR(500) NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `outbox_events_status_availableAt_idx`(`status`, `availableAt`),
    INDEX `outbox_events_resourceType_resourceId_idx`(`resourceType`, `resourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `provider_message_events` (
    `providerEventId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `enquiryId` VARCHAR(64) NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `provider_message_events_enquiryId_idx`(`enquiryId`),
    PRIMARY KEY (`providerEventId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `enquiries` ADD CONSTRAINT `enquiries_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `businesses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enquiries` ADD CONSTRAINT `enquiries_handledByAdminId_fkey` FOREIGN KEY (`handledByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
