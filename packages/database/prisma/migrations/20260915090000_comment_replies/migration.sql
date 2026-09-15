-- Comment replies (SRS 1.10 COM 001).
--
-- Additive. Comments gain `parentId` (the top-level comment a reply belongs to;
-- threads are two levels, so a reply to a reply joins the same top-level
-- comment), `staff` and `authorAdminId` for replies the Melbourne Sphere team
-- writes from moderation. Deleting a comment removes its replies with it.
-- reviewed: the contact and acknowledgement columns become nullable (no data
-- changes) because a team reply has no visitor email or acknowledgement; every
-- visitor comment still requires them in the API.
-- AlterTable
ALTER TABLE `comments` ADD COLUMN `authorAdminId` VARCHAR(191) NULL,
    ADD COLUMN `parentId` VARCHAR(191) NULL,
    ADD COLUMN `staff` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `privateEmailEncrypted` VARCHAR(500) NULL,
    MODIFY `emailHash` CHAR(64) NULL,
    MODIFY `acknowledgedVersion` VARCHAR(32) NULL,
    MODIFY `acknowledgedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `comments_parentId_status_createdAt_idx` ON `comments`(`parentId`, `status`, `createdAt`);

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `comments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_authorAdminId_fkey` FOREIGN KEY (`authorAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
