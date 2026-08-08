# Memberi Hak Akses User MySQL di Aiven (Windows)

User `absensi_app_user` sudah dibuat di Aiven. Sekarang Anda perlu memberinya hak akses agar aplikasi Prisma bisa membaca dan menulis data.

## Cara Termudah: Gunakan MySQL Client 8.x Asli (Windows)

Aiven MySQL 8.4 menggunakan plugin `caching_sha2_password`. MySQL client dari XAMPP biasanya berbasis MariaDB dan tidak kompatibel. Oleh karena itu, wajib menggunakan MySQL client 8.x asli.

### 1. Cek apakah MySQL client 8.x asli sudah tersedia
Buka Command Prompt (CMD) atau PowerShell, lalu ketik:
```cmd
mysql --version
```
Output harus menunjukkan **MySQL Community Server 8.x**, bukan MariaDB. Jika sudah benar, lanjut ke langkah 3. Jika masih MariaDB atau error, lanjut ke langkah 2.

### 2. Install MySQL Client 8.x Asli di Windows
Pilih salah satu cara:

#### A. MySQL Installer (direkomendasikan)
1. Download dari https://dev.mysql.com/downloads/installer/.
2. Pilih **Windows (x86, 32-bit), MSI Installer**.
3. Jalankan installer, pilih **Custom**.
4. Centang **MySQL Server 8.0.x** dan **MySQL Client**.
5. Selesaikan instalasi. Jika tidak ingin server lokal berjalan, pilih konfigurasi **Skip** atau **Standalone** dan nonaktifkan service MySQL lokal setelahnya.
6. Tambahkan `C:\Program Files\MySQL\MySQL Server 8.0\bin` ke PATH Windows.
7. Tutup CMD/PowerShell lama, buka baru, lalu cek:
   ```cmd
   mysql --version
   ```

#### B. Winget (Windows 10/11)
Jika Anda pakai Windows 10/11, jalankan di PowerShell sebagai Administrator:
```powershell
winget install Oracle.MySQL
```
Tambahkan PATH jika belum otomatis, lalu cek:
```cmd
mysql --version
```

### 3. Hubungkan ke Aiven sebagai avnadmin
Buka CMD/PowerShell, lalu jalankan:
```cmd
mysql -h absensi-cafe-mysql-absensi-cafe.i.aivencloud.com -P 24470 -u avnadmin -p
```
Ketik password `avnadmin` saat diminta. Jika berhasil masuk, prompt akan berubah menjadi `mysql>`.

### 4. Berikan hak akses ke absensi_app_user
Setelah masuk, jalankan query berikut satu per satu:
```sql
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX ON defaultdb.* TO 'absensi_app_user'@'%';
FLUSH PRIVILEGES;
SHOW GRANTS FOR 'absensi_app_user'@'%';
```

> Catatan: `CREATE, ALTER, DROP, INDEX` dibutuhkan supaya Prisma bisa menjalankan `prisma migrate deploy`. Setelah aplikasi jalan, Anda bisa mencabut hak `CREATE, ALTER, DROP` jika diinginkan.

Jika berhasil, output terakhir akan menampilkan hak akses yang diberikan ke `absensi_app_user`.

### 5. Keluar dari MySQL client
```sql
EXIT;
```

## 5. Uji koneksi dengan user baru
```cmd
mysql -h absensi-cafe-mysql-absensi-cafe.i.aivencloud.com -P 24470 -u absensi_app_user -p
```
Masukkan password user `absensi_app_user`. Jika berhasil masuk, akses sudah benar.

## 6. Catat DATABASE_URL
Dari dashboard Aiven, salin Service URI, lalu ubah ke format user baru dan tambahkan `sslaccept=strict`:
```
mysql://absensi_app_user:PASSWORD@absensi-cafe-mysql-absensi-cafe.i.aivencloud.com:24470/defaultdb?sslaccept=strict
```
Ganti `PASSWORD` dengan password `absensi_app_user` yang sudah Anda catat. URL ini yang akan dimasukkan ke Environment Variables Vercel.

## Catatan Penting
- Jika password mengandung karakter seperti `@`, `#`, atau `?`, encode password terlebih dahulu. Contoh: `p@ss` menjadi `p%40ss`. Anda bisa gunakan online URL encoder.
- Jangan simpan `DATABASE_URL` Aiven di `backend/.env` agar tidak ter-push ke GitHub.
- Setelah deploy, jalankan `npx prisma migrate deploy` dari lokal untuk membuat tabel, lalu seed SQL untuk membuat akun admin/employee.
