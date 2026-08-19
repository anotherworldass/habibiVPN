-- AlterTable
ALTER TABLE `users` ADD COLUMN `email_canonical` VARCHAR(191) NULL;

-- Backfill non-Gmail as lowercase email
UPDATE `users`
SET `email_canonical` = LOWER(`email`)
WHERE `email` IS NOT NULL;

-- Gmail / Googlemail: strip plus-tag and dots in the local part
UPDATE `users`
SET `email_canonical` = CONCAT(
  REPLACE(SUBSTRING_INDEX(SUBSTRING_INDEX(LOWER(`email`), '@', 1), '+', 1), '.', ''),
  '@gmail.com'
)
WHERE `email` IS NOT NULL
  AND (
    LOWER(`email`) LIKE '%@gmail.com'
    OR LOWER(`email`) LIKE '%@googlemail.com'
  );

-- CreateIndex
CREATE INDEX `users_email_canonical_idx` ON `users`(`email_canonical`);
