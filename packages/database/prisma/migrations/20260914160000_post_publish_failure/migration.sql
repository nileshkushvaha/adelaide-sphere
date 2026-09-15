-- Scheduled publication re-checks the publication requirements (SRS BLOG 002).
--
-- Additive only: one nullable column. When a scheduled article no longer meets
-- the requirements at its time (an author deactivated, a category retired), the
-- worker returns it to draft instead of publishing it, and records why here so
-- the editor and the dashboard can say so. Cleared by the next state change.
-- AlterTable
ALTER TABLE `posts` ADD COLUMN `publishFailure` VARCHAR(500) NULL;

