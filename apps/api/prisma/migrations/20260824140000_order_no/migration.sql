-- User-facing order serial: YYYYMMDD + 5-digit seq (Asia/Shanghai)

CREATE TABLE `order_no_counters` (
    `day` VARCHAR(8) NOT NULL,
    `next_seq` INTEGER NOT NULL,

    PRIMARY KEY (`day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `orders` ADD COLUMN `order_no` VARCHAR(13) NULL;

UPDATE `orders` o
JOIN (
    SELECT
        `id`,
        CONCAT(
            DATE_FORMAT(DATE_ADD(`created_at`, INTERVAL 8 HOUR), '%Y%m%d'),
            LPAD(
                ROW_NUMBER() OVER (
                    PARTITION BY DATE_FORMAT(DATE_ADD(`created_at`, INTERVAL 8 HOUR), '%Y%m%d')
                    ORDER BY `created_at` ASC, `id` ASC
                ),
                5,
                '0'
            )
        ) AS `order_no`
    FROM `orders`
) x ON o.`id` = x.`id`
SET o.`order_no` = x.`order_no`;

INSERT INTO `order_no_counters` (`day`, `next_seq`)
SELECT LEFT(`order_no`, 8), MAX(CAST(RIGHT(`order_no`, 5) AS UNSIGNED)) + 1
FROM `orders`
WHERE `order_no` IS NOT NULL
GROUP BY LEFT(`order_no`, 8);

ALTER TABLE `orders` MODIFY `order_no` VARCHAR(13) NOT NULL;

CREATE UNIQUE INDEX `orders_order_no_key` ON `orders`(`order_no`);
