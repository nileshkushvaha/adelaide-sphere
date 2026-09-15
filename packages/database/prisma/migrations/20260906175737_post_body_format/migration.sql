-- Phase 22: articles can be authored in the rich-text editor, which stores HTML.
-- Existing rows keep bodyFormat='markdown' via the column default, so their
-- stored source is still rendered through the Markdown pipeline. Both formats
-- pass the same sanitisation allowlist before anything is stored or shown.
-- AlterTable
ALTER TABLE `posts` ADD COLUMN `bodyFormat` ENUM('markdown', 'html') NOT NULL DEFAULT 'markdown';
