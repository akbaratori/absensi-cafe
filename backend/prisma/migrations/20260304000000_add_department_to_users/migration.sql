-- AlterTable: Add department column to users table
-- This column was in schema.prisma but missing from migrations
ALTER TABLE `users` ADD COLUMN `department` VARCHAR(191) NOT NULL DEFAULT 'BAR';
