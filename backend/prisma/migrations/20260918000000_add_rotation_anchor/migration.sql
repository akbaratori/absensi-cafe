-- Titik acuan rotasi per posisi.
--
-- Sebelumnya index rotasi disimpan di `current_start_index` dan DIMARJUKAN
-- setiap kali generate dijalankan (`currentStartIndex + shift1Capacity`).
-- Karena itu generate ulang untuk minggu/bulan yang sama menukar Shift 1 <-> 2
-- tanpa ada data yang berubah, dan generate satu bulan menggeser minggu di
-- bulan sebelahnya.
--
-- Sekarang index rotasi DIHITUNG dari tanggal:
--   idx(monday) = (anchorIndex + jarakMinggu(anchorWeekStart, monday) * step) % totalRoster
-- sehingga generate bersifat idempoten.
--
-- Kedua kolom NULL untuk data lama; aplikasi akan mengisi anchor dari
-- `last_generated_week_start` + `current_start_index` yang sudah ada saat
-- generate berikutnya (lihat RotationService._resolveAnchor).
ALTER TABLE `rotation_states`
    ADD COLUMN `anchor_week_start` DATETIME(3) NULL,
    ADD COLUMN `anchor_index` INT NULL;
