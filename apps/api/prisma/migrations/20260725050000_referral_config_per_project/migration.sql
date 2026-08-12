-- ReferralConfig scoped per project
ALTER TABLE `referral_configs` ADD COLUMN `project_id` VARCHAR(191) NULL;

UPDATE `referral_configs` SET `project_id` = 'habibi' WHERE `id` = 'default' OR `project_id` IS NULL;

-- Rename legacy primary key to match default project id
UPDATE `referral_configs` SET `id` = 'habibi' WHERE `id` = 'default';

ALTER TABLE `referral_configs` MODIFY `project_id` VARCHAR(191) NOT NULL;

CREATE UNIQUE INDEX `referral_configs_project_id_key` ON `referral_configs`(`project_id`);

ALTER TABLE `referral_configs`
  ADD CONSTRAINT `referral_configs_project_id_fkey`
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed missing configs for existing non-habibi projects (copy habibi settings)
INSERT INTO `referral_configs` (
  `id`, `project_id`, `enabled`, `max_level`, `settle_days`,
  `min_withdraw_cents`, `withdraw_fee_bps`, `max_total_rate_bps`,
  `withdraw_methods`, `created_at`, `updated_at`
)
SELECT
  p.`id`,
  p.`id`,
  COALESCE(h.`enabled`, true),
  COALESCE(h.`max_level`, 5),
  COALESCE(h.`settle_days`, 7),
  COALESCE(h.`min_withdraw_cents`, 10000),
  COALESCE(h.`withdraw_fee_bps`, 300),
  COALESCE(h.`max_total_rate_bps`, 2000),
  COALESCE(h.`withdraw_methods`, CAST('["usdt","bank"]' AS JSON)),
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `projects` p
LEFT JOIN `referral_configs` h ON h.`project_id` = 'habibi'
WHERE NOT EXISTS (
  SELECT 1 FROM `referral_configs` c WHERE c.`project_id` = p.`id`
);
