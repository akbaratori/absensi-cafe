-- CreateTable backup_assignments
CREATE TABLE `backup_assignments` (
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
