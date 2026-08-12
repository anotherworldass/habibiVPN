-- AlterTable
ALTER TABLE `users`
  ADD COLUMN `connect_mode` ENUM('unset', 'official_app', 'subscription_client') NOT NULL DEFAULT 'unset',
  ADD COLUMN `connect_clients` JSON NULL,
  ADD COLUMN `connect_pref_source` ENUM('onboarding', 'connect_page', 'settings', 'claim_prompt', 'inferred') NULL,
  ADD COLUMN `connect_pref_at` DATETIME(3) NULL;

UPDATE `users` SET `connect_clients` = CAST('[]' AS JSON) WHERE `connect_clients` IS NULL;

ALTER TABLE `users` MODIFY `connect_clients` JSON NOT NULL;
