-- One settings table (SRS 1.2 SET 001), replacing the per-group tables added
-- earlier today by `20260907135714_settings_owned_groups`.
--
-- Rationale: SET 001 separates configuration by *ownership* — which module may
-- read and write a group, which permissions it needs, how it validates and what
-- its change invalidates. That separation is expressed in code, in
-- `apps/api/src/settings/registry.ts` and in the owning service. Four tables
-- with identical columns added migrations and joins without adding a single
-- guarantee the registry does not already enforce, so they are replaced by one
-- table keyed by (group, key). It is still not an untyped dumping ground: a
-- group and key the registry does not declare cannot be read or written through
-- the API, every value is validated against its declaration, every change is
-- version-checked and audited, and no secret is ever stored here (SET 004).
--
-- Data: the two existing `site_settings` rows (`home`, `general`) are copied
-- into the new table under the `website` group with their versions, actors and
-- timestamps intact, and are read from there afterwards. The three tables added
-- this morning are empty — they were created a few hours ago and no group has
-- declared a setting yet — so dropping them loses nothing.

-- CreateTable
CREATE TABLE `settings` (
    `group` VARCHAR(32) NOT NULL,
    `key` VARCHAR(64) NOT NULL,
    `data` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `updatedByAdminId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`group`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `settings` ADD CONSTRAINT `settings_updatedByAdminId_fkey` FOREIGN KEY (`updatedByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Carry the website group's existing documents across before anything is dropped.
INSERT INTO `settings` (`group`, `key`, `data`, `version`, `updatedByAdminId`, `createdAt`, `updatedAt`)
SELECT 'website', `key`, `data`, `version`, `updatedByAdminId`, `createdAt`, `updatedAt` FROM `site_settings`;

-- reviewed: empty tables created earlier today by 20260907135714_settings_owned_groups; no group declared a setting, so no row exists to lose.
DROP TABLE `security_settings`;
-- reviewed: as above.
DROP TABLE `email_settings`;
-- reviewed: as above.
DROP TABLE `operations_settings`;
-- reviewed: rows copied into `settings` under the `website` group by the INSERT ... SELECT above, with versions, actors and timestamps preserved.
DROP TABLE `site_settings`;
