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
2. Salin file `.env.example` menjadi `.env` (atau buat file baru).
3. Isi konfigurasi berikut:
   ```env
   PORT=3001
   DATABASE_URL="mysql://root:password@localhost:3306/absensi_cafe"
   JWT_SECRET="rahasia_dapur_cafe_anda_yang_aman"
   CORS_ALLOWED_ORIGINS="http://localhost:5173,http://localhost:3000"
   ```
   *Sesuaikan `root:password` dengan user dan password MySQL Anda.*

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

## Bantuan
Jika ada kendala (Error), cek log di terminal backend atau hubungi teknisi.
