-- AlterEnum
ALTER TABLE `telegram_broadcast_jobs`
  MODIFY COLUMN `status` ENUM(
    'queued',
    'running',
    'paused',
    'completed',
    'cancelled',
    'failed',
    'recalling',
    'recalled'
  ) NOT NULL DEFAULT 'queued';

-- AlterTable
ALTER TABLE `telegram_broadcast_jobs`
  ADD COLUMN `recalled_count` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `recall_failed_count` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `recall_started_at` DATETIME(3) NULL,
  ADD COLUMN `recall_finished_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `telegram_broadcast_deliveries` (
    `id` VARCHAR(191) NOT NULL,
    `job_id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `subscriber_id` VARCHAR(191) NULL,
    `chat_id` VARCHAR(191) NOT NULL,
    `telegram_message_id` VARCHAR(191) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `telegram_broadcast_deliveries_job_id_chat_id_key`(`job_id`, `chat_id`),
    INDEX `telegram_broadcast_deliveries_job_id_deleted_at_id_idx`(`job_id`, `deleted_at`, `id`),
    INDEX `telegram_broadcast_deliveries_project_id_created_at_idx`(`project_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `telegram_broadcast_deliveries`
  ADD CONSTRAINT `telegram_broadcast_deliveries_job_id_fkey`
  FOREIGN KEY (`job_id`) REFERENCES `telegram_broadcast_jobs`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
