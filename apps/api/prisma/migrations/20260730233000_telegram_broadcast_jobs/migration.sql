-- Async Telegram broadcast jobs (cursor-batched)

CREATE TABLE `telegram_broadcast_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `bot_id` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `status` ENUM('queued', 'running', 'paused', 'completed', 'cancelled', 'failed') NOT NULL DEFAULT 'queued',
    `only_can_dm` BOOLEAN NOT NULL DEFAULT true,
    `total_targeted` INTEGER NOT NULL DEFAULT 0,
    `sent_count` INTEGER NOT NULL DEFAULT 0,
    `failed_count` INTEGER NOT NULL DEFAULT 0,
    `cursor_id` VARCHAR(191) NULL,
    `error_samples` JSON NOT NULL DEFAULT (JSON_ARRAY()),
    `created_by` VARCHAR(191) NULL,
    `error_message` TEXT NULL,
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `telegram_broadcast_jobs_project_id_status_created_at_idx`(`project_id`, `status`, `created_at`),
    INDEX `telegram_broadcast_jobs_status_updated_at_idx`(`status`, `updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `telegram_broadcast_jobs`
  ADD CONSTRAINT `telegram_broadcast_jobs_bot_id_fkey`
  FOREIGN KEY (`bot_id`) REFERENCES `project_telegram_bots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
