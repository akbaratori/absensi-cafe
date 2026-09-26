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

## 9. Rekap Absensi Seluruh Pegawai (Periode Bebas)

Menu **Admin → Rekap Absensi** (`/admin/attendance-recap`) merangkum kehadiran *semua* pegawai
sekali jalan untuk periode apa pun. Satu respons backend menopang seluruh tampilan, sehingga
angka di kartu ringkasan, tabel pegawai, dan sebaran harian tidak mungkin berbeda.

Cara memilih periode:

| Pilihan di UI     | Query yang dikirim        | Arti                        |
| ----------------- | ------------------------- | --------------------------- |
| Hari ini          | `date=YYYY-MM-DD`         | satu tanggal (WITA)         |
| 7 hari            | `start=…&end=…`           | 7 hari terakhir inklusif    |
| Bulan ini / lalu  | `month=YYYY-MM`           | satu bulan penuh            |
| Rentang bebas     | `start=…&end=…`           | bebas, maksimum 366 hari    |
| (tanpa parameter) | –                         | awal bulan ini s/d hari ini |

Endpoint: `GET /api/v1/admin/reports/recap` — **hanya ADMIN** (401 tanpa token, 403 non-admin).

Filter opsional: `userId` (satu pegawai) dan `department` (satu departemen). Presedensi bila
beberapa parameter diisi bersamaan: `start`/`end` → `month` → `date`.

Isi balasan (`data`):

- `period` — `{ start, end, days }`, tepi rentang **inklusif**;
- `summary` — total pegawai, hadir/telat/setengah hari/absen, total jam kerja, total menit
  telat, hari tanpa absen pulang, hari cuti, jumlah tanggal yang ada aktivitas;
- `employees[]` — satu baris per pegawai: `presentDays` (tanggal unik), `present`, `late`,
  `halfDay`, `absent`, `onLeaveDays`, `totalHours`, `avgHoursPerPresentDay`, `lateMinutes`,
  `daysWithoutClockOut`, `attendanceRate`;
- `daily[]` — satu baris per tanggal (termasuk yang kosong) plus penanda `isHoliday`;
- `holidays[]`, `departments[]`, `staffOptions[]` — untuk mengisi filter/kalender di UI.

Catatan rumus:

- `presentDays` = jumlah **tanggal unik** yang punya absensi; satu pegawai dihitung sekali
  per hari walau ada lebih dari satu baris absensi.
- `totalHours` hanya menjumlahkan hari yang sudah absen pulang — hari tanpa `clockOut`
  tetap dihitung di `daysWithoutClockOut` supaya jamnya tidak "ditagih" padahal belum lengkap.
- `attendanceRate` = `presentDays ÷ (presentDays + onLeaveDays)`. Hari libur jadwal tidak
  punya baris absensi, jadi tidak menurunkan persentase. Bernilai `null` bila tidak ada
  hari kerja efektif sama sekali.
- Rentang ngawur (`start` > `end`, format salah, atau > 366 hari) dibalas `400`
  `INVALID_DATE_RANGE`, bukan `500`.

## 10. Ikon PWA

`manifest.json` mendeklarasikan ikon sebagai `image/png`, jadi berkasnya wajib PNG
asli. Kalau isinya SVG (walau namanya `.png`), Chrome menolak dan muncul:

```
Error while trying to use the following icon from the Manifest:
/icons/icon-192x192.png (Download error or resource isn't a valid image)
```

Ikon dibuat ulang tanpa dependensi tambahan (hanya modul `zlib` bawaan Python,
tanpa Pillow/ImageMagick):

```bash
cd frontend
python scripts/make-pwa-icons.py
```

Skrip itu menulis ulang `icon-72x72.png`, `icon-192x192.png`, `icon-512x512.png`,
dan `badge-72x72.png` (dipakai `sw.js` untuk badge notifikasi). Versi `.svg`
tetap disimpan dan dipakai sebagai favicon di `index.html`.

## Bantuan
Jika ada kendala (Error), cek log di terminal backend atau hubungi teknisi.
