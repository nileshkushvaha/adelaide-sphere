-- Paid guest posts (SRS 1.12, BLOG 001/004 as amended).
--
-- Additive only. `posts.guestPost` marks an article the author paid to publish:
-- the public site labels it "Guest post", shows a disclosure above the text and
-- marks its outbound links as sponsored. Existing articles default to false.
-- AlterTable
ALTER TABLE `posts` ADD COLUMN `guestPost` BOOLEAN NOT NULL DEFAULT false;
