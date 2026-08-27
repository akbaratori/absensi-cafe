-- Add telegram_user_id column to users table
-- Manual migration for production deployment

ALTER TABLE `users` 
ADD COLUMN `telegram_user_id` VARCHAR(191) NULL UNIQUE AFTER `employee_id`;

-- Add index for telegram_user_id lookups
CREATE INDEX `users_telegram_user_id_idx` ON `users`(`telegram_user_id`);
