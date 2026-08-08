# Panduan Perbaikan Deploy (Login 400 Bad Request)

## Masalah
Login mengembalikan `400 Bad Request` karena backend yang di-deploy masih menggunakan Prisma client hasil generate untuk **SQLite**, sementara kode aplikasi di Vercel tidak mendapatkan `DATABASE_URL` dan `datasource` schema juga masih `sqlite`.

## Perbaikan yang Sudah Dilakukan
1. **Prisma schema** diubah dari `sqlite` ke `mysql` (`backend/prisma/schema.prisma`).
2. **Prisma CLI** diselaraskan dengan `@prisma/client` 5.22.0 (`prisma@5.22.0` di-install sebagai devDependency di backend).
3. **Prisma Client** sudah di-regenerate untuk MySQL.
4. **Vercel config** (`vercel.json`) diperbarui:
   - `buildCommand` sekarang `prisma generate` lalu `prisma migrate deploy`.
   - `includeFiles` menyertakan `migrations/**` dan `schema.prisma`.
5. **Entry point serverless** (`api/index.js`) memastikan `NODE_ENV=production` dan memeriksa `DATABASE_URL`.
6. **Backend config** (`backend/src/config/index.js`) menolak produksi tanpa `DATABASE_URL` dan tetap menghormati `JWT_EXPIRES_IN`.
7. **Seed SQL** dibuat di `backend/prisma/seed.sql` untuk membuat akun admin/employee contoh.
8. **Frontend build** berhasil (`frontend/dist` sudah ter-generate).

## Langkah Deploy ke Vercel
1. **Pastikan repo di-push ke GitHub** (branch `main`).
2. **Import project di Vercel** dengan root directory = `d:\Cafe\absensi-cafe-master` (repo root, bukan `frontend` atau `backend`).
3. **Tambahkan Environment Variables** di Vercel Dashboard (tab Environment Variables):
   - `DATABASE_URL` = URL MySQL Anda, contoh:
     ```
     mysql://username:password@host:port/database_name
     ```
     (untuk PlanetScale/Render biasanya pakai `?sslaccept=strict` atau `ssl` params).
   - `JWT_SECRET` = string rahasia acak minimal 32 karakter.
   - `JWT_EXPIRES_IN` = `24h` (atau sesuai kebutuhan).
   - `NODE_ENV` = `production`.
   - `CORS_ORIGIN` = URL frontend Vercel Anda, contoh: `https://absensi-cafe-git-main-akbaratoris-projects.vercel.app`.
4. **Deploy**.
5. Setelah deploy berhasil, **jalankan migrasi & seed** untuk database MySQL Anda:
   - Jika Vercel build sudah menjalankan `migrate deploy`, tabel sudah terbuat.
   - Jalankan seed SQL di `backend/prisma/seed.sql` ke database MySQL Anda (bisa via phpMyAdmin, MySQL Workbench, atau CLI).
6. **Uji login** dengan akun:
   - Username: `admin`, Password: `password123`
   - Username: `employee`, Password: `password123`

## Catatan Penting
- `backend/.env` diatur untuk lokal MySQL (`mysql://root:password@localhost:3306/absensi_cafe`). Untuk produksi, **jangan** mengubah file `.env` lokal; gunakan Environment Variables Vercel.
- Jika sebelumnya di Vercel sudah pernah deploy dengan Prisma client SQLite, lakukan **Redeploy** (bukan hanya Rebuild) agar fungsi serverless di-update.
- Icon manifest error (`icon-192x192.png`) tidak terkait masalah login; perbaiki file PNG di `frontend/public/icons/` jika diperlukan.

## Verifikasi Lokal (Opsional)
Jika ingin menguji lokal, pastikan MySQL lokal berjalan dan database `absensi_cafe` sudah ada, lalu:
```bash
cd backend
npx prisma migrate deploy --schema=backend/prisma/schema.prisma
# lalu jalankan seed.sql di MySQL
npm run dev
```
