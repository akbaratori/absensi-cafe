# Setup MySQL Cloud Gratis di Aiven.io untuk Deploy Vercel

Aiven menyediakan MySQL free tier (5 GB) tanpa kartu kredit. Ikuti langkah berikut untuk mendapatkan `DATABASE_URL` dan menyelesaikan deploy.

## 1. Daftar Akun Aiven
1. Buka https://aiven.io/ dan klik **Sign Up**.
2. Daftar dengan email/GitHub/Google. Verifikasi email Anda.
3. Pilih plan **Aiven for MySQL**.
4. Pilih cloud provider (AWS/Google Cloud/Azure) dan region terdekat dengan user Anda (misal `asia-southeast`).
5. Pilih plan **Hobbyist / Free** jika tersedia; jika tidak, pilih plan termurah yang memungkinkan free tier/credit.
6. Beri nama service: `absensi-cafe-mysql`.
7. Klik **Create Service**. Tunggu status menjadi **Running** (biasanya 1–3 menit).

## 2. Buat User MySQL Khusus Aplikasi (Opsional tapi Direkomendasikan)
Untuk keamanan, jangan gunakan `avnadmin` untuk aplikasi. Buat user terpisah dengan hak CRUD saja.

1. Di dashboard Aiven, klik service MySQL Anda.
2. Pilih menu **Users** di sidebar kiri.
3. Klik **Add user**.
4. Isi username, misal `absensi_app_user`.
5. Pilih metode autentikasi **MySQL native** (atau default).
6. Klik **Add user**. Aiven akan generate password.
7. Catat password yang muncul (hanya ditampilkan sekali). Jika hilang, klik **Reset password**.
8. Untuk memberi hak akses, buka tab **ACL** atau gunakan query SQL via MySQL client:
   ```sql
   GRANT SELECT, INSERT, UPDATE, DELETE ON defaultdb.* TO 'absensi_app_user'@'%';
   FLUSH PRIVILEGES;
   ```
   > Ganti `defaultdb` dengan nama database Anda jika berbeda.

## 3. Dapatkan DATABASE_URL
1. Di dashboard Aiven, klik service MySQL Anda.
2. Pilih tab **Overview** → bagian **Connection information**.
3. Pilih format **MySQL** (bukan PostgreSQL).
4. Salin nilai **Service URI** (URL akan seperti):
   ```
   mysql://avnadmin:YOUR_PASSWORD@absensi-cafe-mysql-akbaratori.aivencloud.com:12691/defaultdb?ssl-mode=REQUIRED
   ```
5. Ganti `avnadmin` dengan username yang baru Anda buat (misal `absensi_app_user`) dan `YOUR_PASSWORD` dengan password user tersebut.
6. Untuk Prisma, tambahkan parameter `sslaccept=strict` agar SSL diterima. Contoh final:
   ```
   mysql://absensi_app_user:PASSWORD@absensi-cafe-mysql-absensi-cafe.i.aivencloud.com:24470/defaultdb?sslaccept=strict
   ```
7. Catat URL ini; ini akan menjadi `DATABASE_URL` di Vercel.

## 4. Tambahkan Environment Variable di Vercel
1. Buka project Vercel Anda → tab **Settings** → **Environment Variables**.
2. Tambahkan variable:
   - `DATABASE_URL` = URL MySQL dari Aiven (pastikan tidak ada spasi di awal/akhir).
   - `JWT_SECRET` = string rahasia acak minimal 32 karakter (contoh: `super_secret_key_absensi_cafe_2024`).
   - `JWT_EXPIRES_IN` = `24h`.
   - `NODE_ENV` = `production`.
   - `CORS_ORIGIN` = URL frontend Vercel Anda, misal:
     ```
     https://absensi-cafe-git-main-akbaratoris-projects.vercel.app
     ```
3. Klik **Save**.

## 5. Redeploy Backend
1. Di Vercel Dashboard, klik tab **Deployments**.
2. Klik **...** (menu) pada deployment terbaru → **Redeploy** (pilih "Use existing Build Cache" boleh dicentang atau tidak, lebih baik tidak untuk memastikan build bersih).
3. Tunggu deploy selesai.

## 6. Jalankan Migrasi & Seed
Aiven tidak menyediakan shell MySQL gratis, jadi gunakan tool lokal untuk terhubung ke Aiven.

### Instal MySQL Client (jika belum ada)
- Windows: download dari https://dev.mysql.com/downloads/installer/ atau pakai XAMPP.
- Mac: `brew install mysql-client`.
- Linux: `sudo apt install mysql-client`.

### Jalankan Migrasi
Dari folder project lokal, jalankan:
```bash
cd backend
set DATABASE_URL=mysql://absensi_app_user:PASSWORD@HOST:PORT/defaultdb?sslaccept=strict
npx prisma migrate deploy
```
atau di terminal PowerShell:
```powershell
$env:DATABASE_URL="mysql://absensi_app_user:PASSWORD@HOST:PORT/defaultdb?sslaccept=strict"
cd backend
npx prisma migrate deploy
```

### Jalankan Seed SQL
Setelah migrasi sukses, jalankan file `backend/prisma/seed.sql` ke database Aiven:
```bash
mysql -h HOST -P PORT -u absensi_app_user -p defaultdb < backend/prisma/seed.sql
```
Password akan diminta setelah menekan Enter.

## 7. Uji Login
Buka URL frontend Vercel Anda dan coba login dengan:
- Username: `admin`, Password: `password123`
- Username: `employee`, Password: `password123`

Jika masih error, periksa log di Vercel Dashboard → **Functions** → `/api/v1/auth/login`.

## 8. Catatan Penting
- `backend/.env` tetap untuk lokal; jangan menulis `DATABASE_URL` Aiven di file tersebut (nanti ter-push ke GitHub).
- Jika URL Aiven mengandung karakter khusus di password, encode password dengan URL encode.
- Aiven free tier mungkin sleep setelah tidak aktif; cold-start pertama bisa sedikit lambat.
