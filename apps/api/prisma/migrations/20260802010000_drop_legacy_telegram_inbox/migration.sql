-- Drop legacy Telegram admin-inbox message store (ops moved to support_messages).
DROP TABLE IF EXISTS `telegram_messages`;

-- Drop unused inbox counters / previews on subscribers (support_conversations owns these).
DROP INDEX `telegram_subscribers_project_id_last_message_at_idx` ON `telegram_subscribers`;
DROP INDEX `telegram_subscribers_project_id_unread_count_idx` ON `telegram_subscribers`;

ALTER TABLE `telegram_subscribers`
  DROP COLUMN `unread_count`,
  DROP COLUMN `last_message_at`,
  DROP COLUMN `last_message_preview`;
