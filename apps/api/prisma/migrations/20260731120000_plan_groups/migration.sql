-- CreateTable
CREATE TABLE `plan_groups` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `name_i18n` JSON NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `plan_groups_project_id_enabled_idx`(`project_id`, `enabled`),
    UNIQUE INDEX `plan_groups_project_id_code_key`(`project_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `plan_groups` ADD CONSTRAINT `plan_groups_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE `plans` ADD COLUMN `group_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `plans_group_id_idx` ON `plans`(`group_id`);

-- AddForeignKey
ALTER TABLE `plans` ADD CONSTRAINT `plans_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `plan_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
