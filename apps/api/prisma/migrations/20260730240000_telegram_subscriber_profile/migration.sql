-- Extra Telegram User / WebApp profile fields on subscribers

ALTER TABLE `telegram_subscribers`
  ADD COLUMN `is_premium` BOOLEAN NULL,
  ADD COLUMN `is_bot` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `allows_write_to_pm` BOOLEAN NULL,
  ADD COLUMN `photo_url` TEXT NULL;

CREATE INDEX `telegram_subscribers_project_id_language_code_idx`
  ON `telegram_subscribers`(`project_id`, `language_code`);
