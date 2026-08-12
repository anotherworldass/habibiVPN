-- Catalog billing cycle (seconds). Distinct from validity_seconds (WireRaw provision).
ALTER TABLE `plans` ADD COLUMN `billing_period_seconds` INTEGER NULL;

-- one_time: default display period from entitlement duration
UPDATE `plans`
SET `billing_period_seconds` = `validity_seconds`
WHERE `billing_period_seconds` IS NULL
  AND `validity_seconds` IS NOT NULL
  AND `validity_seconds` > 0;

-- known renewable SKUs
UPDATE `plans`
SET `billing_period_seconds` = 2592000
WHERE `code` = 't_monthly_1'
  AND (`billing_period_seconds` IS NULL OR `billing_period_seconds` = 0);

UPDATE `plans`
SET `billing_period_seconds` = 31536000
WHERE `code` = 't_yearly_1'
  AND (`billing_period_seconds` IS NULL OR `billing_period_seconds` = 0);
