-- AI Content Phase 1D review fix: explicit human fact confirmation.
-- Enum widening only (existing rows keep `content`); additive and backward compatible.

-- AlterTable
ALTER TABLE `ai_approvals` MODIFY `kind` ENUM('content', 'facts') NOT NULL;
