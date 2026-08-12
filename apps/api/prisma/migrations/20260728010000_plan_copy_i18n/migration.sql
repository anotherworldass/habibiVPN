-- AlterTable (no JSON DEFAULT for older MySQL/MariaDB)
ALTER TABLE `plans`
  ADD COLUMN `name_i18n` JSON NULL,
  ADD COLUMN `description_i18n` JSON NULL;

-- Backfill zh from legacy columns
UPDATE `plans`
SET
  `name_i18n` = JSON_OBJECT('zh', `name`),
  `description_i18n` = CASE
    WHEN `description` IS NOT NULL AND TRIM(`description`) <> '' THEN JSON_OBJECT('zh', `description`)
    ELSE CAST('{}' AS JSON)
  END;

ALTER TABLE `plans`
  MODIFY `name_i18n` JSON NOT NULL,
  MODIFY `description_i18n` JSON NOT NULL;
