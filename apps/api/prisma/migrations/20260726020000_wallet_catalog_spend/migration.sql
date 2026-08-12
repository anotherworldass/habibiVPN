-- AlterTable
ALTER TABLE `referral_configs` ADD COLUMN `catalog_spend_enabled` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `promo_wallets` ADD COLUMN `spent_cents` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `wallet_catalog_items` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `kind` ENUM('phone_credit', 'gift_card') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `face_value_cents` INTEGER NOT NULL,
    `price_cents` INTEGER NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `remark` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `wallet_catalog_items_project_id_enabled_sort_idx`(`project_id`, `enabled`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallet_spend_requests` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `catalog_item_id` VARCHAR(191) NOT NULL,
    `item_name` VARCHAR(191) NOT NULL,
    `kind` ENUM('phone_credit', 'gift_card') NOT NULL,
    `face_value_cents` INTEGER NOT NULL,
    `price_cents` INTEGER NOT NULL,
    `fulfillment_payload` JSON NOT NULL,
    `status` ENUM('pending', 'fulfilled', 'rejected') NOT NULL DEFAULT 'pending',
    `reviewed_by` VARCHAR(191) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `admin_note` TEXT NULL,
    `fulfillment_note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `wallet_spend_requests_user_id_status_idx`(`user_id`, `status`),
    INDEX `wallet_spend_requests_project_id_status_created_at_idx`(`project_id`, `status`, `created_at`),
    INDEX `wallet_spend_requests_catalog_item_id_idx`(`catalog_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `wallet_catalog_items` ADD CONSTRAINT `wallet_catalog_items_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_spend_requests` ADD CONSTRAINT `wallet_spend_requests_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_spend_requests` ADD CONSTRAINT `wallet_spend_requests_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_spend_requests` ADD CONSTRAINT `wallet_spend_requests_catalog_item_id_fkey` FOREIGN KEY (`catalog_item_id`) REFERENCES `wallet_catalog_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
