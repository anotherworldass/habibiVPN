-- Reassign public UIDs so the first user starts at 160003.
-- UID is display-only; internal relations continue to use users.id.
SET @uid_seq := 160002;

UPDATE `users`
SET `uid` = (@uid_seq := @uid_seq + 1)
ORDER BY `created_at` ASC, `id` ASC;

UPDATE `uid_counters`
SET `next_uid` = (
  SELECT COALESCE(MAX(`uid`), 160002) + 1 FROM `users`
)
WHERE `id` = 1;

ALTER TABLE `uid_counters`
  ALTER COLUMN `next_uid` SET DEFAULT 160003;
