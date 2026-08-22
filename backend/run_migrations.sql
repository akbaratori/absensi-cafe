-- Migration: Create all missing tables for rotation/position/manual_off_days/backup_assignments
-- Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS checks)

-- 1. positions table
CREATE TABLE IF NOT EXISTS `positions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `shift1_capacity` INTEGER NOT NULL DEFAULT 2,
    `shift2_capacity` INTEGER NOT NULL DEFAULT 3,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `positions_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. position_rosters table
CREATE TABLE IF NOT EXISTS `position_rosters` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `position_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `order_index` INTEGER NOT NULL,
    `shift_number` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `position_rosters_position_id_order_index_key`(`position_id`, `order_index`),
    UNIQUE INDEX `position_rosters_position_id_user_id_key`(`position_id`, `user_id`),
    INDEX `position_rosters_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3. rotation_states table
CREATE TABLE IF NOT EXISTS `rotation_states` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `position_id` INTEGER NOT NULL,
    `current_start_index` INTEGER NOT NULL DEFAULT 0,
    `last_generated_week_start` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `rotation_states_position_id_key`(`position_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4. weekly_schedules table
CREATE TABLE IF NOT EXISTS `weekly_schedules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `position_id` INTEGER NOT NULL,
    `week_start` DATETIME(3) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `shift_number` INTEGER NOT NULL,
    `is_generated` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `weekly_schedules_position_id_week_start_user_id_key`(`position_id`, `week_start`, `user_id`),
    INDEX `weekly_schedules_position_id_week_start_idx`(`position_id`, `week_start`),
    INDEX `weekly_schedules_user_id_week_start_idx`(`user_id`, `week_start`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 5. manual_off_days table
CREATE TABLE IF NOT EXISTS `manual_off_days` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `week_start` DATE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `manual_off_days_user_id_date_key`(`user_id`, `date`),
    INDEX `manual_off_days_week_start_idx`(`week_start`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 6. backup_assignments table
CREATE TABLE IF NOT EXISTS `backup_assignments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATE NOT NULL,
    `absent_user_id` INTEGER NOT NULL,
    `backup_user_id` INTEGER NOT NULL,
    `absent_position_id` INTEGER NOT NULL,
    `backup_user_original_department` VARCHAR(191) NOT NULL DEFAULT 'BAR',
    `notes` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `backup_assignments_date_idx`(`date`),
    INDEX `backup_assignments_absent_user_id_idx`(`absent_user_id`),
    INDEX `backup_assignments_backup_user_id_idx`(`backup_user_id`),
    UNIQUE INDEX `backup_assignments_date_absent_user_id_key`(`date`, `absent_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Done
SELECT 'Migrations applied successfully' AS status;
