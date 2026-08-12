-- Keyword auto-reply rules + private chat inbox messages

CREATE TABLE `telegram_auto_reply_rules` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `bot_id` VARCHAR(191) NOT NULL,
    `keyword` VARCHAR(191) NOT NULL,
    `match_mode` ENUM('contains', 'exact', 'starts_with') NOT NULL DEFAULT 'contains',
    `reply_text` TEXT NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `priority` INTEGER NOT NULL DEFAULT 100,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `telegram_auto_reply_rules_project_id_enabled_priority_idx`(`project_id`, `enabled`, `priority`),
    INDEX `telegram_auto_reply_rules_bot_id_enabled_priority_idx`(`bot_id`, `enabled`, `priority`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `telegram_messages` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `bot_id` VARCHAR(191) NOT NULL,
    `subscriber_id` VARCHAR(191) NOT NULL,
    `direction` ENUM('inbound', 'outbound') NOT NULL,
    `source` ENUM('user', 'welcome', 'auto_reply', 'admin') NOT NULL,
    `content_type` VARCHAR(191) NOT NULL DEFAULT 'text',
    `text` TEXT NULL,
    `telegram_message_id` VARCHAR(191) NULL,
    `auto_reply_rule_id` VARCHAR(191) NULL,
    `admin_username` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `telegram_messages_project_id_created_at_idx`(`project_id`, `created_at`),
    INDEX `telegram_messages_subscriber_id_created_at_idx`(`subscriber_id`, `created_at`),
    INDEX `telegram_messages_bot_id_created_at_idx`(`bot_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `telegram_subscribers`
  ADD COLUMN `unread_count` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `last_message_at` DATETIME(3) NULL,
  ADD COLUMN `last_message_preview` TEXT NULL;

CREATE INDEX `telegram_subscribers_project_id_last_message_at_idx`
  ON `telegram_subscribers`(`project_id`, `last_message_at`);

CREATE INDEX `telegram_subscribers_project_id_unread_count_idx`
  ON `telegram_subscribers`(`project_id`, `unread_count`);

ALTER TABLE `telegram_auto_reply_rules`
  ADD CONSTRAINT `telegram_auto_reply_rules_bot_id_fkey`
  FOREIGN KEY (`bot_id`) REFERENCES `project_telegram_bots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `telegram_messages`
  ADD CONSTRAINT `telegram_messages_bot_id_fkey`
  FOREIGN KEY (`bot_id`) REFERENCES `project_telegram_bots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `telegram_messages`
  ADD CONSTRAINT `telegram_messages_subscriber_id_fkey`
  FOREIGN KEY (`subscriber_id`) REFERENCES `telegram_subscribers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
