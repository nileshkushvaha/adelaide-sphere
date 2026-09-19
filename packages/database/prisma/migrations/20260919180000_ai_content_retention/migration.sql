-- AI Content Phase 1G: retention marker for finished items (owner decision: 180 days).
-- Additive only: one nullable column.
-- AlterTable
ALTER TABLE `ai_content_items` ADD COLUMN `privateDataPurgedAt` DATETIME(3) NULL;

