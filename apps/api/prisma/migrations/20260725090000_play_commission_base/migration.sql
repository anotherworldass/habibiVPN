-- AlterTable
ALTER TABLE `referral_configs`
  ADD COLUMN `play_commission_base_bps` INTEGER NOT NULL DEFAULT 10000;
