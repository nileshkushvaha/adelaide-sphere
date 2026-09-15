-- Collation policy (Phase 8, SRS DAT 001 / DIR 004): every Melbourne Sphere
-- database and table uses utf8mb4 with utf8mb4_unicode_ci (Prisma Migrate's
-- MySQL default), matching the Compose server default. This aligns the
-- development database, which was created before the policy, so that raw
-- temporary tables and future CREATE TABLE statements without an explicit
-- collation inherit the same collation as Prisma-managed tables.
ALTER DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- system_probe was already created with utf8mb4_unicode_ci; no table change needed.
