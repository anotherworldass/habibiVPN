-- AlterTable: plans free claim flag
ALTER TABLE `plans` ADD COLUMN `is_free_claimable` BOOLEAN NOT NULL DEFAULT false;

-- Drop FK so we can replace unique(user_id) with non-unique index
ALTER TABLE `user_upstreams` DROP FOREIGN KEY `user_upstreams_user_id_fkey`;

ALTER TABLE `user_upstreams` DROP INDEX `user_upstreams_user_id_key`;

ALTER TABLE `user_upstreams`
    ADD COLUMN `plan_id` VARCHAR(191) NULL,
    ADD COLUMN `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active';

CREATE INDEX `user_upstreams_user_id_idx` ON `user_upstreams`(`user_id`);
CREATE INDEX `user_upstreams_plan_id_idx` ON `user_upstreams`(`plan_id`);

CREATE UNIQUE INDEX `user_upstreams_user_id_plan_id_key` ON `user_upstreams`(`user_id`, `plan_id`);

ALTER TABLE `user_upstreams` ADD CONSTRAINT `user_upstreams_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `user_upstreams` ADD CONSTRAINT `user_upstreams_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
