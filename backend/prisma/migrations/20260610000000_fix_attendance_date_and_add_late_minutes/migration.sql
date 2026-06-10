-- AlterTable: Change `date` column from DATETIME to DATE for consistent day boundaries
ALTER TABLE `attendance` MODIFY COLUMN `date` DATE NOT NULL;

-- AlterTable: Add `late_minutes` column to track granular lateness
ALTER TABLE `attendance` ADD COLUMN `late_minutes` INTEGER NOT NULL DEFAULT 0;
