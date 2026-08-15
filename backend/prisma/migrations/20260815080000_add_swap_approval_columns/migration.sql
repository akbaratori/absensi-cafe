-- AlterTable
ALTER TABLE `shift_swaps` ADD COLUMN `rejection_note` VARCHAR(191) NULL,
    ADD COLUMN `approver_id` INTEGER NULL,
    ADD COLUMN `responded_at` DATETIME(3) NULL,
    ADD COLUMN `approved_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `off_day_requests` ADD COLUMN `rejection_note` VARCHAR(191) NULL,
    ADD COLUMN `approver_id` INTEGER NULL,
    ADD COLUMN `responded_at` DATETIME(3) NULL,
    ADD COLUMN `approved_at` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `shift_swaps_approver_id_idx` ON `shift_swaps`(`approver_id`);

-- CreateIndex
CREATE INDEX `off_day_requests_approver_id_idx` ON `off_day_requests`(`approver_id`);

-- AddForeignKey
ALTER TABLE `shift_swaps` ADD CONSTRAINT `shift_swaps_approver_id_fkey` FOREIGN KEY (`approver_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `off_day_requests` ADD CONSTRAINT `off_day_requests_approver_id_fkey` FOREIGN KEY (`approver_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;