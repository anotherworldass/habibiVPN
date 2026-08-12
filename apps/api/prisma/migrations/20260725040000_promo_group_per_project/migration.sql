-- Promo groups scoped per project
ALTER TABLE `promo_groups` ADD COLUMN `project_id` VARCHAR(191) NOT NULL DEFAULT 'habibi';

DROP INDEX `promo_groups_code_key` ON `promo_groups`;

CREATE UNIQUE INDEX `promo_groups_project_id_code_key` ON `promo_groups`(`project_id`, `code`);
CREATE INDEX `promo_groups_project_id_enabled_idx` ON `promo_groups`(`project_id`, `enabled`);

ALTER TABLE `promo_groups`
  ADD CONSTRAINT `promo_groups_project_id_fkey`
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
