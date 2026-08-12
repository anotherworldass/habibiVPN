-- Per-project system settings (Amazon SES mail, etc.)
CREATE TABLE `system_settings` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(64) NOT NULL,
    `value` JSON NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `remark` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `system_settings_project_id_key_key`(`project_id`, `key`),
    INDEX `system_settings_key_idx`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `system_settings`
  ADD CONSTRAINT `system_settings_project_id_fkey`
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
