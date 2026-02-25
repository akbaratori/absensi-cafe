# Panduan Deployment Cloud 100% GRATIS

Ikuti langkah-langkah ini untuk menjalankan aplikasi di internet, **tanpa biaya sama sekali**.

| Layanan | Fungsi | Biaya |
|---------|--------|-------|
| [Vercel](https://vercel.com) | Frontend React | Gratis |
| [Render.com](https://render.com) | Backend Node.js | Gratis |
| [TiDB Cloud](https://tidbcloud.com) | Database MySQL | Gratis (5GB) |

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
5. Klik **Environment** → tambahkan variabel:
   - `DATABASE_URL` = *(tempel connection string dari TiDB langkah 1)*
   - `JWT_SECRET` = `cafe_rahasia_absensi_2026_secure`
   - `PORT` = `3100`
   - `NODE_ENV` = `production`
   - `CORS_ALLOWED_ORIGINS` = *(kosongkan dulu, isi nanti setelah Vercel)*
   - `CAFE_LATITUDE` = `-5.168772226471969`
   - `CAFE_LONGITUDE` = `119.45848536836249`
   - `CAFE_RADIUS` = `200`
6. Klik **Deploy**. Tunggu sampai selesai (5-10 menit).
7. Setelah selesai, salin **URL** yang diberikan Render (misal: `https://absensi-cafe-backend.onrender.com`).

> **Catatan**: Untuk menjalankan seed (data awal), buka tab **Shell** di Render → ketik `npx prisma db seed`.

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

## Selesai! 🎉

Buka URL Vercel Anda dari HP atau komputer manapun, lalu login:
- **Username**: `admin`
- **Password**: `admin123`

> ⚠️ **Catatan Free Tier Render**: Server akan "tidur" jika tidak ada akses selama 15 menit.
> Akses pertama setelah lama diam akan butuh ~30 detik untuk "bangun".
> Setelah itu normal kembali. Untuk pemakaian harian cafe, ini tidak masalah.
