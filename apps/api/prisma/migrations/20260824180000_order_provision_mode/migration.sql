-- Drop unique so a user can own multiple slots of the same plan.
DROP INDEX `user_upstreams_user_id_plan_id_key` ON `user_upstreams`;

CREATE INDEX `user_upstreams_user_id_plan_id_idx` ON `user_upstreams`(`user_id`, `plan_id`);

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `provision_mode` ENUM('renew', 'new_slot') NULL,
    ADD COLUMN `target_slot_id` VARCHAR(191) NULL;

CREATE INDEX `orders_target_slot_id_idx` ON `orders`(`target_slot_id`);
