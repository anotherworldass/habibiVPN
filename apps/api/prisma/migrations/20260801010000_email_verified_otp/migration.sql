-- Email verification + register OTP
ALTER TABLE `users` ADD COLUMN `email_verified_at` DATETIME(3) NULL;

-- Grandfather existing bound emails as verified
UPDATE `users`
SET `email_verified_at` = `created_at`
WHERE `email` IS NOT NULL AND `email_verified_at` IS NULL;

CREATE TABLE `email_otps` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `purpose` ENUM('register') NOT NULL,
    `code_hash` VARCHAR(191) NOT NULL,
    `payload` JSON NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `email_otps_email_purpose_created_at_idx`(`email`, `purpose`, `created_at`),
    INDEX `email_otps_code_hash_idx`(`code_hash`),
    INDEX `email_otps_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
