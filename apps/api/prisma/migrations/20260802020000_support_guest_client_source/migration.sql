-- Track whether web support guest came from site H5 or in-app WebView.
ALTER TABLE `support_guests` ADD COLUMN `client_source` VARCHAR(191) NULL;

CREATE INDEX `support_guests_project_id_client_source_idx`
  ON `support_guests`(`project_id`, `client_source`);
