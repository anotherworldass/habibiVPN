-- AlterTable (no JSON DEFAULT for older MySQL/MariaDB)
ALTER TABLE `app_packages`
  ADD COLUMN `client_config` JSON NULL;

UPDATE `app_packages`
SET `client_config` = CAST('{}' AS JSON)
WHERE `client_config` IS NULL;

ALTER TABLE `app_packages`
  MODIFY `client_config` JSON NOT NULL;
