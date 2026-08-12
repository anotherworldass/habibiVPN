-- Add i18n JSON columns (no DEFAULT: older MySQL/MariaDB reject JSON defaults)
ALTER TABLE `app_package_releases`
  ADD COLUMN `title_i18n` JSON NULL,
  ADD COLUMN `changelog_i18n` JSON NULL;

-- Backfill from legacy single-language columns into zh
UPDATE `app_package_releases`
SET
  `title_i18n` = CASE
    WHEN `title` IS NOT NULL AND TRIM(`title`) <> '' THEN JSON_OBJECT('zh', `title`)
    ELSE CAST('{}' AS JSON)
  END,
  `changelog_i18n` = CASE
    WHEN `changelog` IS NOT NULL AND TRIM(`changelog`) <> '' THEN JSON_OBJECT('zh', `changelog`)
    ELSE CAST('{}' AS JSON)
  END;

ALTER TABLE `app_package_releases`
  MODIFY `title_i18n` JSON NOT NULL,
  MODIFY `changelog_i18n` JSON NOT NULL;

-- Drop legacy columns
ALTER TABLE `app_package_releases`
  DROP COLUMN `title`,
  DROP COLUMN `changelog`;
