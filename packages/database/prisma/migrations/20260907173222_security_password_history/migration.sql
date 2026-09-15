-- Password history for administrators (SRS 1.2 SECS 003).
--
-- Additive only: one new table holding Argon2id hashes of passwords an
-- administrator has used before, so a configured history depth can refuse
-- reuse. Nothing here reveals a password: a hash is only ever verified against
-- a candidate, never read back.
--
-- Rows cascade with the administrator, because a deleted account's password
-- history has no one to protect. The index matches the only query there is:
-- "the newest N hashes for this administrator".

-- CreateTable
CREATE TABLE `admin_password_history` (
    `id` VARCHAR(191) NOT NULL,
    `adminId` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `admin_password_history_adminId_createdAt_idx`(`adminId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `admin_password_history` ADD CONSTRAINT `admin_password_history_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
