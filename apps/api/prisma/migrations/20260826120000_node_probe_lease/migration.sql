-- CreateTable
CREATE TABLE `node_probe_leases` (
    `id` VARCHAR(191) NOT NULL,
    `owner` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `node_probe_incidents` ADD COLUMN `open_key` VARCHAR(191) NULL;

-- Close duplicate open incidents, keep the oldest row per target+kind
UPDATE `node_probe_incidents` AS `i`
INNER JOIN (
    SELECT `id` FROM (
        SELECT `a`.`id`
        FROM `node_probe_incidents` AS `a`
        INNER JOIN `node_probe_incidents` AS `b`
          ON `a`.`target_id` = `b`.`target_id`
         AND `a`.`kind` = `b`.`kind`
         AND `a`.`closed_at` IS NULL
         AND `b`.`closed_at` IS NULL
         AND (
           `b`.`opened_at` < `a`.`opened_at`
           OR (`b`.`opened_at` = `a`.`opened_at` AND `b`.`id` < `a`.`id`)
         )
        WHERE `a`.`closed_at` IS NULL AND `a`.`target_id` IS NOT NULL
    ) AS `dupes`
) AS `d` ON `i`.`id` = `d`.`id`
SET `i`.`closed_at` = CURRENT_TIMESTAMP(3);

UPDATE `node_probe_incidents`
SET `open_key` = CONCAT(`target_id`, ':', `kind`)
WHERE `closed_at` IS NULL AND `target_id` IS NOT NULL;

CREATE UNIQUE INDEX `node_probe_incidents_open_key_key` ON `node_probe_incidents`(`open_key`);
