-- Phase 1A only: additive manual-topic storage; existing Posts/settings/audit are retained.
CREATE TABLE `ai_content_items` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(180) NOT NULL,
  `brief` VARCHAR(2000) NULL,
  `priority` INTEGER NOT NULL DEFAULT 0,
  `source` VARCHAR(16) NOT NULL DEFAULT 'manual',
  `status` ENUM('queued', 'paused', 'cancelled', 'rejected') NOT NULL DEFAULT 'queued',
  `reason` VARCHAR(500) NULL,
  `createdByAdminId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `requestKey` CHAR(64) NOT NULL,
  `payloadHash` CHAR(64) NOT NULL,
  `activeTitleHash` CHAR(64) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ai_content_items_requestKey_key` (`requestKey`),
  UNIQUE INDEX `ai_content_items_activeTitleHash_key` (`activeTitleHash`),
  INDEX `ai_content_items_status_priority_createdAt_id_idx` (`status`, `priority`, `createdAt`, `id`),
  INDEX `ai_content_items_createdByAdminId_idx` (`createdByAdminId`),
  CONSTRAINT `ai_content_items_createdByAdminId_fkey` FOREIGN KEY (`createdByAdminId`) REFERENCES `admin_users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
