-- Add kitchen station and control role columns to user_schedules
ALTER TABLE `user_schedules`
    ADD COLUMN `kitchen_station` VARCHAR(191) NULL,
    ADD COLUMN `is_inventory_controller` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_shift_pic` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_sanitation_lead` BOOLEAN NOT NULL DEFAULT false;
