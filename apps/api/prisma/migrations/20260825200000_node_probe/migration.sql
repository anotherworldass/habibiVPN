-- CreateTable
CREATE TABLE `node_probe_targets` (
    `id` VARCHAR(191) NOT NULL,
    `fingerprint` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `region` VARCHAR(191) NOT NULL DEFAULT 'UN',
    `protocol` VARCHAR(191) NOT NULL,
    `server` VARCHAR(191) NOT NULL,
    `port` INTEGER NOT NULL,
    `wireraw_name` VARCHAR(191) NULL,
    `clash_name` VARCHAR(191) NOT NULL,
    `last_seen_at` DATETIME(3) NOT NULL,
    `last_ok` BOOLEAN NULL,
    `last_tcp_ms` INTEGER NULL,
    `last_delay_ms` INTEGER NULL,
    `last_download_mbps` DOUBLE NULL,
    `last_error` VARCHAR(255) NULL,
    `last_probed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `node_probe_targets_fingerprint_key`(`fingerprint`),
    INDEX `node_probe_targets_region_idx`(`region`),
    INDEX `node_probe_targets_last_seen_at_idx`(`last_seen_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `node_probe_samples` (
    `id` VARCHAR(191) NOT NULL,
    `target_id` VARCHAR(191) NOT NULL,
    `probed_at` DATETIME(3) NOT NULL,
    `ok` BOOLEAN NOT NULL,
    `tcp_ms` INTEGER NULL,
    `delay_ms` INTEGER NULL,
    `download_mbps` DOUBLE NULL,
    `error` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `node_probe_samples_target_id_probed_at_idx`(`target_id`, `probed_at`),
    INDEX `node_probe_samples_probed_at_idx`(`probed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `node_probe_hourly` (
    `target_id` VARCHAR(191) NOT NULL,
    `hour` DATETIME(3) NOT NULL,
    `ok_count` INTEGER NOT NULL DEFAULT 0,
    `fail_count` INTEGER NOT NULL DEFAULT 0,
    `delay_sum_ms` INTEGER NOT NULL DEFAULT 0,
    `delay_count` INTEGER NOT NULL DEFAULT 0,
    `mbps_sum` DOUBLE NOT NULL DEFAULT 0,
    `mbps_count` INTEGER NOT NULL DEFAULT 0,

    INDEX `node_probe_hourly_hour_idx`(`hour`),
    PRIMARY KEY (`target_id`, `hour`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `node_probe_incidents` (
    `id` VARCHAR(191) NOT NULL,
    `target_id` VARCHAR(191) NULL,
    `region` VARCHAR(191) NULL,
    `kind` VARCHAR(191) NOT NULL,
    `summary` VARCHAR(512) NOT NULL,
    `opened_at` DATETIME(3) NOT NULL,
    `closed_at` DATETIME(3) NULL,
    `last_alert_at` DATETIME(3) NULL,
    `telegram_message_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `node_probe_incidents_closed_at_opened_at_idx`(`closed_at`, `opened_at`),
    INDEX `node_probe_incidents_target_id_kind_closed_at_idx`(`target_id`, `kind`, `closed_at`),
    INDEX `node_probe_incidents_region_kind_closed_at_idx`(`region`, `kind`, `closed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `node_probe_samples` ADD CONSTRAINT `node_probe_samples_target_id_fkey` FOREIGN KEY (`target_id`) REFERENCES `node_probe_targets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `node_probe_hourly` ADD CONSTRAINT `node_probe_hourly_target_id_fkey` FOREIGN KEY (`target_id`) REFERENCES `node_probe_targets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `node_probe_incidents` ADD CONSTRAINT `node_probe_incidents_target_id_fkey` FOREIGN KEY (`target_id`) REFERENCES `node_probe_targets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
