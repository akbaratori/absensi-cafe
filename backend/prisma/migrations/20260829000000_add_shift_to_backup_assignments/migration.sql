-- AlterTable backup_assignments: tambahkan kolom shift_number
-- Shift yang membutuhkan backup. Default 1 agar data lama tetap valid.
ALTER TABLE `backup_assignments`
    ADD COLUMN `shift_number` INTEGER NOT NULL DEFAULT 1;
