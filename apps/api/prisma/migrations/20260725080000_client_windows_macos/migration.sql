-- Extend ClientChannel enum on all columns that use it
ALTER TABLE `plan_catalog_offers`
  MODIFY `client` ENUM(
    'ios_appstore',
    'ios_alt',
    'android_play',
    'android_direct',
    'h5',
    'windows',
    'macos'
  ) NOT NULL;

ALTER TABLE `app_packages`
  MODIFY `client` ENUM(
    'ios_appstore',
    'ios_alt',
    'android_play',
    'android_direct',
    'h5',
    'windows',
    'macos'
  ) NOT NULL;

ALTER TABLE `users`
  MODIFY `source_client` ENUM(
    'ios_appstore',
    'ios_alt',
    'android_play',
    'android_direct',
    'h5',
    'windows',
    'macos'
  ) NULL;

-- Seed catalog rows for existing plans (web payment, follow plan.enabled)
INSERT INTO `plan_catalog_offers` (
  `id`, `plan_id`, `client`, `enabled`, `sort_order`, `payment_mode`, `created_at`, `updated_at`
)
SELECT
  CONCAT('pco_', p.id, '_windows'),
  p.id,
  'windows',
  p.enabled,
  p.sort_order,
  'web_only',
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `plans` p
WHERE NOT EXISTS (
  SELECT 1 FROM `plan_catalog_offers` o
  WHERE o.`plan_id` = p.id AND o.`client` = 'windows'
);

INSERT INTO `plan_catalog_offers` (
  `id`, `plan_id`, `client`, `enabled`, `sort_order`, `payment_mode`, `created_at`, `updated_at`
)
SELECT
  CONCAT('pco_', p.id, '_macos'),
  p.id,
  'macos',
  p.enabled,
  p.sort_order,
  'web_only',
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `plans` p
WHERE NOT EXISTS (
  SELECT 1 FROM `plan_catalog_offers` o
  WHERE o.`plan_id` = p.id AND o.`client` = 'macos'
);
