-- AlterTable users: tambahkan kolom telegram_user_id
-- Kolom ini sudah ada di schema.prisma sejak lama dan sudah ada secara fisik di
-- produksi, tetapi TIDAK pernah dibuat oleh migrasi mana pun (kemungkinan
-- ditambahkan lewat `db push`/manual). Akibatnya database yang dibangun dari
-- `prisma migrate deploy` tidak punya kolom ini, sehingga setiap query ke
-- `users` gagal: "The column <db>.users.telegram_user_id does not exist".
--
-- Tipe disamakan dengan yang ada di produksi: varchar(191) NULL.
-- Tidak memakai IF NOT EXISTS (sintaks MariaDB, gagal di MySQL).
ALTER TABLE `users`
    ADD COLUMN `telegram_user_id` VARCHAR(191) NULL;
