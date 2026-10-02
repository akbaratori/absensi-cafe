-- AlterTable: tambah kolom mode untuk membedakan tukar libur berpasangan (PAIR)
-- dengan pindah hari libur mandiri tanpa rekan (SOLO). Baris lama (termasuk
-- legacy targetUserId NULL) dianggap 'PAIR'.
ALTER TABLE `off_day_requests` ADD COLUMN `mode` VARCHAR(16) NOT NULL DEFAULT 'PAIR';