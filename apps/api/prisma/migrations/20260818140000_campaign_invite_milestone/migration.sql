-- Invite milestone campaigns: new type, plan reward kind, optional plan_id

ALTER TABLE `campaigns`
  MODIFY `type` ENUM('daily_claim', 'lottery', 'invite_milestone') NOT NULL;

ALTER TABLE `campaign_rewards`
  MODIFY `kind` ENUM('vpn_duration', 'vpn_traffic', 'vpn_plan') NOT NULL DEFAULT 'vpn_duration';

ALTER TABLE `redeem_batches`
  MODIFY `kind` ENUM('vpn_duration', 'vpn_traffic', 'vpn_plan') NOT NULL DEFAULT 'vpn_duration';

ALTER TABLE `campaign_rewards` ADD COLUMN `plan_id` VARCHAR(191) NULL;

CREATE INDEX `campaign_rewards_plan_id_idx` ON `campaign_rewards`(`plan_id`);

ALTER TABLE `campaign_rewards`
  ADD CONSTRAINT `campaign_rewards_plan_id_fkey`
  FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
