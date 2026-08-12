-- Redeem batches may link to an existing sellable Plan
ALTER TABLE `redeem_batches` ADD COLUMN `plan_id` VARCHAR(191) NULL;

CREATE INDEX `redeem_batches_plan_id_idx` ON `redeem_batches`(`plan_id`);

ALTER TABLE `redeem_batches`
  ADD CONSTRAINT `redeem_batches_plan_id_fkey`
  FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
