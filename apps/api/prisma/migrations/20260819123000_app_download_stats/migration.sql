ALTER TABLE `app_packages`
  ADD COLUMN `listed_on_web` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `download_count` INTEGER NOT NULL DEFAULT 0;

-- Preserve the existing primary-package behavior as the initial website selection.
UPDATE `app_packages`
SET `listed_on_web` = true
WHERE `is_primary` = true;

CREATE TABLE `app_download_daily` (
  `id` VARCHAR(191) NOT NULL,
  `package_id` VARCHAR(191) NOT NULL,
  `release_id` VARCHAR(191) NULL,
  `version_key` VARCHAR(191) NOT NULL,
  `version_name` VARCHAR(191) NULL,
  `version_code` INTEGER NULL,
  `day` DATE NOT NULL,
  `count` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `app_download_daily_package_id_version_key_day_key`(`package_id`, `version_key`, `day`),
  INDEX `app_download_daily_release_id_idx`(`release_id`),
  INDEX `app_download_daily_day_idx`(`day`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `app_download_daily`
  ADD CONSTRAINT `app_download_daily_package_id_fkey`
  FOREIGN KEY (`package_id`) REFERENCES `app_packages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `app_download_daily`
  ADD CONSTRAINT `app_download_daily_release_id_fkey`
  FOREIGN KEY (`release_id`) REFERENCES `app_package_releases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
