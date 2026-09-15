-- Blog search (SRS 1.10 BLOG 005).
--
-- Additive only. `posts.searchText` holds the plain text of the sanitised body,
-- written by the API whenever the body is saved; it is used for search and
-- never rendered. A FULLTEXT index over title, summary and that text lets the
-- public blog search rank matches. Existing rows keep null until
-- `pnpm --filter api blog:backfill-search-text` fills them (idempotent), and
-- until then they are still found by title and summary.
-- AlterTable
ALTER TABLE `posts` ADD COLUMN `searchText` MEDIUMTEXT NULL;

-- CreateIndex
CREATE FULLTEXT INDEX `posts_search_idx` ON `posts`(`title`, `excerpt`, `searchText`);
