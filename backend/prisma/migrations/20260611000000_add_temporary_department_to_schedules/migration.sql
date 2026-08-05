-- AlterTable: Add temporary_department to user_schedules
-- Allows admin to assign an employee to a different department for a specific day
ALTER TABLE "user_schedules" ADD COLUMN "temporary_department" TEXT;
