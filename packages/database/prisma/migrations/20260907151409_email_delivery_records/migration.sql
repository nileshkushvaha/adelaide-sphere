-- Transactional email delivery records (SRS 1.2 MAIL 005/007).
--
-- Additive only: two new tables and their indexes. Operational metadata only —
-- no rendered message body is stored (MAIL 005), the recipient is held as
-- AES-256-GCM ciphertext with a masked display form beside it, and failure
-- detail is a bounded classification rather than raw provider text (MAIL 006).
--
-- `email_deliveries.providerMessageId` is unique so a duplicated provider
-- acceptance cannot create a second record, and
-- `email_delivery_events.providerEventId` is unique because that uniqueness is
-- what makes duplicate webhook delivery idempotent (MAIL 007).

-- CreateTable
CREATE TABLE `email_deliveries` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(20) NOT NULL,
    `providerMessageId` VARCHAR(191) NULL,
    `templateKey` VARCHAR(64) NOT NULL,
    `category` VARCHAR(32) NOT NULL,
    `recipientMasked` VARCHAR(254) NOT NULL,
    `recipientEncrypted` VARCHAR(512) NOT NULL,
    `subject` VARCHAR(255) NULL,
    `relatedType` VARCHAR(32) NULL,
    `relatedId` VARCHAR(64) NULL,
    `status` ENUM('queued', 'sent', 'delivered', 'delayed', 'failed', 'bounced', 'complained', 'suppressed') NOT NULL DEFAULT 'queued',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `failureCode` VARCHAR(64) NULL,
    `failureSummary` VARCHAR(300) NULL,
    `requestId` VARCHAR(64) NULL,
    `resentFromId` VARCHAR(191) NULL,
    `queuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sentAt` DATETIME(3) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `delayedAt` DATETIME(3) NULL,
    `failedAt` DATETIME(3) NULL,
    `bouncedAt` DATETIME(3) NULL,
    `complainedAt` DATETIME(3) NULL,
    `suppressedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `email_deliveries_providerMessageId_key`(`providerMessageId`),
    INDEX `email_deliveries_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `email_deliveries_category_createdAt_idx`(`category`, `createdAt`),
    INDEX `email_deliveries_templateKey_createdAt_idx`(`templateKey`, `createdAt`),
    INDEX `email_deliveries_relatedType_relatedId_idx`(`relatedType`, `relatedId`),
    INDEX `email_deliveries_resentFromId_idx`(`resentFromId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_delivery_events` (
    `id` VARCHAR(191) NOT NULL,
    `deliveryId` VARCHAR(191) NOT NULL,
    `providerEventId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(32) NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `detail` JSON NULL,

    UNIQUE INDEX `email_delivery_events_providerEventId_key`(`providerEventId`),
    INDEX `email_delivery_events_deliveryId_occurredAt_idx`(`deliveryId`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `email_deliveries` ADD CONSTRAINT `email_deliveries_resentFromId_fkey` FOREIGN KEY (`resentFromId`) REFERENCES `email_deliveries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_delivery_events` ADD CONSTRAINT `email_delivery_events_deliveryId_fkey` FOREIGN KEY (`deliveryId`) REFERENCES `email_deliveries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
