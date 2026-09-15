-- Redirects gain a temporary (302) kind and an active/inactive state (SRS SEO 004).
--
-- Additive only. Nothing here is destructive and no existing row changes meaning:
--
--  * 'temporary' is APPENDED to the enum, so every stored value keeps its
--    ordinal. Appending a member to an ENUM under 255 members is an instant
--    alter in MySQL 8.4; inserting one in the middle would renumber the column
--    and rewrite the whole table, which is why the Prisma enum declares it last
--    even though it reads out of order.
--  * `isActive` defaults to true, so every rule that exists today keeps
--    resolving exactly as it does now. Adding a column with a literal default is
--    also an instant alter.
--
-- No index is added: `resolve()` reads by the unique `sourcePath`, and the admin
-- list is small enough to scan.
-- AlterTable
ALTER TABLE `redirects` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true,
    MODIFY `kind` ENUM('permanent', 'gone', 'temporary') NOT NULL DEFAULT 'permanent';
