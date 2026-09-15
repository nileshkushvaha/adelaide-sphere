-- AlterTable
ALTER TABLE `static_pages` ADD COLUMN `layout` ENUM('rightSidebar', 'leftSidebar', 'fullWidth') NOT NULL DEFAULT 'rightSidebar';
