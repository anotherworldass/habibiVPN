-- Public numeric UID for App display + anonymous bootstrap identity

CREATE TABLE `uid_counters` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `next_uid` INTEGER NOT NULL DEFAULT 10000001,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `uid_counters` (`id`, `next_uid`) VALUES (1, 10000001);

ALTER TABLE `users` ADD COLUMN `uid` INTEGER NULL;

-- Backfill existing users in creation order
SET @uid_seq := 10000000;
UPDATE `users`
SET `uid` = (@uid_seq := @uid_seq + 1)
ORDER BY `created_at` ASC, `id` ASC;

UPDATE `uid_counters`
SET `next_uid` = (
  SELECT COALESCE(MAX(`uid`), 10000000) + 1 FROM `users`
)
WHERE `id` = 1;

ALTER TABLE `users` MODIFY `uid` INTEGER NOT NULL;

CREATE UNIQUE INDEX `users_uid_key` ON `users`(`uid`);
