-- CreateTable projects
CREATE TABLE `projects` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `remark` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `projects_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `projects` (`id`, `code`, `name`, `enabled`, `remark`, `created_at`, `updated_at`)
VALUES ('habibi', 'habibi', 'HabibiVPN', true, '默认项目（存量数据迁移）', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

CREATE TABLE `project_sites` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `host` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `remark` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `project_sites_host_key`(`host`),
    INDEX `project_sites_project_id_enabled_idx`(`project_id`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `app_packages` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `package_name` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(191) NOT NULL,
    `client` ENUM('ios_appstore', 'ios_alt', 'android_play', 'android_direct', 'h5') NOT NULL,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `remark` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `app_packages_package_name_key`(`package_name`),
    INDEX `app_packages_project_id_enabled_idx`(`project_id`, `enabled`),
    INDEX `app_packages_client_idx`(`client`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `project_sites`
  ADD CONSTRAINT `project_sites_project_id_fkey`
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `app_packages`
  ADD CONSTRAINT `app_packages_project_id_fkey`
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default H5 site (localhost for local web) + placeholder packages (optional ops fill)
INSERT INTO `project_sites` (`id`, `project_id`, `name`, `host`, `enabled`, `remark`, `created_at`, `updated_at`)
VALUES
  ('site_habibi_localhost', 'habibi', '本地 H5', 'localhost', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('site_habibi_127', 'habibi', '本地 H5 127', '127.0.0.1', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

-- Users: project + source
ALTER TABLE `users`
  ADD COLUMN `project_id` VARCHAR(191) NOT NULL DEFAULT 'habibi',
  ADD COLUMN `source_site_id` VARCHAR(191) NULL,
  ADD COLUMN `source_package_id` VARCHAR(191) NULL,
  ADD COLUMN `source_client` ENUM('ios_appstore', 'ios_alt', 'android_play', 'android_direct', 'h5') NULL;

CREATE INDEX `users_project_id_idx` ON `users`(`project_id`);
CREATE INDEX `users_source_site_id_idx` ON `users`(`source_site_id`);
CREATE INDEX `users_source_package_id_idx` ON `users`(`source_package_id`);

ALTER TABLE `users`
  ADD CONSTRAINT `users_project_id_fkey`
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `users`
  ADD CONSTRAINT `users_source_site_id_fkey`
  FOREIGN KEY (`source_site_id`) REFERENCES `project_sites`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `users`
  ADD CONSTRAINT `users_source_package_id_fkey`
  FOREIGN KEY (`source_package_id`) REFERENCES `app_packages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Plans scoped to project
ALTER TABLE `plans` ADD COLUMN `project_id` VARCHAR(191) NOT NULL DEFAULT 'habibi';

DROP INDEX `plans_code_key` ON `plans`;

CREATE UNIQUE INDEX `plans_project_id_code_key` ON `plans`(`project_id`, `code`);
CREATE INDEX `plans_project_id_enabled_idx` ON `plans`(`project_id`, `enabled`);

ALTER TABLE `plans`
  ADD CONSTRAINT `plans_project_id_fkey`
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
