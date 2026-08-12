-- CreateTable
CREATE TABLE `promo_wallet_ledgers` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `entry_type` ENUM('commission_pending', 'commission_settle', 'commission_invalidate_pending', 'commission_clawback', 'withdraw_hold', 'withdraw_reject', 'withdraw_paid', 'spend_hold', 'spend_reject', 'spend_fulfill', 'freeze_set') NOT NULL,
    `available_delta` INTEGER NOT NULL DEFAULT 0,
    `pending_delta` INTEGER NOT NULL DEFAULT 0,
    `withdrawn_delta` INTEGER NOT NULL DEFAULT 0,
    `frozen_delta` INTEGER NOT NULL DEFAULT 0,
    `spent_delta` INTEGER NOT NULL DEFAULT 0,
    `available_after` INTEGER NOT NULL,
    `pending_after` INTEGER NOT NULL,
    `withdrawn_after` INTEGER NOT NULL,
    `frozen_after` INTEGER NOT NULL,
    `spent_after` INTEGER NOT NULL,
    `ref_type` VARCHAR(191) NULL,
    `ref_id` VARCHAR(191) NULL,
    `actor_type` VARCHAR(191) NULL,
    `actor_id` VARCHAR(191) NULL,
    `remark` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `promo_wallet_ledgers_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `promo_wallet_ledgers_ref_type_ref_id_idx`(`ref_type`, `ref_id`),
    INDEX `promo_wallet_ledgers_entry_type_created_at_idx`(`entry_type`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `promo_wallet_ledgers` ADD CONSTRAINT `promo_wallet_ledgers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
