-- Navigation menus (SRS 1.9 MENU 001-006).
--
-- Additive only: three new tables and the four fixed location rows.
--
-- `menu_locations` has the location as its primary key, so "one menu per
-- location" is a database fact rather than a service convention, and its
-- menu reference is RESTRICT: a menu that is shown somewhere cannot be deleted
-- out from under the site.
--
-- `menu_items` points at linked content through typed nullable foreign keys
-- rather than a generic id/type pair, so referential integrity is real. Each
-- is SET NULL: deleting a page leaves the item in the menu with its reference
-- cleared, which the admin shows as "Missing" and the public read hides. The
-- parent reference cascades, because InnoDB checks a restrictive
-- self-reference row by row and a whole-tree replace would trip over it.
CREATE TABLE `menus` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdByAdminId` VARCHAR(191) NULL,
    `updatedByAdminId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `menus_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `menu_locations` (
    `location` ENUM('primary', 'secondary', 'footer', 'footer_bottom') NOT NULL,
    `menuId` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `updatedByAdminId` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `menu_locations_menuId_idx`(`menuId`),
    PRIMARY KEY (`location`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `menu_items` (
    `id` VARCHAR(191) NOT NULL,
    `menuId` VARCHAR(191) NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `type` ENUM('custom', 'heading', 'route', 'page', 'post', 'blog_category', 'blog_tag', 'business_category', 'area', 'business') NOT NULL,
    `pageId` VARCHAR(191) NULL,
    `postId` VARCHAR(191) NULL,
    `blogCategoryId` VARCHAR(191) NULL,
    `blogTagId` VARCHAR(191) NULL,
    `categoryId` VARCHAR(191) NULL,
    `localAreaId` VARCHAR(191) NULL,
    `businessId` VARCHAR(191) NULL,
    `routeKey` VARCHAR(32) NULL,
    `url` VARCHAR(300) NULL,
    `label` VARCHAR(80) NULL,
    `titleAttribute` VARCHAR(100) NULL,
    `description` VARCHAR(120) NULL,
    `icon` VARCHAR(40) NULL,
    `style` ENUM('link', 'button') NOT NULL DEFAULT 'link',
    `openInNewTab` BOOLEAN NOT NULL DEFAULT false,
    `relNofollow` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `menu_items_menuId_parentId_position_idx`(`menuId`, `parentId`, `position`),
    INDEX `menu_items_parentId_idx`(`parentId`),
    INDEX `menu_items_pageId_idx`(`pageId`),
    INDEX `menu_items_postId_idx`(`postId`),
    INDEX `menu_items_blogCategoryId_idx`(`blogCategoryId`),
    INDEX `menu_items_blogTagId_idx`(`blogTagId`),
    INDEX `menu_items_categoryId_idx`(`categoryId`),
    INDEX `menu_items_localAreaId_idx`(`localAreaId`),
    INDEX `menu_items_businessId_idx`(`businessId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `menus` ADD CONSTRAINT `menus_createdByAdminId_fkey` FOREIGN KEY (`createdByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `menus` ADD CONSTRAINT `menus_updatedByAdminId_fkey` FOREIGN KEY (`updatedByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `menu_locations` ADD CONSTRAINT `menu_locations_menuId_fkey` FOREIGN KEY (`menuId`) REFERENCES `menus`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `menu_locations` ADD CONSTRAINT `menu_locations_updatedByAdminId_fkey` FOREIGN KEY (`updatedByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `menu_items` ADD CONSTRAINT `menu_items_menuId_fkey` FOREIGN KEY (`menuId`) REFERENCES `menus`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `menu_items` ADD CONSTRAINT `menu_items_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `menu_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `menu_items` ADD CONSTRAINT `menu_items_pageId_fkey` FOREIGN KEY (`pageId`) REFERENCES `static_pages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `menu_items` ADD CONSTRAINT `menu_items_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `posts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `menu_items` ADD CONSTRAINT `menu_items_blogCategoryId_fkey` FOREIGN KEY (`blogCategoryId`) REFERENCES `blog_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `menu_items` ADD CONSTRAINT `menu_items_blogTagId_fkey` FOREIGN KEY (`blogTagId`) REFERENCES `blog_tags`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `menu_items` ADD CONSTRAINT `menu_items_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `menu_items` ADD CONSTRAINT `menu_items_localAreaId_fkey` FOREIGN KEY (`localAreaId`) REFERENCES `local_areas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `menu_items` ADD CONSTRAINT `menu_items_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `businesses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- The locations are structure, not content: every environment has exactly
-- these four, initially unassigned. Default menus are created by the
-- idempotent `menus:seed` command, never by a migration.
INSERT INTO `menu_locations` (`location`, `menuId`, `version`, `updatedAt`) VALUES
    ('primary', NULL, 1, CURRENT_TIMESTAMP(3)),
    ('secondary', NULL, 1, CURRENT_TIMESTAMP(3)),
    ('footer', NULL, 1, CURRENT_TIMESTAMP(3)),
    ('footer_bottom', NULL, 1, CURRENT_TIMESTAMP(3));
