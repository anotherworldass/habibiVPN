-- CreateEnum
ALTER TABLE `orders` ADD COLUMN `commission_kind` ENUM('first', 'renew') NOT NULL DEFAULT 'first';

-- AlterTable referral_configs
ALTER TABLE `referral_configs`
  ADD COLUMN `first_commission_base_bps` INTEGER NOT NULL DEFAULT 10000,
  ADD COLUMN `renew_commission_base_bps` INTEGER NOT NULL DEFAULT 10000;

-- Backfill: users with a prior paid-like order → later orders are renew
-- (MySQL: mark non-earliest paid-like order per user as renew)
UPDATE `orders` o
JOIN (
  SELECT `user_id`, MIN(`created_at`) AS first_at
  FROM `orders`
  WHERE `amount_cents` > 0
    AND `status` IN ('paid', 'provisioning', 'provisioned', 'refunded')
  GROUP BY `user_id`
) f ON f.`user_id` = o.`user_id`
SET o.`commission_kind` = 'renew'
WHERE o.`amount_cents` > 0
  AND o.`status` IN ('paid', 'provisioning', 'provisioned', 'refunded')
  AND o.`created_at` > f.first_at;

CREATE INDEX `orders_user_id_commission_kind_idx` ON `orders`(`user_id`, `commission_kind`);
