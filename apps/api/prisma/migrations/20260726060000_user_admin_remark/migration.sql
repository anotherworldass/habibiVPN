-- Admin-only remark on users (referral / support notes)
ALTER TABLE `users` ADD COLUMN `admin_remark` TEXT NULL;
