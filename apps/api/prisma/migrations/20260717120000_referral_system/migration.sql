-- AlterTable users: invite fields (nullable first for backfill)
ALTER TABLE `users` ADD COLUMN `invite_code` VARCHAR(191) NULL,
    ADD COLUMN `invited_by_id` VARCHAR(191) NULL,
    ADD COLUMN `promo_enabled` BOOLEAN NOT NULL DEFAULT true;

-- Backfill unique invite codes for existing users
UPDATE `users`
SET `invite_code` = CONCAT('HV', UPPER(SUBSTRING(MD5(CONCAT(`id`, RAND())), 1, 8)))
WHERE `invite_code` IS NULL;

ALTER TABLE `users` MODIFY `invite_code` VARCHAR(191) NOT NULL;

CREATE UNIQUE INDEX `users_invite_code_key` ON `users`(`invite_code`);
CREATE INDEX `users_invited_by_id_idx` ON `users`(`invited_by_id`);

ALTER TABLE `users` ADD CONSTRAINT `users_invited_by_id_fkey`
  FOREIGN KEY (`invited_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable invite_closures
CREATE TABLE `invite_closures` (
    `id` VARCHAR(191) NOT NULL,
    `ancestor_id` VARCHAR(191) NOT NULL,
    `descendant_id` VARCHAR(191) NOT NULL,
    `depth` INTEGER NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `invite_closures_ancestor_id_descendant_id_key` ON `invite_closures`(`ancestor_id`, `descendant_id`);
CREATE INDEX `invite_closures_descendant_id_depth_idx` ON `invite_closures`(`descendant_id`, `depth`);
CREATE INDEX `invite_closures_ancestor_id_depth_idx` ON `invite_closures`(`ancestor_id`, `depth`);

ALTER TABLE `invite_closures` ADD CONSTRAINT `invite_closures_ancestor_id_fkey`
  FOREIGN KEY (`ancestor_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `invite_closures` ADD CONSTRAINT `invite_closures_descendant_id_fkey`
  FOREIGN KEY (`descendant_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable referral_configs
CREATE TABLE `referral_configs` (
    `id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `max_level` INTEGER NOT NULL DEFAULT 5,
    `settle_days` INTEGER NOT NULL DEFAULT 7,
    `min_withdraw_cents` INTEGER NOT NULL DEFAULT 10000,
    `withdraw_fee_bps` INTEGER NOT NULL DEFAULT 300,
    `max_total_rate_bps` INTEGER NOT NULL DEFAULT 2000,
    `withdraw_methods` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable referral_level_rates
CREATE TABLE `referral_level_rates` (
    `id` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL,
    `rate_bps` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `referral_level_rates_level_key` ON `referral_level_rates`(`level`);

-- CreateTable promo_wallets
CREATE TABLE `promo_wallets` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `available_cents` INTEGER NOT NULL DEFAULT 0,
    `pending_cents` INTEGER NOT NULL DEFAULT 0,
    `withdrawn_cents` INTEGER NOT NULL DEFAULT 0,
    `frozen_cents` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `promo_wallets_user_id_key` ON `promo_wallets`(`user_id`);

ALTER TABLE `promo_wallets` ADD CONSTRAINT `promo_wallets_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable commission_ledgers
CREATE TABLE `commission_ledgers` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `beneficiary_id` VARCHAR(191) NOT NULL,
    `payer_id` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL,
    `order_amount_cents` INTEGER NOT NULL,
    `rate_bps` INTEGER NOT NULL,
    `amount_cents` INTEGER NOT NULL,
    `status` ENUM('pending', 'settled', 'invalid') NOT NULL DEFAULT 'pending',
    `settle_at` DATETIME(3) NOT NULL,
    `settled_at` DATETIME(3) NULL,
    `invalid_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `commission_ledgers_order_id_beneficiary_id_level_key` ON `commission_ledgers`(`order_id`, `beneficiary_id`, `level`);
CREATE INDEX `commission_ledgers_beneficiary_id_status_idx` ON `commission_ledgers`(`beneficiary_id`, `status`);
CREATE INDEX `commission_ledgers_status_settle_at_idx` ON `commission_ledgers`(`status`, `settle_at`);
CREATE INDEX `commission_ledgers_payer_id_idx` ON `commission_ledgers`(`payer_id`);

ALTER TABLE `commission_ledgers` ADD CONSTRAINT `commission_ledgers_order_id_fkey`
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `commission_ledgers` ADD CONSTRAINT `commission_ledgers_beneficiary_id_fkey`
  FOREIGN KEY (`beneficiary_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `commission_ledgers` ADD CONSTRAINT `commission_ledgers_payer_id_fkey`
  FOREIGN KEY (`payer_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable withdraw_requests
CREATE TABLE `withdraw_requests` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `amount_cents` INTEGER NOT NULL,
    `fee_cents` INTEGER NOT NULL,
    `net_cents` INTEGER NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `account_payload` JSON NOT NULL,
    `status` ENUM('pending', 'approved', 'paid', 'rejected') NOT NULL DEFAULT 'pending',
    `reviewed_by` VARCHAR(191) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `admin_note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `withdraw_requests_user_id_status_idx` ON `withdraw_requests`(`user_id`, `status`);
CREATE INDEX `withdraw_requests_status_created_at_idx` ON `withdraw_requests`(`status`, `created_at`);

ALTER TABLE `withdraw_requests` ADD CONSTRAINT `withdraw_requests_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
