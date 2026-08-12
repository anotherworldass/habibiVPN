-- CreateTable
CREATE TABLE `support_guests` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `guest_token_hash` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `ip` VARCHAR(191) NULL,
    `user_agent` TEXT NULL,
    `timezone` VARCHAR(191) NULL,
    `locale` VARCHAR(191) NULL,
    `os_name` VARCHAR(191) NULL,
    `os_version` VARCHAR(191) NULL,
    `browser_name` VARCHAR(191) NULL,
    `device_id_hash` VARCHAR(191) NULL,
    `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `support_guests_guest_token_hash_key`(`guest_token_hash`),
    INDEX `support_guests_project_id_last_seen_at_idx`(`project_id`, `last_seen_at`),
    INDEX `support_guests_user_id_idx`(`user_id`),
    INDEX `support_guests_ip_created_at_idx`(`ip`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `support_conversations` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `channel` ENUM('web', 'telegram') NOT NULL,
    `status` ENUM('open', 'closed') NOT NULL DEFAULT 'open',
    `guest_id` VARCHAR(191) NULL,
    `user_id` VARCHAR(191) NULL,
    `telegram_subscriber_id` VARCHAR(191) NULL,
    `display_name` VARCHAR(191) NULL,
    `language_code` VARCHAR(191) NULL,
    `unread_count` INTEGER NOT NULL DEFAULT 0,
    `last_message_at` DATETIME(3) NULL,
    `last_message_preview` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `support_conversations_project_id_guest_id_key`(`project_id`, `guest_id`),
    UNIQUE INDEX `support_conversations_project_id_telegram_subscriber_id_key`(`project_id`, `telegram_subscriber_id`),
    INDEX `support_conversations_project_id_channel_last_message_at_idx`(`project_id`, `channel`, `last_message_at`),
    INDEX `support_conversations_project_id_unread_count_idx`(`project_id`, `unread_count`),
    INDEX `support_conversations_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `support_messages` (
    `id` VARCHAR(191) NOT NULL,
    `conversation_id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `direction` ENUM('inbound', 'outbound') NOT NULL,
    `source` ENUM('user', 'admin', 'system', 'auto_reply', 'welcome') NOT NULL,
    `content_type` VARCHAR(191) NOT NULL DEFAULT 'text',
    `text` TEXT NULL,
    `external_message_id` VARCHAR(191) NULL,
    `admin_username` VARCHAR(191) NULL,
    `recalled_at` DATETIME(3) NULL,
    `client_meta` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `support_messages_conversation_id_created_at_idx`(`conversation_id`, `created_at`),
    INDEX `support_messages_project_id_created_at_idx`(`project_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `support_guests` ADD CONSTRAINT `support_guests_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_guests` ADD CONSTRAINT `support_guests_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_conversations` ADD CONSTRAINT `support_conversations_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_conversations` ADD CONSTRAINT `support_conversations_guest_id_fkey` FOREIGN KEY (`guest_id`) REFERENCES `support_guests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_conversations` ADD CONSTRAINT `support_conversations_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_conversations` ADD CONSTRAINT `support_conversations_telegram_subscriber_id_fkey` FOREIGN KEY (`telegram_subscriber_id`) REFERENCES `telegram_subscribers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_messages` ADD CONSTRAINT `support_messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `support_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
