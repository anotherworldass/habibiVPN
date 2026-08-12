-- AlterTable
ALTER TABLE `plans`
  ADD COLUMN `reset_policy` ENUM('no_reset', 'day', 'week', 'month', 'year', 'custom') NOT NULL DEFAULT 'no_reset',
  ADD COLUMN `custom_reset_interval` VARCHAR(191) NULL;
