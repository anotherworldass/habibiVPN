-- CreateTable
CREATE TABLE `announcements` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NULL,
    `type` ENUM('modal', 'banner', 'top_bar') NOT NULL DEFAULT 'banner',
    `status` ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
    `title_i18n` JSON NOT NULL,
    `body_i18n` JSON NOT NULL,
    `action_url` TEXT NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `start_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,
    `dismissible` BOOLEAN NOT NULL DEFAULT true,
    `remark` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `announcements_project_id_status_priority_idx`(`project_id`, `status`, `priority`),
    INDEX `announcements_status_start_at_end_at_idx`(`status`, `start_at`, `end_at`),
    UNIQUE INDEX `announcements_project_id_code_key`(`project_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `announcement_clients` (
    `id` VARCHAR(191) NOT NULL,
    `announcement_id` VARCHAR(191) NOT NULL,
    `client` ENUM('ios_appstore', 'ios_alt', 'android_play', 'android_direct', 'h5', 'windows', 'macos') NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,

    INDEX `announcement_clients_client_enabled_idx`(`client`, `enabled`),
    UNIQUE INDEX `announcement_clients_announcement_id_client_key`(`announcement_id`, `client`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `announcement_packages` (
    `id` VARCHAR(191) NOT NULL,
    `announcement_id` VARCHAR(191) NOT NULL,
    `package_id` VARCHAR(191) NOT NULL,

    INDEX `announcement_packages_package_id_idx`(`package_id`),
    UNIQUE INDEX `announcement_packages_announcement_id_package_id_key`(`announcement_id`, `package_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `announcement_sites` (
    `id` VARCHAR(191) NOT NULL,
    `announcement_id` VARCHAR(191) NOT NULL,
    `site_id` VARCHAR(191) NOT NULL,

    INDEX `announcement_sites_site_id_idx`(`site_id`),
    UNIQUE INDEX `announcement_sites_announcement_id_site_id_key`(`announcement_id`, `site_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `announcements` ADD CONSTRAINT `announcements_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `announcement_clients` ADD CONSTRAINT `announcement_clients_announcement_id_fkey` FOREIGN KEY (`announcement_id`) REFERENCES `announcements`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `announcement_packages` ADD CONSTRAINT `announcement_packages_announcement_id_fkey` FOREIGN KEY (`announcement_id`) REFERENCES `announcements`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `announcement_packages` ADD CONSTRAINT `announcement_packages_package_id_fkey` FOREIGN KEY (`package_id`) REFERENCES `app_packages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `announcement_sites` ADD CONSTRAINT `announcement_sites_announcement_id_fkey` FOREIGN KEY (`announcement_id`) REFERENCES `announcements`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `announcement_sites` ADD CONSTRAINT `announcement_sites_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `project_sites`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
