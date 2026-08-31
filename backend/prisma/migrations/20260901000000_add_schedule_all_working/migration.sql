-- Tambahkan saklar per-posisi: jadwalkan semua orang roster yang tidak libur
-- (formasi fleksibel, kapasitas tidak memotong). Dipakai posisi Kitchen.
-- Database production: MySQL.
ALTER TABLE `positions`
  ADD COLUMN `schedule_all_working` BOOLEAN NOT NULL DEFAULT false;
