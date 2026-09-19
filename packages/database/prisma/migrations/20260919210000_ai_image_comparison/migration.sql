-- AI image provider comparison (provider amendment 01, owner-approved 19 Sep 2026).
-- Additive only: a new slot value and a nullable run id. Existing jobs stay in the featured slot.
-- AlterTable
ALTER TABLE `ai_image_jobs` ADD COLUMN `comparisonRunId` VARCHAR(36) NULL,
    MODIFY `slot` ENUM('featured', 'comparison') NOT NULL DEFAULT 'featured';

-- CreateIndex
CREATE INDEX `ai_image_jobs_comparisonRunId_idx` ON `ai_image_jobs`(`comparisonRunId`);
