-- Naming policy: snake_case plural table names (data-preserving rename; the
-- Prisma-generated drop/create was replaced by hand and reviewed).
-- Foreign keys are dropped first, tables and indexes renamed to the names
-- Prisma expects for the new table names, then foreign keys re-added.

-- Drop foreign keys (names from the original migration)
ALTER TABLE `role_permission` DROP FOREIGN KEY `role_permission_roleId_fkey`;
ALTER TABLE `role_permission` DROP FOREIGN KEY `role_permission_permissionId_fkey`;
ALTER TABLE `admin_role` DROP FOREIGN KEY `admin_role_adminId_fkey`;
ALTER TABLE `admin_role` DROP FOREIGN KEY `admin_role_roleId_fkey`;
ALTER TABLE `admin_session` DROP FOREIGN KEY `admin_session_adminId_fkey`;
ALTER TABLE `password_reset_token` DROP FOREIGN KEY `password_reset_token_adminId_fkey`;
ALTER TABLE `audit_log` DROP FOREIGN KEY `audit_log_actorAdminId_fkey`;

-- Rename tables
RENAME TABLE `system_probe` TO `system_probes`,
             `admin_user` TO `admin_users`,
             `role` TO `roles`,
             `permission` TO `permissions`,
             `role_permission` TO `role_permissions`,
             `admin_role` TO `admin_roles`,
             `admin_session` TO `admin_sessions`,
             `password_reset_token` TO `password_reset_tokens`,
             `audit_log` TO `audit_logs`;

-- Rename indexes to Prisma's expected names
ALTER TABLE `system_probes` RENAME INDEX `system_probe_key_key` TO `system_probes_key_key`;
ALTER TABLE `admin_users` RENAME INDEX `admin_user_email_key` TO `admin_users_email_key`;
ALTER TABLE `admin_users` RENAME INDEX `admin_user_status_idx` TO `admin_users_status_idx`;
ALTER TABLE `roles` RENAME INDEX `role_key_key` TO `roles_key_key`;
ALTER TABLE `permissions` RENAME INDEX `permission_key_key` TO `permissions_key_key`;
ALTER TABLE `role_permissions` RENAME INDEX `role_permission_permissionId_idx` TO `role_permissions_permissionId_idx`;
ALTER TABLE `admin_roles` RENAME INDEX `admin_role_roleId_idx` TO `admin_roles_roleId_idx`;
ALTER TABLE `admin_sessions` RENAME INDEX `admin_session_tokenHash_key` TO `admin_sessions_tokenHash_key`;
ALTER TABLE `admin_sessions` RENAME INDEX `admin_session_adminId_revokedAt_idx` TO `admin_sessions_adminId_revokedAt_idx`;
ALTER TABLE `admin_sessions` RENAME INDEX `admin_session_expiresAt_idx` TO `admin_sessions_expiresAt_idx`;
ALTER TABLE `password_reset_tokens` RENAME INDEX `password_reset_token_tokenHash_key` TO `password_reset_tokens_tokenHash_key`;
ALTER TABLE `password_reset_tokens` RENAME INDEX `password_reset_token_adminId_idx` TO `password_reset_tokens_adminId_idx`;
ALTER TABLE `password_reset_tokens` RENAME INDEX `password_reset_token_expiresAt_idx` TO `password_reset_tokens_expiresAt_idx`;
ALTER TABLE `audit_logs` RENAME INDEX `audit_log_actorAdminId_createdAt_idx` TO `audit_logs_actorAdminId_createdAt_idx`;
ALTER TABLE `audit_logs` RENAME INDEX `audit_log_action_createdAt_idx` TO `audit_logs_action_createdAt_idx`;
ALTER TABLE `audit_logs` RENAME INDEX `audit_log_targetType_targetId_idx` TO `audit_logs_targetType_targetId_idx`;
ALTER TABLE `audit_logs` RENAME INDEX `audit_log_createdAt_idx` TO `audit_logs_createdAt_idx`;

-- Re-add foreign keys with the expected names
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `permissions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `admin_roles` ADD CONSTRAINT `admin_roles_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `admin_roles` ADD CONSTRAINT `admin_roles_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `admin_sessions` ADD CONSTRAINT `admin_sessions_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actorAdminId_fkey` FOREIGN KEY (`actorAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
