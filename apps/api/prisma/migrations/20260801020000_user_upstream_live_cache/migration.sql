-- Cache WireRaw live fields on user_upstreams for stale-while-revalidate list
ALTER TABLE `user_upstreams`
  ADD COLUMN `used_traffic_bytes` BIGINT NULL,
  ADD COLUMN `data_limit_bytes` BIGINT NULL,
  ADD COLUMN `online_ip_limit` INT NULL,
  ADD COLUMN `online_device_count` INT NULL,
  ADD COLUMN `subscription_online_devices` INT NULL,
  ADD COLUMN `online_at` DATETIME(3) NULL,
  ADD COLUMN `online_since` DATETIME(3) NULL,
  ADD COLUMN `service_expires_at` DATETIME(3) NULL,
  ADD COLUMN `current_node` JSON NULL;
