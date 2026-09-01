-- AlterTable: perbesar rejection_note agar pesan error gabungan tidak terpotong`nALTER TABLE `shift_swaps` MODIFY COLUMN `rejection_note` TEXT NULL;`nALTER TABLE `off_day_requests` MODIFY COLUMN `rejection_note` TEXT NULL;

-- AlterTable: perbesar kolom message notifikasi agar pesan gabungan tidak melebihi VARCHAR(191)
ALTER TABLE `notifications` MODIFY COLUMN `message` TEXT NOT NULL;