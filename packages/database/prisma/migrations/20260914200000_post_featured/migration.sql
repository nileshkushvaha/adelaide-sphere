-- Featured articles (SRS 1.10 BLOG 005).
--
-- Additive only. `posts.featuredAt` records when an editor featured a published
-- article on the home page and the blog index; null means not featured. The API
-- allows at most three at once (checked with the featured rows locked) and
-- clears it when the article is unpublished or archived. The index serves the
-- public featured list and that locked check.
-- AlterTable
ALTER TABLE `posts` ADD COLUMN `featuredAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `posts_featuredAt_idx` ON `posts`(`featuredAt`);
