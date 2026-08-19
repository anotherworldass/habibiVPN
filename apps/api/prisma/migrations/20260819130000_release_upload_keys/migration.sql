CREATE TABLE `release_upload_keys` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `key_hash` VARCHAR(64) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `revoked_at` DATETIME(3) NULL,
    `last_used_at` DATETIME(3) NULL,
    `created_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `release_upload_keys_key_hash_key`(`key_hash`),
    INDEX `release_upload_keys_project_id_enabled_idx`(`project_id`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `release_upload_keys`
    ADD CONSTRAINT `release_upload_keys_project_id_fkey`
    FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
