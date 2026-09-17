-- CreateTable
CREATE TABLE `kitchen_jobdesk_states` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `position_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `queue_index` INTEGER NOT NULL,
    `effective_from` DATE NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `kitchen_jobdesk_states_position_id_queue_index_idx`(`position_id`, `queue_index`),
    UNIQUE INDEX `kitchen_jobdesk_states_position_id_user_id_key`(`position_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kitchen_jobdesk_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATE NOT NULL,
    `user_id` INTEGER NOT NULL,
    `role_code` VARCHAR(191) NOT NULL,
    `packages_assigned` TEXT NOT NULL,
    `working_count` INTEGER NOT NULL,
    `rotation_version` INTEGER NOT NULL DEFAULT 2,
    `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `kitchen_jobdesk_logs_date_idx`(`date`),
    INDEX `kitchen_jobdesk_logs_user_id_date_idx`(`user_id`, `date`),
    UNIQUE INDEX `kitchen_jobdesk_logs_date_user_id_key`(`date`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

