-- AI image providers P1: provider-neutral image requests and pricing units (owner-approved, 19 Sep 2026).
-- Additive only: nullable or defaulted columns. Existing prices keep the token unit; existing jobs are unchanged.
-- AlterTable
ALTER TABLE `ai_image_jobs` ADD COLUMN `aspectRatio` VARCHAR(8) NULL,
    ADD COLUMN `latencyMs` INTEGER NULL,
    ADD COLUMN `providerRequestId` VARCHAR(128) NULL,
    ADD COLUMN `reportedCostMicros` INTEGER NULL,
    ADD COLUMN `resolution` VARCHAR(8) NULL,
    ADD COLUMN `servedModel` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `ai_price_schedules` ADD COLUMN `maxTextOutputTokens` INTEGER NULL,
    ADD COLUMN `perImageMicros` INTEGER NULL,
    ADD COLUMN `pricingUnit` VARCHAR(8) NOT NULL DEFAULT 'token',
    ADD COLUMN `textOutputMicrosPerMTok` INTEGER NULL;


-- An image price now names a resolution tier, not a pixel size. The 1E default size (1536x1024) is the
-- 3:2 request at the 1k tier, so its price carries over unchanged; any other legacy size stays unmatched
-- and is refused (PRICE_UNKNOWN) until a price for its tier is proposed and approved.
UPDATE `ai_price_schedules` SET `imageSize` = '1k' WHERE `imageSize` = '1536x1024';
