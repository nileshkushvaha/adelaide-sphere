-- AI Content Phase 1C: additive research, evidence, typed claims, source registry, topic novelty
-- and the inventory epoch. Operation kind and itemId only widen (new enum values, NULL allowed).
-- No existing row is rewritten.


-- AlterTable
ALTER TABLE `ai_automation_controls` ADD COLUMN `inventoryEpoch` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `ai_content_items` ADD COLUMN `eventKey` CHAR(64) NULL,
    ADD COLUMN `followUpOfPostId` VARCHAR(191) NULL,
    ADD COLUMN `followUpReason` VARCHAR(500) NULL,
    ADD COLUMN `intentKey` CHAR(64) NULL,
    ADD COLUMN `noveltyCheckedAt` DATETIME(3) NULL,
    ADD COLUMN `noveltyDetail` JSON NULL,
    ADD COLUMN `noveltyEpoch` INTEGER NULL,
    ADD COLUMN `noveltyStatus` ENUM('unchecked', 'clear', 'review', 'duplicate') NOT NULL DEFAULT 'unchecked',
    ADD COLUMN `researchUrls` JSON NULL,
    ADD COLUMN `selectionReason` VARCHAR(300) NULL,
    ADD COLUMN `topicApprovedAt` DATETIME(3) NULL,
    ADD COLUMN `topicApprovedByAdminId` VARCHAR(191) NULL,
    ADD COLUMN `topicTokens` VARCHAR(400) NULL;

-- AlterTable
ALTER TABLE `ai_operations` ADD COLUMN `packetId` VARCHAR(191) NULL,
    MODIFY `kind` ENUM('apply', 'research', 'discovery') NOT NULL,
    MODIFY `itemId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ai_research_sources` (
    `id` VARCHAR(191) NOT NULL,
    `host` VARCHAR(253) NOT NULL,
    `label` VARCHAR(120) NOT NULL,
    `tier` ENUM('official_government', 'official_business', 'institutional', 'publication', 'unclassified') NOT NULL,
    `feedUrl` VARCHAR(500) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdByAdminId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ai_research_sources_host_key`(`host`),
    INDEX `ai_research_sources_active_idx`(`active`),
    INDEX `ai_research_sources_createdByAdminId_idx`(`createdByAdminId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_research_packets` (
    `id` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `status` ENUM('collecting', 'verified', 'needs_fact_review', 'failed') NOT NULL DEFAULT 'collecting',
    `failureCode` VARCHAR(64) NULL,
    `reasons` JSON NULL,
    `inventoryEpoch` INTEGER NOT NULL,
    `context` JSON NULL,
    `changes` JSON NULL,
    `freshUntil` DATETIME(3) NULL,
    `evaluatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ai_research_packets_itemId_version_key`(`itemId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_source_evidence` (
    `id` VARCHAR(191) NOT NULL,
    `packetId` VARCHAR(191) NOT NULL,
    `url` VARCHAR(2000) NOT NULL,
    `urlHash` CHAR(64) NOT NULL,
    `finalUrl` VARCHAR(2000) NULL,
    `host` VARCHAR(253) NOT NULL,
    `tier` ENUM('official_government', 'official_business', 'institutional', 'publication', 'unclassified') NOT NULL,
    `fetchStatus` ENUM('ok', 'http_error', 'blocked', 'robots_disallowed', 'timeout', 'too_large', 'unsupported_type', 'network_error') NOT NULL,
    `httpStatus` INTEGER NULL,
    `contentType` VARCHAR(100) NULL,
    `contentHash` CHAR(64) NULL,
    `etag` VARCHAR(200) NULL,
    `title` VARCHAR(300) NULL,
    `sourceDate` DATETIME(3) NULL,
    `text` TEXT NULL,
    `structuredData` JSON NULL,
    `fetchedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ai_source_evidence_urlHash_contentHash_idx`(`urlHash`, `contentHash`),
    UNIQUE INDEX `ai_source_evidence_packetId_urlHash_key`(`packetId`, `urlHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_fact_claims` (
    `id` VARCHAR(191) NOT NULL,
    `packetId` VARCHAR(191) NOT NULL,
    `claimKey` CHAR(64) NOT NULL,
    `kind` ENUM('business_identity', 'address', 'phone', 'website', 'opening_hours', 'price', 'availability', 'event_datetime', 'event_location', 'geography', 'background') NOT NULL,
    `subject` VARCHAR(200) NOT NULL,
    `value` VARCHAR(1000) NOT NULL,
    `material` BOOLEAN NOT NULL DEFAULT true,
    `origin` ENUM('extracted', 'editor') NOT NULL,
    `status` ENUM('verified', 'unresolved', 'conflicting', 'stale', 'excluded') NOT NULL DEFAULT 'unresolved',
    `reason` VARCHAR(300) NULL,
    `validUntil` DATETIME(3) NULL,
    `freshUntil` DATETIME(3) NULL,
    `excluded` BOOLEAN NOT NULL DEFAULT false,
    `accepted` BOOLEAN NOT NULL DEFAULT false,
    `resolutionNote` VARCHAR(500) NULL,
    `resolvedByAdminId` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdByAdminId` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ai_fact_claims_packetId_status_idx`(`packetId`, `status`),
    INDEX `ai_fact_claims_resolvedByAdminId_idx`(`resolvedByAdminId`),
    INDEX `ai_fact_claims_createdByAdminId_idx`(`createdByAdminId`),
    UNIQUE INDEX `ai_fact_claims_packetId_claimKey_key`(`packetId`, `claimKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_claim_sources` (
    `claimId` VARCHAR(191) NOT NULL,
    `evidenceId` VARCHAR(191) NOT NULL,
    `excerpt` VARCHAR(1000) NOT NULL,
    `location` VARCHAR(200) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ai_claim_sources_evidenceId_idx`(`evidenceId`),
    PRIMARY KEY (`claimId`, `evidenceId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ai_content_items_intentKey_idx` ON `ai_content_items`(`intentKey`);

-- CreateIndex
CREATE INDEX `ai_content_items_eventKey_idx` ON `ai_content_items`(`eventKey`);

-- CreateIndex
CREATE INDEX `ai_content_items_topicApprovedByAdminId_idx` ON `ai_content_items`(`topicApprovedByAdminId`);

-- CreateIndex
CREATE INDEX `ai_content_items_followUpOfPostId_idx` ON `ai_content_items`(`followUpOfPostId`);

-- CreateIndex
CREATE INDEX `ai_operations_packetId_idx` ON `ai_operations`(`packetId`);

-- AddForeignKey
ALTER TABLE `ai_content_items` ADD CONSTRAINT `ai_content_items_topicApprovedByAdminId_fkey` FOREIGN KEY (`topicApprovedByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_content_items` ADD CONSTRAINT `ai_content_items_followUpOfPostId_fkey` FOREIGN KEY (`followUpOfPostId`) REFERENCES `posts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_operations` ADD CONSTRAINT `ai_operations_packetId_fkey` FOREIGN KEY (`packetId`) REFERENCES `ai_research_packets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_research_sources` ADD CONSTRAINT `ai_research_sources_createdByAdminId_fkey` FOREIGN KEY (`createdByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_research_packets` ADD CONSTRAINT `ai_research_packets_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `ai_content_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_source_evidence` ADD CONSTRAINT `ai_source_evidence_packetId_fkey` FOREIGN KEY (`packetId`) REFERENCES `ai_research_packets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_fact_claims` ADD CONSTRAINT `ai_fact_claims_packetId_fkey` FOREIGN KEY (`packetId`) REFERENCES `ai_research_packets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_fact_claims` ADD CONSTRAINT `ai_fact_claims_resolvedByAdminId_fkey` FOREIGN KEY (`resolvedByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_fact_claims` ADD CONSTRAINT `ai_fact_claims_createdByAdminId_fkey` FOREIGN KEY (`createdByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_claim_sources` ADD CONSTRAINT `ai_claim_sources_claimId_fkey` FOREIGN KEY (`claimId`) REFERENCES `ai_fact_claims`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_claim_sources` ADD CONSTRAINT `ai_claim_sources_evidenceId_fkey` FOREIGN KEY (`evidenceId`) REFERENCES `ai_source_evidence`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

