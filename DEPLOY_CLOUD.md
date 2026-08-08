# Panduan Deployment Cloud 100% GRATIS

Ikuti langkah-langkah ini untuk menjalankan aplikasi di internet, **tanpa biaya sama sekali**.

> **Rekomendasi**: Gunakan kombinasi **Render (backend) + Vercel (frontend) + TiDB Cloud (MySQL)** agar fitur upload foto, cron, dan filesystem bekerja optimal. Root `vercel.json` di repo ini hanya sebagai alternatif single-project; untuk operasional cafe lebih baik memisahkan backend dan frontend.

---

## Langkah 1: Buat Database Gratis di TiDB Cloud

1. Buka [tidbcloud.com](https://tidbcloud.com/) → Klik **Sign Up** (bisa pakai akun Google/GitHub).
2. Setelah masuk, klik **Create Cluster** → pilih **Serverless** (yang gratis).
3. Pilih region terdekat (misal: **Singapore**) → Klik **Create**.
4. Setelah cluster siap, klik **Connect** → pilih **General** → centang **Generate Password**.
5. **PENTING**: Salin dan simpan password yang muncul, karena hanya ditampilkan sekali!
6. Pilih framework **Prisma** di dropdown → Salin **connection string** yang diberikan.
   Format-nya akan seperti ini:
   ```
   mysql://[user]:[password]@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/test?sslaccept=strict
   ```
7. Ganti `/test` di URL menjadi `/absensi_cafe` (nama database Anda).
8. Simpan connection string ini untuk langkah 2 & 3.

---

## Langkah 2: Deploy Backend di Render.com

1. Buka [render.com](https://render.com/) → **Sign Up pakai akun GitHub**.
2. Klik **New** → **Web Service**.
3. Hubungkan repo GitHub **`absensi-cafe`**.
4. Atur konfigurasi:
   - **Name**: `absensi-cafe-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npx prisma generate`
   - **Start Command**: `npx prisma migrate deploy && node src/server.js`
   - **Instance Type**: **Free**
5. Klik **Environment** → tambahkan variabel (tombol kecil `+` / Add Environment Variable):
   - `DATABASE_URL` = *(tempel connection string TiDB dari Langkah 1)*
   - `JWT_SECRET` = `cafe_rahasia_absensi_2026_secure` *(ganti dengan string panjang & acak)*
   - `PORT` = `3100` *(Render bisa mengabaikan ini; `server.js` juga membaca `PORT`)*
   - `NODE_ENV` = `production`
   - `CORS_ALLOWED_ORIGINS` = *(kosongkan dulu, isi nanti setelah Vercel selesai)*
   - `CAFE_LATITUDE` = `-5.168772226471969`
   - `CAFE_LONGITUDE` = `119.45848536836249`
   - `CAFE_RADIUS` = `200`
6. Klik **Deploy**. Tunggu sampai selesai (5–10 menit).
7. Setelah selesai, salin **URL** yang diberikan Render (misal: `https://absensi-cafe-backend.onrender.com`).

> **Catatan**: Untuk menjalankan seed (data awal), buka tab **Shell** di Render → ketik:
> ```bash
> npx prisma db seed
> ```
> Jalankan **hanya sekali** setelah migrasi pertama berhasil.

---

## Langkah 3: Deploy Frontend di Vercel

1. Buka [vercel.com](https://vercel.com/) → **Login pakai akun GitHub**.
2. Klik **Add New** → **Project** → pilih repo **`absensi-cafe`**.
3. Atur:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `frontend`
4. Buka **Environment Variables**, tambahkan:
   - `VITE_API_URL` = `https://[URL-RENDER-ANDA]/api/v1`
   *(Contoh: `https://absensi-cafe-backend.onrender.com/api/v1`)*
5. Klik **Deploy**.

---

## Langkah 4: Update CORS di Render

Setelah Vercel memberikan URL (misal: `https://absensi-cafe.vercel.app`):
1. Kembali ke Render → layanan backend → tab **Environment**.
2. Update variabel `CORS_ALLOWED_ORIGINS` = `https://absensi-cafe.vercel.app`
3. Render akan auto-redeploy.

---

## Alternatif: Deploy Semua di Vercel Single Project

Repo ini juga menyediakan `vercel.json` di root yang bisa menjalankan frontend + backend + cron di satu project Vercel:

1. Import repo di Vercel, **Root Directory** biarkan `/` (root repo).
2. Di **Environment Variables** Vercel, tambahkan:
   - `DATABASE_URL` = *(connection string TiDB dari Langkah 1)*
   - `JWT_SECRET` = *(string acak panjang)*
   - `NODE_ENV` = `production`
3. Jalankan `npx prisma db seed` sekali melalui Vercel CLI / shell (atau panggil endpoint seed jika tersedia).

> ⚠️ **Keterbatasan Vercel Single Project**:
> - Filesystem serverless bersifat sementara, sehingga **foto clock-in/out dan bukti cuti tidak akan bertahan** antar-request.
> - Jika fitur foto penting, gunakan kombinasi **Render + Vercel** (di atas) atau integrasikan storage eksternal (Cloudinary, S3, dll.).
> - Pastikan `vercel.json` telah menjalankan `npx prisma migrate deploy` saat build.

---

## Selesai! 🎉

Buka URL Vercel Anda dari HP atau komputer manapun, lalu login:
- **Username**: `admin`
- **Password**: `admin123`

> ⚠️ **Catatan Free Tier Render**: Server akan "tidur" jika tidak ada akses selama 15 menit.
> Akses pertama setelah lama diam akan butuh ~30 detik untuk "bangun".
> Setelah itu normal kembali. Untuk pemakaian harian cafe, ini tidak masalah.
