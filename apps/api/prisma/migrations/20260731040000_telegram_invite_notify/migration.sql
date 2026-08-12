-- AlterTable
ALTER TABLE `telegram_subscribers` ADD COLUMN `invite_notify_enabled` BOOLEAN NOT NULL DEFAULT true;

-- AlterEnum
ALTER TABLE `telegram_messages` MODIFY COLUMN `source` ENUM('user', 'welcome', 'auto_reply', 'admin', 'invite_notify') NOT NULL;
