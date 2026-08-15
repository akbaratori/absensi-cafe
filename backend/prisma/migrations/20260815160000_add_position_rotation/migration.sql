-- CreateTable
CREATE TABLE IF NOT EXISTS `positions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `shift1_capacity` INTEGER NOT NULL DEFAULT 2,
    `shift2_capacity` INTEGER NOT NULL DEFAULT 3,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `positions_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `position_rosters` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `position_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `order_index` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `position_rosters_position_id_order_index_key`(`position_id`, `order_index`),
    UNIQUE INDEX `position_rosters_position_id_user_id_key`(`position_id`, `user_id`),
    INDEX `position_rosters_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `rotation_states` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `position_id` INTEGER NOT NULL,
    `current_start_index` INTEGER NOT NULL DEFAULT 0,
    `last_generated_week_start` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `rotation_states_position_id_idx`(`position_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

