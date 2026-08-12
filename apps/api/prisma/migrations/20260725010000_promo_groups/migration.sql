-- CreateTable promo_groups
CREATE TABLE `promo_groups` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `max_level` INTEGER NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `remark` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `promo_groups_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable promo_group_level_rates
CREATE TABLE `promo_group_level_rates` (
    `id` VARCHAR(191) NOT NULL,
    `group_id` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL,
    `rate_bps` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `promo_group_level_rates_group_id_level_key`(`group_id`, `level`),
    INDEX `promo_group_level_rates_group_id_idx`(`group_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `promo_group_level_rates`
  ADD CONSTRAINT `promo_group_level_rates_group_id_fkey`
  FOREIGN KEY (`group_id`) REFERENCES `promo_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed three tiers (same rates as current global config; admin adjusts later)
INSERT INTO `promo_groups` (`id`, `name`, `code`, `is_default`, `enabled`, `max_level`, `sort`, `remark`, `created_at`, `updated_at`)
VALUES
  ('bronze', '铜牌', 'bronze', true, true, NULL, 30, '默认档位（与上线前全局费率一致）', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('silver', '银牌', 'silver', false, true, NULL, 20, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('gold', '金牌', 'gold', false, true, NULL, 10, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

-- Copy existing global rates into all three groups (fallback to defaults if empty)
INSERT INTO `promo_group_level_rates` (`id`, `group_id`, `level`, `rate_bps`, `created_at`, `updated_at`)
SELECT CONCAT('pglr_', g.id, '_', r.level), g.id, r.level, r.rate_bps, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `promo_groups` g
CROSS JOIN `referral_level_rates` r;

INSERT INTO `promo_group_level_rates` (`id`, `group_id`, `level`, `rate_bps`, `created_at`, `updated_at`)
SELECT CONCAT('pglr_', g.id, '_', v.level), g.id, v.level, v.rate_bps, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `promo_groups` g
CROSS JOIN (
  SELECT 1 AS level, 1400 AS rate_bps UNION ALL
  SELECT 2, 300 UNION ALL
  SELECT 3, 150 UNION ALL
  SELECT 4, 100 UNION ALL
  SELECT 5, 50
) v
WHERE NOT EXISTS (SELECT 1 FROM `promo_group_level_rates` x WHERE x.group_id = g.id);

-- Add users.promo_group_id
ALTER TABLE `users` ADD COLUMN `promo_group_id` VARCHAR(191) NOT NULL DEFAULT 'bronze';

CREATE INDEX `users_promo_group_id_idx` ON `users`(`promo_group_id`);

ALTER TABLE `users`
  ADD CONSTRAINT `users_promo_group_id_fkey`
  FOREIGN KEY (`promo_group_id`) REFERENCES `promo_groups`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Snapshot column on commission ledgers
ALTER TABLE `commission_ledgers` ADD COLUMN `promo_group_id` VARCHAR(191) NULL;

CREATE INDEX `commission_ledgers_promo_group_id_idx` ON `commission_ledgers`(`promo_group_id`);

ALTER TABLE `commission_ledgers`
  ADD CONSTRAINT `commission_ledgers_promo_group_id_fkey`
  FOREIGN KEY (`promo_group_id`) REFERENCES `promo_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
