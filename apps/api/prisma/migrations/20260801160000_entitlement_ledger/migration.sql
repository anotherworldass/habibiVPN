-- CreateTable
CREATE TABLE `entitlement_ledgers` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `slot_id` VARCHAR(191) NOT NULL,
    `reason` ENUM('order_paid', 'iap', 'redeem', 'campaign', 'free_claim', 'admin_provision', 'refund_clawback') NOT NULL,
    `change_flags` JSON NOT NULL,
    `plan_id_before` VARCHAR(191) NULL,
    `plan_id_after` VARCHAR(191) NULL,
    `expires_at_before` DATETIME(3) NULL,
    `expires_at_after` DATETIME(3) NULL,
    `expire_delta_seconds` INTEGER NULL,
    `data_limit_before` BIGINT NULL,
    `data_limit_after` BIGINT NULL,
    `data_limit_delta` BIGINT NULL,
    `status_before` VARCHAR(191) NULL,
    `status_after` VARCHAR(191) NULL,
    `ref_type` VARCHAR(191) NULL,
    `ref_id` VARCHAR(191) NULL,
    `actor_type` VARCHAR(191) NULL,
    `actor_id` VARCHAR(191) NULL,
    `remark` TEXT NULL,
    `idempotency_key` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `entitlement_ledgers_idempotency_key_key`(`idempotency_key`),
    INDEX `entitlement_ledgers_project_id_created_at_idx`(`project_id`, `created_at`),
    INDEX `entitlement_ledgers_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `entitlement_ledgers_slot_id_created_at_idx`(`slot_id`, `created_at`),
    INDEX `entitlement_ledgers_reason_created_at_idx`(`reason`, `created_at`),
    INDEX `entitlement_ledgers_ref_type_ref_id_idx`(`ref_type`, `ref_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `entitlement_ledgers` ADD CONSTRAINT `entitlement_ledgers_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `entitlement_ledgers` ADD CONSTRAINT `entitlement_ledgers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
