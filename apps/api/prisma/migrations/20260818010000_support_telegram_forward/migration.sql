-- CreateTable
CREATE TABLE `support_telegram_forward_maps` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `conversation_id` VARCHAR(191) NOT NULL,
    `support_message_id` VARCHAR(191) NULL,
    `telegram_chat_id` VARCHAR(191) NOT NULL,
    `telegram_message_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `stf_maps_project_chat_msgid_key`(`project_id`, `telegram_chat_id`, `telegram_message_id`),
    INDEX `support_telegram_forward_maps_conversation_id_idx`(`conversation_id`),
    INDEX `support_telegram_forward_maps_project_id_created_at_idx`(`project_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `support_telegram_forward_maps` ADD CONSTRAINT `support_telegram_forward_maps_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_telegram_forward_maps` ADD CONSTRAINT `support_telegram_forward_maps_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `support_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
