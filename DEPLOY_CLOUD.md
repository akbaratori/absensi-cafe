# Panduan Deployment Cloud (Online 24/7)

Ikuti langkah-langkah ini untuk menjalankan aplikasi Anda di internet agar bisa diakses kapan saja dari mana saja.

## 1. Persiapan Akun & Kode
1. **GitHub**: Buat akun di [github.com](https://github.com/) dan upload folder proyek Anda ke sana.
2. **Railway**: Buat akun di [railway.app](https://railway.app/).
3. **Vercel**: Buat akun di [vercel.com](https://vercel.com/).

## 2. Deployment Database & Backend (di Railway)
1. Klik **"New Project"** -> **"Provision MySQL"**.
2. Setelah MySQL muncul, klik tab **"Variables"** dan salin `MYSQL_URL`.
3. Klik **"New"** -> **"GitHub Repo"** -> pilih repo Anda.
   - Atur **Root Directory** ke `/backend`.
4. Di bagian **Variables** untuk layanan backend, tambahkan:
   - `DATABASE_URL`: (Tempel `MYSQL_URL` dari langkah 2)
   - `JWT_SECRET`: (Buat kata kunci acak, misal: `cafe_rahasia_123`)
   - `PORT`: `3001`
5. Railway akan otomatis menjalankan server. Anda akan mendapatkan URL backend (misal: `backend-production.up.railway.app`).

## 3. Deployment Frontend (di Vercel)
1. Di Vercel, klik **"Add New"** -> **"Project"**.
2. Pilih repo GitHub Anda.
3. Di bagian **Framework Preset**, pilih **Vite**.
4. Di bagian **Root Directory**, pilih `/frontend`.
5. Di bagian **Environment Variables**, tambahkan:
   - `VITE_API_URL`: (Tempel URL backend dari Railway, misal: `https://backend-production.up.railway.app`)
6. Klik **Deploy**.

## 4. Konfigurasi Setelah Online
Setelah Vercel memberikan URL (misal: `absensi-cafe.vercel.app`), Anda bisa membukanya melalui HP.

> [!WARNING]
> Karena database baru kosong di Cloud, Anda perlu menjalankan migrasi pertama kali. Di terminal Railway (atau via laptop yang terhubung ke DB cloud):
> ```bash
> npx prisma migrate deploy
> npx prisma db seed
> ```

## 5. Keuntungan Deployment Ini
- **Tanpa Laptop**: Aplikasi tetap berjalan walau laptop Anda mati.
- **Akses HP**: Karyawan bisa absen langsung dari HP masing-masing di lokasi cafe.
- **Gratis/Murah**: Untuk operasional awal cafe, biaya biasanya sangat minim atau gratis.
