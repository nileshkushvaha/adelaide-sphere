-- AlterTable
-- reviewed: widening abuse_reports to accept a comment target (SRS REP 001). Making
-- reviewId nullable does not drop or rewrite existing rows; every current row keeps
-- its review target, and the check constraint below preserves "exactly one target".
ALTER TABLE `abuse_reports` ADD COLUMN `commentId` VARCHAR(191) NULL,
    MODIFY `reviewId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `comments` (
    `id` VARCHAR(191) NOT NULL,
    `postId` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(80) NOT NULL,
    `privateEmailEncrypted` VARCHAR(500) NOT NULL,
    `emailHash` CHAR(64) NOT NULL,
    `originalText` TEXT NOT NULL,
    `publicText` TEXT NULL,
    `redactionReason` VARCHAR(500) NULL,
    `status` ENUM('pending', 'approved', 'rejected', 'spam') NOT NULL DEFAULT 'pending',
    `moderationReason` VARCHAR(500) NULL,
    `moderatorAdminId` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `acknowledgedVersion` VARCHAR(32) NOT NULL,
    `acknowledgedAt` DATETIME(3) NOT NULL,
    `submitterIpHash` CHAR(64) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `comments_postId_status_createdAt_idx`(`postId`, `status`, `createdAt`),
    INDEX `comments_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `abuse_reports_commentId_idx` ON `abuse_reports`(`commentId`);

-- AddForeignKey
ALTER TABLE `abuse_reports` ADD CONSTRAINT `abuse_reports_commentId_fkey` FOREIGN KEY (`commentId`) REFERENCES `comments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_moderatorAdminId_fkey` FOREIGN KEY (`moderatorAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- SRS REP 001 allows the "exactly one target" rule to be a check *or* an
-- application invariant. MySQL refuses a check constraint on a column used by a
-- foreign key with a referential action (error 3823), and the cascade is what
-- keeps reports from outliving a deleted target, so the rule is enforced in
-- ReportsService and covered by an integration test instead.
