# Panduan Deployment Absensi Cafe

Panduan ini akan membantu Anda menjalankan aplikasi Absensi Cafe di komputer atau server lokal Anda.

## 1. Persiapan Awal
Pastikan komputer Anda sudah terinstall:
- [Node.js](https://nodejs.org/) (Versi 18 atau terbaru)
- [MySQL](https://dev.mysql.com/downloads/installer/) (Database)
- [Git](https://git-scm.com/)

## 2. Instalasi Database
1. Buka MySQL Workbench atau terminal MySQL.
2. Buat database baru bernama `absensi_cafe`.
   ```sql
   CREATE DATABASE absensi_cafe;
   ```

## 3. Konfigurasi Backend
1. Masuk ke folder backend: `cd backend`
2. File `.env` sudah tersedia. Buka dan sesuaikan `DATABASE_URL` sesuai user/password MySQL Anda:
   ```env
   PORT=3001
   DATABASE_URL="mysql://root:password@localhost:3306/absensi_cafe"
   JWT_SECRET="rahasia_dapur_cafe_anda_yang_aman"
   CORS_ALLOWED_ORIGINS="http://localhost:5173,http://localhost:3000"
   ```
   *Ganti `root:password` dengan user dan password MySQL Anda.*

## 4. Instalasi dan Menjalankan Aplikasi
Anda bisa menggunakan skrip otomatis yang sudah disediakan.

### Jika menggunakan Windows (PowerShell):
Buka terminal PowerShell sebagai Administrator, lalu jalankan:
```powershell
./deploy.ps1
```

### Jika manual:
**Backend:**
```bash
cd backend
npm install
npx prisma migrate deploy
npx prisma db seed
npm start
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## 5. Login Pertama Kali
Setelah aplikasi berjalan, buka browser dan akses `http://localhost:5173` (atau port yang tertera).

Gunakan akun Administrator default:
- **Username:** `admin`
- **Password:** `admin123`

## 6. Pengaturan Penting (Wajib!)
Segera setelah login, masuk ke menu **Pengaturan (Settings)** untuk:
1. **Ubah Lokasi Cafe**: Masukkan koordinat Latitude dan Longitude cafe Anda agar karyawan bisa absen (Geofencing).
   - *Tips: Buka Google Maps, klik kanan lokasi cafe Anda untuk melihat koordinat.*
2. **Atur Jam Kerja**: Sesuaikan jam masuk dan pulang.
3. **Ubah Password**: Ganti password admin default demi keamanan.

## 7. Fitur Baru: Gaji (Payroll)
Masuk ke menu **Payroll** untuk melihat estimasi gaji karyawan.
- Pastikan Anda sudah mengatur `Hourly Rate` (Tarif per jam) untuk setiap karyawan di menu **Pengguna**.
- Gaji dihitung otomatis berdasarkan jam kerja (Clock In - Clock Out).

## 8. Laporan Absensi Harian ke WhatsApp

Backend mengirim sendiri laporan harian (judulnya **LAPORAN ABSENSI HARIAN CAFE**) ke grup
WhatsApp, jadi cron cukup menembak satu endpoint — pesan yang diterima pegawai tidak lagi
membawa header teknis seperti `Cronjob Response: laporan-absensi-harian` / `(job_id: ...)`.

1. Set environment di server (selain `FONNTE_TOKEN` dan `WA_GROUP_TARGET` yang sudah ada):
   ```env
   CRON_SECRET="kunci-acak-panjang-anda"
   ```
2. Daftarkan cron harian, misalnya pukul **23:55 WITA (15:55 UTC)**:
   ```
   POST https://<domain-anda>/api/v1/attendance/cron/daily-report
   Header : Authorization: Bearer <CRON_SECRET>
   Body   : { "date": "2026-09-26", "target": "628xxx@g.us" }   // keduanya opsional
   ```
   - Tanpa `date`, tanggal diambil dari WITA (UTC+8), bukan jam server.
   - Tanpa `target`, tujuan memakai `waGroupTarget` dari Pengaturan atau `WA_GROUP_TARGET`.
   - Balasan `200` = terkirim, `502` = laporan dibuat tetapi pengiriman gagal,
     `401` = `CRON_SECRET` tidak cocok, `503` = `CRON_SECRET` belum diset.
3. Kalau layanan cron tetap dikonfigurasi mem-forward isi respon ke WhatsApp, header
   `Cronjob Response:` / `(job_id: ...)` otomatis dipotong sebelum pesan dikirim
   (`whatsappService.stripCronNoise`), sehingga isi pesan tetap langsung ke inti.

## Bantuan
Jika ada kendala (Error), cek log di terminal backend atau hubungi teknisi.
