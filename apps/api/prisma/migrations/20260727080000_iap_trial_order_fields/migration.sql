-- AlterTable: store product marketing trial days
ALTER TABLE `store_products`
  ADD COLUMN `trial_days` INTEGER NULL;

-- AlterTable: Apple IAP trial / offer snapshots on orders
ALTER TABLE `orders`
  ADD COLUMN `store_expires_at` DATETIME(3) NULL,
  ADD COLUMN `store_price_millis` INTEGER NULL,
  ADD COLUMN `apple_offer_type` VARCHAR(191) NULL,
  ADD COLUMN `apple_offer_discount_type` VARCHAR(191) NULL,
  ADD COLUMN `is_trial_period` BOOLEAN NOT NULL DEFAULT false;
