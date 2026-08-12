-- Project Telegram bot config + DM subscribers for broadcast

CREATE TABLE `project_telegram_bots` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `bot_username` VARCHAR(191) NULL,
    `bot_token_enc` TEXT NULL,
    `webhook_secret` VARCHAR(191) NOT NULL,
    `mini_app_url` TEXT NULL,
    `welcome_text` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `project_telegram_bots_project_id_key`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `telegram_subscribers` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `bot_id` VARCHAR(191) NOT NULL,
    `telegram_user_id` VARCHAR(191) NOT NULL,
    `chat_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `username` VARCHAR(191) NULL,
    `first_name` VARCHAR(191) NULL,
    `last_name` VARCHAR(191) NULL,
    `language_code` VARCHAR(191) NULL,
    `can_dm` BOOLEAN NOT NULL DEFAULT true,
    `blocked` BOOLEAN NOT NULL DEFAULT false,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `telegram_subscribers_bot_id_telegram_user_id_key`(`bot_id`, `telegram_user_id`),
    INDEX `telegram_subscribers_project_id_can_dm_blocked_idx`(`project_id`, `can_dm`, `blocked`),
    INDEX `telegram_subscribers_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `project_telegram_bots`
  ADD CONSTRAINT `project_telegram_bots_project_id_fkey`
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `telegram_subscribers`
  ADD CONSTRAINT `telegram_subscribers_bot_id_fkey`
  FOREIGN KEY (`bot_id`) REFERENCES `project_telegram_bots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `telegram_subscribers`
  ADD CONSTRAINT `telegram_subscribers_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
