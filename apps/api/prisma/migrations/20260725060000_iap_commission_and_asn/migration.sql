-- AlterTable
ALTER TABLE `referral_configs`
  ADD COLUMN `iap_commission_base_bps` INTEGER NOT NULL DEFAULT 10000;

-- CreateTable
CREATE TABLE `iap_notification_logs` (
    `id` VARCHAR(191) NOT NULL,
    `notification_uuid` VARCHAR(191) NOT NULL,
    `notification_type` VARCHAR(191) NOT NULL,
    `subtype` VARCHAR(191) NULL,
    `transaction_id` VARCHAR(191) NULL,
    `payload` JSON NOT NULL,
    `processed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `iap_notification_logs_notification_uuid_key`(`notification_uuid`),
    INDEX `iap_notification_logs_transaction_id_idx`(`transaction_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
