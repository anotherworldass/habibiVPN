-- AlterTable
ALTER TABLE `announcements`
  ADD COLUMN `repeat` ENUM('once', 'every_launch') NOT NULL DEFAULT 'once';
