-- AlterTable
ALTER TABLE `app_packages`
  ADD COLUMN `min_support_version_code` INTEGER NULL,
  ADD COLUMN `store_url` TEXT NULL;

-- CreateTable
CREATE TABLE `app_package_releases` (
    `id` VARCHAR(191) NOT NULL,
    `package_id` VARCHAR(191) NOT NULL,
    `version_name` VARCHAR(191) NOT NULL,
    `version_code` INTEGER NOT NULL,
    `status` ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
    `force_update` BOOLEAN NOT NULL DEFAULT false,
    `title` VARCHAR(191) NULL,
    `changelog` TEXT NULL,
    `download_url` TEXT NULL,
    `store_url` TEXT NULL,
    `file_size` BIGINT NULL,
    `checksum` VARCHAR(191) NULL,
    `published_at` DATETIME(3) NULL,
    `remark` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `app_package_releases_package_id_status_version_code_idx`(`package_id`, `status`, `version_code`),
    UNIQUE INDEX `app_package_releases_package_id_version_code_key`(`package_id`, `version_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `app_package_releases` ADD CONSTRAINT `app_package_releases_package_id_fkey` FOREIGN KEY (`package_id`) REFERENCES `app_packages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
