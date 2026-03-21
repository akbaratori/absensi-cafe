-- AlterTable
ALTER TABLE `off_day_requests` ADD COLUMN `target_user_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `off_day_requests_target_user_id_idx` ON `off_day_requests`(`target_user_id`);

-- CreateIndex
CREATE INDEX `off_day_requests_status_idx` ON `off_day_requests`(`status`);

-- AddForeignKey
ALTER TABLE `off_day_requests` ADD CONSTRAINT `off_day_requests_target_user_id_fkey` FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
