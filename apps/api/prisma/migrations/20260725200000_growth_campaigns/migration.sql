-- Growth domain: campaigns / redeem codes / coupons (+ order discount snapshots)

-- AlterTable orders (coupon pricing snapshot)
ALTER TABLE `orders`
  ADD COLUMN `list_price_cents` INTEGER NULL,
  ADD COLUMN `discount_cents` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `coupon_id` VARCHAR(191) NULL,
  ADD COLUMN `coupon_code` VARCHAR(191) NULL;

CREATE INDEX `orders_coupon_id_idx` ON `orders`(`coupon_id`);

-- CreateTable campaigns
CREATE TABLE `campaigns` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('daily_claim', 'lottery') NOT NULL,
    `status` ENUM('draft', 'active', 'paused', 'ended') NOT NULL DEFAULT 'draft',
    `start_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Shanghai',
    `rules_json` JSON NOT NULL,
    `ui_json` JSON NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `remark` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `campaigns_project_id_code_key`(`project_id`, `code`),
    INDEX `campaigns_project_id_status_idx`(`project_id`, `status`),
    INDEX `campaigns_status_start_at_end_at_idx`(`status`, `start_at`, `end_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable campaign_clients
CREATE TABLE `campaign_clients` (
    `id` VARCHAR(191) NOT NULL,
    `campaign_id` VARCHAR(191) NOT NULL,
    `client` ENUM('ios_appstore', 'ios_alt', 'android_play', 'android_direct', 'h5', 'windows', 'macos') NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `campaign_clients_campaign_id_client_key`(`campaign_id`, `client`),
    INDEX `campaign_clients_client_enabled_idx`(`client`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable campaign_rewards
CREATE TABLE `campaign_rewards` (
    `id` VARCHAR(191) NOT NULL,
    `campaign_id` VARCHAR(191) NOT NULL,
    `kind` ENUM('vpn_duration', 'vpn_traffic') NOT NULL DEFAULT 'vpn_duration',
    `validity_seconds` INTEGER NULL,
    `data_limit_bytes` BIGINT NULL,
    `stack_mode` ENUM('extend_active', 'create_campaign_slot') NOT NULL DEFAULT 'extend_active',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `campaign_rewards_campaign_id_idx`(`campaign_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable campaign_claims
CREATE TABLE `campaign_claims` (
    `id` VARCHAR(191) NOT NULL,
    `campaign_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `client` ENUM('ios_appstore', 'ios_alt', 'android_play', 'android_direct', 'h5', 'windows', 'macos') NOT NULL,
    `period_key` VARCHAR(191) NOT NULL,
    `result` ENUM('claimed', 'won', 'lost') NOT NULL,
    `granted_seconds` INTEGER NULL,
    `slot_id` VARCHAR(191) NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `meta` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `campaign_claims_idempotency_key_key`(`idempotency_key`),
    UNIQUE INDEX `campaign_claims_campaign_id_user_id_period_key_key`(`campaign_id`, `user_id`, `period_key`),
    INDEX `campaign_claims_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `campaign_claims_campaign_id_period_key_result_idx`(`campaign_id`, `period_key`, `result`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable redeem_batches
CREATE TABLE `redeem_batches` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `kind` ENUM('vpn_duration', 'vpn_traffic') NOT NULL DEFAULT 'vpn_duration',
    `validity_seconds` INTEGER NULL,
    `data_limit_bytes` BIGINT NULL,
    `stack_mode` ENUM('extend_active', 'create_campaign_slot') NOT NULL DEFAULT 'extend_active',
    `start_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,
    `max_redemptions_per_user` INTEGER NOT NULL DEFAULT 1,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `remark` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `redeem_batches_project_id_enabled_idx`(`project_id`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable redeem_batch_clients
CREATE TABLE `redeem_batch_clients` (
    `id` VARCHAR(191) NOT NULL,
    `batch_id` VARCHAR(191) NOT NULL,
    `client` ENUM('ios_appstore', 'ios_alt', 'android_play', 'android_direct', 'h5', 'windows', 'macos') NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `redeem_batch_clients_batch_id_client_key`(`batch_id`, `client`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable redeem_codes
CREATE TABLE `redeem_codes` (
    `id` VARCHAR(191) NOT NULL,
    `batch_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `status` ENUM('unused', 'redeemed', 'disabled') NOT NULL DEFAULT 'unused',
    `redeemed_by` VARCHAR(191) NULL,
    `redeemed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `redeem_codes_code_key`(`code`),
    INDEX `redeem_codes_batch_id_status_idx`(`batch_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable redeem_redemptions
CREATE TABLE `redeem_redemptions` (
    `id` VARCHAR(191) NOT NULL,
    `code_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `client` ENUM('ios_appstore', 'ios_alt', 'android_play', 'android_direct', 'h5', 'windows', 'macos') NOT NULL,
    `granted_seconds` INTEGER NULL,
    `slot_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `redeem_redemptions_user_id_idx`(`user_id`),
    INDEX `redeem_redemptions_code_id_idx`(`code_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable coupons
CREATE TABLE `coupons` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `discount_type` ENUM('percent', 'fixed_amount') NOT NULL,
    `discount_value` INTEGER NOT NULL,
    `min_order_cents` INTEGER NOT NULL DEFAULT 0,
    `max_discount_cents` INTEGER NULL,
    `plan_ids_json` JSON NOT NULL,
    `start_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,
    `status` ENUM('draft', 'active', 'paused', 'ended') NOT NULL DEFAULT 'draft',
    `total_limit` INTEGER NULL,
    `per_user_limit` INTEGER NOT NULL DEFAULT 1,
    `remark` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `coupons_project_id_code_key`(`project_id`, `code`),
    INDEX `coupons_project_id_status_idx`(`project_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable coupon_clients
CREATE TABLE `coupon_clients` (
    `id` VARCHAR(191) NOT NULL,
    `coupon_id` VARCHAR(191) NOT NULL,
    `client` ENUM('ios_appstore', 'ios_alt', 'android_play', 'android_direct', 'h5', 'windows', 'macos') NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `coupon_clients_coupon_id_client_key`(`coupon_id`, `client`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable coupon_redemptions
CREATE TABLE `coupon_redemptions` (
    `id` VARCHAR(191) NOT NULL,
    `coupon_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `coupon_redemptions_coupon_id_idx`(`coupon_id`),
    INDEX `coupon_redemptions_user_id_idx`(`user_id`),
    INDEX `coupon_redemptions_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- FKs
ALTER TABLE `campaigns`
  ADD CONSTRAINT `campaigns_project_id_fkey`
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `campaign_clients`
  ADD CONSTRAINT `campaign_clients_campaign_id_fkey`
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `campaign_rewards`
  ADD CONSTRAINT `campaign_rewards_campaign_id_fkey`
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `campaign_claims`
  ADD CONSTRAINT `campaign_claims_campaign_id_fkey`
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `campaign_claims`
  ADD CONSTRAINT `campaign_claims_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `redeem_batches`
  ADD CONSTRAINT `redeem_batches_project_id_fkey`
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `redeem_batch_clients`
  ADD CONSTRAINT `redeem_batch_clients_batch_id_fkey`
  FOREIGN KEY (`batch_id`) REFERENCES `redeem_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `redeem_codes`
  ADD CONSTRAINT `redeem_codes_batch_id_fkey`
  FOREIGN KEY (`batch_id`) REFERENCES `redeem_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `redeem_redemptions`
  ADD CONSTRAINT `redeem_redemptions_code_id_fkey`
  FOREIGN KEY (`code_id`) REFERENCES `redeem_codes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `redeem_redemptions`
  ADD CONSTRAINT `redeem_redemptions_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `coupons`
  ADD CONSTRAINT `coupons_project_id_fkey`
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `coupon_clients`
  ADD CONSTRAINT `coupon_clients_coupon_id_fkey`
  FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `coupon_redemptions`
  ADD CONSTRAINT `coupon_redemptions_coupon_id_fkey`
  FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `coupon_redemptions`
  ADD CONSTRAINT `coupon_redemptions_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `orders`
  ADD CONSTRAINT `orders_coupon_id_fkey`
  FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
