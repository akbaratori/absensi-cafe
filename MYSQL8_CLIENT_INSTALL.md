# Install MySQL Client 8.x Asli di Windows (untuk Aiven MySQL 8.4)

MySQL client dari XAMPP biasanya berbasis MariaDB dan tidak support plugin `caching_sha2_password` yang digunakan MySQL 8.4. Oleh karena itu, Anda perlu menginstall MySQL client versi 8.x asli.

## Pilihan 1: MySQL Installer (Direkomendasikan)

1. Buka https://dev.mysql.com/downloads/installer/.
2. Download **Windows (x86, 32-bit), MSI Installer** (file kecil sekitar 20 MB).
3. Jalankan installer. Saat setup type, pilih **Custom**.
4. Pada daftar komponen, buka folder **MySQL Servers**, lalu pilih:
   - **MySQL Server 8.0.x** (bisa pilih yang versi 8.0 saja, tidak perlu dijalankan sebagai service).
5. Lalu buka folder **Applications**, pilih:
   - **MySQL Shell** (opsional, tapi berguna).
6. Klik **Next** → **Execute** untuk install.
7. Setelah install selesai, biarkan wizard konfigurasi selesai. Untuk server lokal, pilih **Standalone** atau **Skip** jika tidak ingin menjalankan server lokal.
8. Tambahkan folder `bin` ke PATH Windows:
   - Biasanya terletak di `C:\Program Files\MySQL\MySQL Server 8.0\bin`.
   - Tekan **Win + S**, ketik "environment variables" → pilih **Edit the system environment variables**.
   - Klik **Environment Variables** → di **System variables**, cari `Path` → klik **Edit** → **New** → paste path di atas → **OK**.
9. Tutup CMD/PowerShell yang lama, buka baru, lalu cek:
   ```cmd
   mysql --version
   ```
   Output yang diharapkan mirip:
   ```
   mysql  Ver 8.0.x for Win64 on x86_64 (MySQL Community Server - GPL)
   ```

## Pilihan 2: MySQL Community Server ZIP (Tanpa Installer)

1. Buka https://dev.mysql.com/downloads/mysql/.
2. Pilih **Windows (x86, 64-bit), ZIP Archive**.
3. Extract ke folder, misal `C:\mysql-8.0.x-winx64`.
4. Tambahkan `C:\mysql-8.0.x-winx64\bin` ke PATH Windows.
5. Buka CMD baru, cek:
   ```cmd
   mysql --version
   ```

## Pilihan 3: Winget (Windows 10/11)

Jika Anda pakai Windows 10/11 dan sudah aktif winget, jalankan di PowerShell sebagai Administrator:
```powershell
winget install Oracle.MySQL
```
Setelah selesai, tambahkan PATH jika belum otomatis, lalu cek versi:
```cmd
mysql --version
```

## Setelah MySQL Client 8.x Terinstall

Coba koneksi ke Aiven lagi dengan avnadmin:
```cmd
mysql -h absensi-cafe-mysql-absensi-cafe.i.aivencloud.com -P 24470 -u avnadmin -p
```
Jika masih error terkait SSL, tambahkan parameter `--ssl-mode=REQUIRED`:
```cmd
mysql -h absensi-cafe-mysql-absensi-cafe.i.aivencloud.com -P 24470 -u avnadmin -p --ssl-mode=REQUIRED
```

Setelah berhasil masuk, jalankan GRANT untuk user aplikasi:
```sql
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX ON defaultdb.* TO 'absensi_app_user'@'%';
FLUSH PRIVILEGES;
SHOW GRANTS FOR 'absensi_app_user'@'%';
EXIT;
```

## Catatan Penting
- MySQL client 8.x juga akan berguna untuk menjalankan seed SQL (`backend/prisma/seed.sql`) ke Aiven.
- Jika sebelumnya Anda menggunakan XAMPP/MySQL client berbasis MariaDB, wajib ganti ke MySQL client 8.x asli agar bisa terhubung ke Aiven MySQL 8.4.
- Jangan lupa untuk menonaktifkan MySQL Server lokal jika Anda tidak membutuhkannya, agar tidak bentrok dengan aplikasi lain.
