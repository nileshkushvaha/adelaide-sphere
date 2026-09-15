-- PDF documents in the media library (change log 1.16). Additive: existing
-- assets become `image`, existing menu items keep their type, and no row or
-- column is removed.

-- An asset is an image (published as renditions) or a document (published as
-- one copy with download headers, after a virus scan).
ALTER TABLE `media_assets` ADD COLUMN `kind` ENUM('image', 'document') NOT NULL DEFAULT 'image',
    ADD COLUMN `title` VARCHAR(180) NULL,
    ADD COLUMN `publicObjectKey` VARCHAR(191) NULL,
    ADD COLUMN `pageCount` INTEGER NULL,
    ADD COLUMN `scannedAt` DATETIME(3) NULL,
    ADD COLUMN `scanEngine` VARCHAR(80) NULL;

CREATE UNIQUE INDEX `media_assets_publicObjectKey_key` ON `media_assets`(`publicObjectKey`);
CREATE INDEX `media_assets_kind_status_createdAt_idx` ON `media_assets`(`kind`, `status`, `createdAt`);

-- A menu item may link a document. The enum only gains a value; every stored
-- value stays valid.
ALTER TABLE `menu_items` MODIFY `type` ENUM('custom', 'heading', 'route', 'page', 'post', 'blog_category', 'blog_tag', 'business_category', 'area', 'business', 'document') NOT NULL,
    ADD COLUMN `documentId` VARCHAR(191) NULL;

CREATE INDEX `menu_items_documentId_idx` ON `menu_items`(`documentId`);

-- Set null, as every other menu reference: deleting is refused while a menu
-- links the document (MED 004), so this only guards against a direct delete.
ALTER TABLE `menu_items` ADD CONSTRAINT `menu_items_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `media_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
