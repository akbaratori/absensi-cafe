-- Migration: allow off_day to be NULL so that NULL = "not set" and 0 = Sunday
-- Users with off_day = 0 from the old default are updated to NULL (no day off assigned)
ALTER TABLE `users` MODIFY COLUMN `off_day` INT NULL;
UPDATE `users` SET `off_day` = NULL WHERE `off_day` = 0;
