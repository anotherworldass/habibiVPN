-- Eligibility P1: package allow-list + multi-attempt per day

-- AlterTable campaign_claims
ALTER TABLE `campaign_claims` ADD COLUMN `attempt_index` INTEGER NOT NULL DEFAULT 1;

DROP INDEX `campaign_claims_campaign_id_user_id_period_key_key` ON `campaign_claims`;

CREATE UNIQUE INDEX `campaign_claims_campaign_id_user_id_period_key_attempt_index_key`
  ON `campaign_claims`(`campaign_id`, `user_id`, `period_key`, `attempt_index`);

-- CreateTable campaign_packages
CREATE TABLE `campaign_packages` (
    `id` VARCHAR(191) NOT NULL,
    `campaign_id` VARCHAR(191) NOT NULL,
    `package_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `campaign_packages_campaign_id_package_id_key`(`campaign_id`, `package_id`),
    INDEX `campaign_packages_package_id_idx`(`package_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `campaign_packages`
  ADD CONSTRAINT `campaign_packages_campaign_id_fkey`
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `campaign_packages`
  ADD CONSTRAINT `campaign_packages_package_id_fkey`
  FOREIGN KEY (`package_id`) REFERENCES `app_packages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
