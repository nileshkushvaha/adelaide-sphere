-- AI Content Phase 1D: additive generation provenance, billable operation cost and outcome state,
-- versioned price schedules, budget buckets, research-bound approvals, topic category and the
-- paid-call halt. Enums only gain values; no existing row is rewritten.


-- AlterTable
ALTER TABLE `ai_approvals` ADD COLUMN `researchPacketHash` CHAR(64) NULL,
    ADD COLUMN `researchPacketId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `ai_automation_controls` ADD COLUMN `paidCallsHaltedAt` DATETIME(3) NULL,
    ADD COLUMN `paidHaltReason` VARCHAR(300) NULL;

-- AlterTable
ALTER TABLE `ai_content_items` ADD COLUMN `categoryId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `ai_generation_runs` ADD COLUMN `coverage` JSON NULL,
    ADD COLUMN `disclosureHash` CHAR(64) NULL,
    ADD COLUMN `disclosureText` VARCHAR(500) NULL,
    ADD COLUMN `generationOperationId` VARCHAR(191) NULL,
    ADD COLUMN `imageBriefs` JSON NULL,
    ADD COLUMN `internalLinks` JSON NULL,
    ADD COLUMN `model` VARCHAR(64) NULL,
    ADD COLUMN `promptHash` CHAR(64) NULL,
    ADD COLUMN `promptVersion` VARCHAR(40) NULL,
    ADD COLUMN `provider` VARCHAR(32) NULL,
    ADD COLUMN `researchPacketHash` CHAR(64) NULL,
    ADD COLUMN `researchPacketId` VARCHAR(191) NULL,
    ADD COLUMN `schemaHash` CHAR(64) NULL,
    ADD COLUMN `schemaVersion` VARCHAR(40) NULL,
    ADD COLUMN `scope` VARCHAR(16) NOT NULL DEFAULT 'full';

-- AlterTable
ALTER TABLE `ai_operations` ADD COLUMN `cachedInputTokens` INTEGER NULL,
    ADD COLUMN `costState` ENUM('none', 'reserved', 'settled', 'released', 'uncertain') NOT NULL DEFAULT 'none',
    ADD COLUMN `dayBucketId` VARCHAR(191) NULL,
    ADD COLUMN `errorClass` VARCHAR(64) NULL,
    ADD COLUMN `estimatedMaxMicros` INTEGER NULL,
    ADD COLUMN `inputTokens` INTEGER NULL,
    ADD COLUMN `model` VARCHAR(64) NULL,
    ADD COLUMN `monthBucketId` VARCHAR(191) NULL,
    ADD COLUMN `outputTokens` INTEGER NULL,
    ADD COLUMN `priceScheduleId` VARCHAR(191) NULL,
    ADD COLUMN `provider` VARCHAR(32) NULL,
    ADD COLUMN `providerPhase` VARCHAR(16) NULL,
    ADD COLUMN `providerResponseId` VARCHAR(128) NULL,
    ADD COLUMN `reasoningTokens` INTEGER NULL,
    ADD COLUMN `requestHash` CHAR(64) NULL,
    ADD COLUMN `requestPayload` JSON NULL,
    ADD COLUMN `requestedByAdminId` VARCHAR(191) NULL,
    ADD COLUMN `reservedMicros` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `resolutionNote` VARCHAR(500) NULL,
    ADD COLUMN `scope` VARCHAR(16) NULL,
    ADD COLUMN `sentAt` DATETIME(3) NULL,
    ADD COLUMN `settledMicros` INTEGER NULL,
    MODIFY `kind` ENUM('apply', 'research', 'discovery', 'generate') NOT NULL,
    MODIFY `state` ENUM('pending', 'running', 'succeeded', 'failed', 'cancelled', 'outcome_unknown') NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE `ai_research_packets` ADD COLUMN `contentHash` CHAR(64) NULL;

-- CreateTable
CREATE TABLE `ai_price_schedules` (
    `id` VARCHAR(191) NOT NULL,
    `version` VARCHAR(64) NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `model` VARCHAR(64) NOT NULL,
    `serviceTier` VARCHAR(16) NOT NULL DEFAULT 'default',
    `currency` CHAR(3) NOT NULL,
    `inputMicrosPerMTok` INTEGER NOT NULL,
    `cachedInputMicrosPerMTok` INTEGER NOT NULL,
    `outputMicrosPerMTok` INTEGER NOT NULL,
    `longContextThresholdTokens` INTEGER NOT NULL,
    `sourceUrl` VARCHAR(500) NOT NULL,
    `effectiveFrom` DATETIME(3) NOT NULL,
    `status` ENUM('proposed', 'approved', 'retired') NOT NULL DEFAULT 'proposed',
    `createdByAdminId` VARCHAR(191) NULL,
    `approvedByAdminId` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ai_price_schedules_version_key`(`version`),
    INDEX `ai_price_schedules_provider_model_status_idx`(`provider`, `model`, `status`),
    INDEX `ai_price_schedules_createdByAdminId_idx`(`createdByAdminId`),
    INDEX `ai_price_schedules_approvedByAdminId_idx`(`approvedByAdminId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_budget_buckets` (
    `id` VARCHAR(191) NOT NULL,
    `scope` ENUM('day', 'month') NOT NULL,
    `period` VARCHAR(10) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `reservedMicros` INTEGER NOT NULL DEFAULT 0,
    `settledMicros` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 1,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ai_budget_buckets_scope_period_currency_key`(`scope`, `period`, `currency`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ai_approvals_researchPacketId_idx` ON `ai_approvals`(`researchPacketId`);

-- CreateIndex
CREATE INDEX `ai_content_items_categoryId_idx` ON `ai_content_items`(`categoryId`);

-- CreateIndex
CREATE INDEX `ai_generation_runs_researchPacketId_idx` ON `ai_generation_runs`(`researchPacketId`);

-- CreateIndex
CREATE UNIQUE INDEX `ai_operations_providerResponseId_key` ON `ai_operations`(`providerResponseId`);

-- CreateIndex
CREATE INDEX `ai_operations_priceScheduleId_idx` ON `ai_operations`(`priceScheduleId`);

-- CreateIndex
CREATE INDEX `ai_operations_dayBucketId_idx` ON `ai_operations`(`dayBucketId`);

-- CreateIndex
CREATE INDEX `ai_operations_monthBucketId_idx` ON `ai_operations`(`monthBucketId`);

-- CreateIndex
CREATE INDEX `ai_operations_requestedByAdminId_idx` ON `ai_operations`(`requestedByAdminId`);

-- AddForeignKey
ALTER TABLE `ai_content_items` ADD CONSTRAINT `ai_content_items_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `blog_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_generation_runs` ADD CONSTRAINT `ai_generation_runs_researchPacketId_fkey` FOREIGN KEY (`researchPacketId`) REFERENCES `ai_research_packets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_operations` ADD CONSTRAINT `ai_operations_priceScheduleId_fkey` FOREIGN KEY (`priceScheduleId`) REFERENCES `ai_price_schedules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_operations` ADD CONSTRAINT `ai_operations_dayBucketId_fkey` FOREIGN KEY (`dayBucketId`) REFERENCES `ai_budget_buckets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_operations` ADD CONSTRAINT `ai_operations_monthBucketId_fkey` FOREIGN KEY (`monthBucketId`) REFERENCES `ai_budget_buckets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_operations` ADD CONSTRAINT `ai_operations_requestedByAdminId_fkey` FOREIGN KEY (`requestedByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_approvals` ADD CONSTRAINT `ai_approvals_researchPacketId_fkey` FOREIGN KEY (`researchPacketId`) REFERENCES `ai_research_packets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_price_schedules` ADD CONSTRAINT `ai_price_schedules_createdByAdminId_fkey` FOREIGN KEY (`createdByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_price_schedules` ADD CONSTRAINT `ai_price_schedules_approvedByAdminId_fkey` FOREIGN KEY (`approvedByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- Official standard-tier prices (https://developers.openai.com/api/docs/pricing, 18 Sep 2026), seeded as
-- PROPOSED: no paid call can be priced until an administrator approves a schedule.
INSERT INTO `ai_price_schedules` (`id`, `version`, `provider`, `model`, `serviceTier`, `currency`, `inputMicrosPerMTok`, `cachedInputMicrosPerMTok`, `outputMicrosPerMTok`, `longContextThresholdTokens`, `sourceUrl`, `effectiveFrom`, `status`, `createdAt`) VALUES
  ('seedopenaiterra20260730', 'openai-gpt-5.6-terra-2026-07-30', 'openai', 'gpt-5.6-terra', 'default', 'USD', 2000000, 200000, 12000000, 272000, 'https://developers.openai.com/api/docs/models/gpt-5.6-terra', '2026-07-30 00:00:00.000', 'proposed', CURRENT_TIMESTAMP(3)),
  ('seedopenailuna20260730', 'openai-gpt-5.6-luna-2026-07-30', 'openai', 'gpt-5.6-luna', 'default', 'USD', 200000, 20000, 1200000, 272000, 'https://developers.openai.com/api/docs/models/gpt-5.6-luna', '2026-07-30 00:00:00.000', 'proposed', CURRENT_TIMESTAMP(3));
