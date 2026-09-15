-- The year a business began trading, as it states it (nullable: most
-- existing listings do not record one). Additive, so every existing row is
-- unchanged and nothing that reads the table needs to know.
ALTER TABLE `businesses` ADD COLUMN `establishedYear` SMALLINT NULL;
