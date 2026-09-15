-- The icon an editor chose for a service, as a key from the shared library in
-- @melbourne-sphere/domain. Null keeps the name-based match. Additive.
ALTER TABLE `services` ADD COLUMN `icon` VARCHAR(40) NULL;
