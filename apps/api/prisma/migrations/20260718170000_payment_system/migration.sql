-- Extend order lifecycle while remote provisioning is in progress.
ALTER TABLE `orders`
    MODIFY `status` ENUM('pending', 'paid', 'provisioning', 'provisioned', 'failed', 'refunded', 'cancelled') NOT NULL DEFAULT 'pending',
    ADD COLUMN `payment_channel_id` VARCHAR(191) NULL,
    ADD COLUMN `payment_url` TEXT NULL,
    ADD COLUMN `failure_reason` TEXT NULL;

CREATE TABLE `payment_providers` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `adapter` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `config` JSON NOT NULL,
    `credentials_encrypted` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payment_providers_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `payment_channels` (
    `id` VARCHAR(191) NOT NULL,
    `provider_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'CNY',
    `min_cents` INTEGER NOT NULL,
    `max_cents` INTEGER NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payment_channels_provider_id_code_key`(`provider_id`, `code`),
    INDEX `payment_channels_enabled_sort_order_idx`(`enabled`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `orders_payment_channel_id_idx` ON `orders`(`payment_channel_id`);
CREATE UNIQUE INDEX `orders_provider_provider_ref_key` ON `orders`(`provider`, `provider_ref`);

ALTER TABLE `payment_channels`
    ADD CONSTRAINT `payment_channels_provider_id_fkey`
    FOREIGN KEY (`provider_id`) REFERENCES `payment_providers`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `orders`
    ADD CONSTRAINT `orders_payment_channel_id_fkey`
    FOREIGN KEY (`payment_channel_id`) REFERENCES `payment_channels`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Install the supplied provider and rails disabled. An administrator must set
-- the secret and explicitly enable them before they are visible to customers.
INSERT INTO `payment_providers`
    (`id`, `code`, `name`, `adapter`, `enabled`, `config`, `created_at`, `updated_at`)
VALUES
    ('pay_aixi', 'aixi', '艾希', 'aixi_newbank', false,
     JSON_OBJECT(
       'appId', '2785157686',
       'createOrderUrl', 'http://150.5.128.214/apid/newbankPay/crtOrder.do',
       'queryOrderUrl', 'http://150.5.128.214/apid/newbankPay/selOrder.do',
       'balanceUrl', 'http://150.5.128.214/apid/newbankPay/selUser.do',
       'callbackIp', '150.5.133.8'
     ),
     CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

INSERT INTO `payment_channels`
    (`id`, `provider_id`, `code`, `name`, `method`, `currency`, `min_cents`, `max_cents`, `enabled`, `sort_order`, `created_at`, `updated_at`)
VALUES
    ('paych_aixi_wechat_6608', 'pay_aixi', '6608', '微信扫码', 'wechat_qr', 'CNY', 300, 80000, false, 10, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('paych_aixi_alipay_6607', 'pay_aixi', '6607', '支付宝原生', 'alipay_native', 'CNY', 1000, 50000, false, 20, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
