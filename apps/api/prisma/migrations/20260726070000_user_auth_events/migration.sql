-- CreateTable
CREATE TABLE `user_auth_events` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `event_type` ENUM('anonymous_bootstrap', 'register', 'register_bind', 'login', 'login_failed') NOT NULL,
    `success` BOOLEAN NOT NULL DEFAULT true,
    `failure_reason` VARCHAR(191) NULL,
    `ip` VARCHAR(191) NULL,
    `user_agent` TEXT NULL,
    `timezone` VARCHAR(191) NULL,
    `locale` VARCHAR(191) NULL,
    `client` ENUM('ios_appstore', 'ios_alt', 'android_play', 'android_direct', 'h5', 'windows', 'macos') NULL,
    `app_version` VARCHAR(191) NULL,
    `os_name` VARCHAR(191) NULL,
    `os_version` VARCHAR(191) NULL,
    `device_id_hash` VARCHAR(191) NULL,
    `meta` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_auth_events_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `user_auth_events_ip_created_at_idx`(`ip`, `created_at`),
    INDEX `user_auth_events_event_type_created_at_idx`(`event_type`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_auth_events` ADD CONSTRAINT `user_auth_events_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
