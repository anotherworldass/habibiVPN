-- Client / billing / store enums
CREATE TABLE `plan_catalog_offers` (
    `id` VARCHAR(191) NOT NULL,
    `plan_id` VARCHAR(191) NOT NULL,
    `client` ENUM('ios_appstore', 'ios_alt', 'android_play', 'android_direct', 'h5') NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `payment_mode` ENUM('inherit', 'iap_only', 'web_only', 'iap_or_web') NOT NULL DEFAULT 'inherit',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `plan_catalog_offers_plan_id_client_key`(`plan_id`, `client`),
    INDEX `plan_catalog_offers_client_enabled_idx`(`client`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `store_products` (
    `id` VARCHAR(191) NOT NULL,
    `plan_id` VARCHAR(191) NOT NULL,
    `store` ENUM('app_store', 'google_play') NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `product_kind` ENUM('consumable', 'non_consumable', 'auto_renewing', 'non_renewing') NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `store_products_store_product_id_key`(`store`, `product_id`),
    INDEX `store_products_plan_id_store_idx`(`plan_id`, `store`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `plans`
  ADD COLUMN `device_slots` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `billing_type` ENUM('one_time', 'renewable') NOT NULL DEFAULT 'one_time';

ALTER TABLE `plan_catalog_offers`
  ADD CONSTRAINT `plan_catalog_offers_plan_id_fkey`
  FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `store_products`
  ADD CONSTRAINT `store_products_plan_id_fkey`
  FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed catalog: every existing plan visible on all clients (preserves previous global list)
-- Default payment modes: store clients prefer IAP; others web
INSERT INTO `plan_catalog_offers` (`id`, `plan_id`, `client`, `enabled`, `sort_order`, `payment_mode`, `created_at`, `updated_at`)
SELECT CONCAT('pco_', p.id, '_ios_appstore'), p.id, 'ios_appstore', p.enabled, p.sort_order, 'iap_only', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `plans` p;

INSERT INTO `plan_catalog_offers` (`id`, `plan_id`, `client`, `enabled`, `sort_order`, `payment_mode`, `created_at`, `updated_at`)
SELECT CONCAT('pco_', p.id, '_ios_alt'), p.id, 'ios_alt', p.enabled, p.sort_order, 'web_only', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `plans` p;

INSERT INTO `plan_catalog_offers` (`id`, `plan_id`, `client`, `enabled`, `sort_order`, `payment_mode`, `created_at`, `updated_at`)
SELECT CONCAT('pco_', p.id, '_android_play'), p.id, 'android_play', FALSE, p.sort_order, 'iap_only', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `plans` p;

INSERT INTO `plan_catalog_offers` (`id`, `plan_id`, `client`, `enabled`, `sort_order`, `payment_mode`, `created_at`, `updated_at`)
SELECT CONCAT('pco_', p.id, '_android_direct'), p.id, 'android_direct', p.enabled, p.sort_order, 'web_only', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `plans` p;

INSERT INTO `plan_catalog_offers` (`id`, `plan_id`, `client`, `enabled`, `sort_order`, `payment_mode`, `created_at`, `updated_at`)
SELECT CONCAT('pco_', p.id, '_h5'), p.id, 'h5', p.enabled, p.sort_order, 'web_only', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `plans` p;
