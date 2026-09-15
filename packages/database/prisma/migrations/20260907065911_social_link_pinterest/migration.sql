-- Adds `pinterest` to the two link vocabularies (SRS BUS 003, BLOG 001/004).
-- Additive only: every existing value is kept in the same order, so no stored
-- link changes and no row is rewritten to a different kind.
-- AlterTable
ALTER TABLE `author_links` MODIFY `kind` ENUM('website', 'facebook', 'instagram', 'x', 'linkedin', 'youtube', 'tiktok', 'pinterest', 'threads', 'mastodon', 'github', 'other') NOT NULL;

-- AlterTable
ALTER TABLE `business_links` MODIFY `kind` ENUM('facebook', 'instagram', 'x', 'linkedin', 'youtube', 'tiktok', 'pinterest', 'other') NOT NULL;
