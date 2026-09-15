-- AlterTable
ALTER TABLE `admin_users` ADD COLUMN `totpEnabledAt` DATETIME(3) NULL,
    ADD COLUMN `totpPendingSecretEncrypted` VARCHAR(255) NULL,
    ADD COLUMN `totpSecretEncrypted` VARCHAR(255) NULL,
    MODIFY `status` ENUM('invited', 'active', 'disabled') NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE `password_reset_tokens` ADD COLUMN `purpose` ENUM('reset', 'setup') NOT NULL DEFAULT 'reset';

-- CreateTable
CREATE TABLE `admin_recovery_codes` (
    `id` VARCHAR(191) NOT NULL,
    `adminId` VARCHAR(191) NOT NULL,
    `codeHash` CHAR(64) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `admin_recovery_codes_adminId_codeHash_key`(`adminId`, `codeHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_login_challenges` (
    `id` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `adminId` VARCHAR(191) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `ipAddress` VARCHAR(45) NULL,
    `userAgent` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `admin_login_challenges_tokenHash_key`(`tokenHash`),
    INDEX `admin_login_challenges_adminId_idx`(`adminId`),
    INDEX `admin_login_challenges_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `admin_recovery_codes` ADD CONSTRAINT `admin_recovery_codes_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_login_challenges` ADD CONSTRAINT `admin_login_challenges_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
