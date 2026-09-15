-- Administrator access control (SRS 1.1 RBAC 002–012).
--
-- Additive only. No column is dropped, no row is deleted and no existing grant
-- changes: roles and permissions gain state and metadata columns, assignments
-- gain the administrator who made them, administrators gain the authorization
-- version that scopes their permission cache, and direct administrator
-- permissions get their own table.
--
-- `permissions.updatedAt` takes CURRENT_TIMESTAMP(3) as its default so the
-- existing catalogue rows can be stamped in place; `label` and `module` land on
-- their column defaults and are filled with the real values the first time
-- `pnpm --filter api admin:seed-rbac` runs (idempotent, and part of the release
-- procedure after any permission change).
--
-- Deletion behaviour is chosen so authorization history survives: an assignment
-- follows its administrator (CASCADE) but never removes a permission row
-- (RESTRICT), and the assigning administrator becomes NULL rather than deleting
-- the assignment (SET NULL). Collation follows the project policy:
-- utf8mb4 / utf8mb4_unicode_ci.

-- AlterTable
ALTER TABLE `admin_roles` ADD COLUMN `assignedById` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `admin_users` ADD COLUMN `authzVersion` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `audit_logs` ADD COLUMN `userAgent` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `permissions` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `isSystem` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `label` VARCHAR(80) NOT NULL DEFAULT '',
    ADD COLUMN `module` VARCHAR(40) NOT NULL DEFAULT 'General',
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `role_permissions` ADD COLUMN `assignedById` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `roles` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE `admin_permissions` (
    `adminId` VARCHAR(191) NOT NULL,
    `permissionId` VARCHAR(191) NOT NULL,
    `assignedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `admin_permissions_permissionId_idx`(`permissionId`),
    INDEX `admin_permissions_assignedById_idx`(`assignedById`),
    PRIMARY KEY (`adminId`, `permissionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `admin_roles_assignedById_idx` ON `admin_roles`(`assignedById`);

-- CreateIndex
CREATE INDEX `permissions_module_idx` ON `permissions`(`module`);

-- CreateIndex
CREATE INDEX `role_permissions_assignedById_idx` ON `role_permissions`(`assignedById`);

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_roles` ADD CONSTRAINT `admin_roles_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_permissions` ADD CONSTRAINT `admin_permissions_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_permissions` ADD CONSTRAINT `admin_permissions_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `permissions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_permissions` ADD CONSTRAINT `admin_permissions_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
