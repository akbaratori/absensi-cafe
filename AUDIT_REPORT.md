# 🔍 LAPORAN AUDIT SISTEM ABSENSI CAFE

**Tanggal Audit:** 10 Juni 2026  
**Auditor:** Senior HRIS Engineer / Workforce Management Consultant / QA Auditor / Senior Software Architect  
**Scope:** Backend System (Express.js + Prisma + MySQL)  
**Timezone Operasional:** WITA (UTC+8)

---

## RINGKASAN EKSEKUTIF

Sistem absensi ini memiliki arsitektur yang solid untuk operasional cafe dengan fitur manajemen shift, geofencing, dan pengelolaan jadwal dapur yang cukup advanced. Namun, terdapat **26 temuan** dengan berbagai tingkat keparahan yang perlu ditindaklanjuti, termasuk **4 Critical**, **9 High**, **8 Medium**, dan **5 Low**.

---

## 1. JADWAL KERJA (Schedule Management)

### 1.1 Pembuatan Jadwal

| # | Temuan | Risiko | Dampak Bisnis | Severity |
|---|--------|--------|---------------|----------|
| 1 | **Tidak ada validasi tumpang tindih shift saat generate jadwal** — `generateSchedule()` melakukan upsert tanpa cek apakah user sudah punya jadwal manual override pada tanggal tersebut. Meskipun `isManualOverride` flag melindungi dari `distributeKitchenShifts`, fungsi `generateSchedule` reguler akan overwrite jadwal manual. | Jadwal yang sudah diedit admin bisa ter-overwrite | Karyawan datang pada shift yang salah | **High** |
| 2 | **Bulk generate (`bulkGenerateSchedule`) menggunakan `user.offDay` yang bisa undefined** — Jika user tidak punya field offDay, kondisi `user.offDay !== undefined` akan gagal karena di Prisma schema `offDay` default 0. Namun, jika data legacy tidak memiliki nilai, `dayOfWeek === undefined` selalu false = tidak pernah libur. | Karyawan mungkin dijadwalkan kerja 7 hari tanpa libur | Pelanggaran hak kerja, kelelahan karyawan | **Medium** |
| 3 | **Rotasi hari libur (`rotateOffDay`) menggeser hari libur setiap bulan tapi tidak memeriksa konflik departemen secara proaktif** — `checkConflicts` tersedia tapi TIDAK dipanggil secara otomatis saat `generateSchedule` berjalan. | Semua karyawan satu departemen bisa libur di hari yang sama | Café tidak bisa beroperasi karena kekurangan staf | **High** |

### 1.2 Shift Lintas Hari (Cross-Midnight)

| # | Temuan | Risiko | Dampak Bisnis | Severity |
|---|--------|--------|---------------|----------|
| 4 | **Shift 2 berakhir jam 23:00 — belum ada handling untuk shift melewati tengah malam** — Shift saat ini didefinisikan sebagai `startTime: "11:15", endTime: "23:00"`. Jika di masa depan ditambahkan shift malam (misal 22:00-06:00), seluruh logika `calculateAttendanceStatus`, `findTodayByUserId`, dan perhitungan jam kerja akan **break** karena `date` field menggunakan tanggal clock-in, bukan tanggal jadwal. | Sistem tidak mendukung shift malam | Jika shift malam ditambahkan: salah hitung kehadiran, salah tanggal | **Medium** |

### 1.3 Jadwal Kitchen (Distribusi Shift Dapur)

| # | Temuan | Risiko | Dampak Bisnis | Severity |
|---|--------|--------|---------------|----------|
| 5 | **`distributeKitchenShifts` menggunakan `current.getDay()` (local time) sedangkan jadwal disimpan sebagai UTC Date** — Di MySQL, `@db.Date` menyimpan sebagai tanggal saja tanpa timezone. Namun query menggunakan `new Date()` yang timezone-dependent. Jika server berjalan di timezone berbeda (misal UTC di cloud), `getDay()` bisa salah 1 hari. | Penentuan hari libur karyawan kitchen salah | Karyawan masuk di hari libur atau tidak masuk di hari kerja | **High** |

---

## 2. CHECK-IN (Clock In)

| # | Temuan | Risiko | Dampak Bisnis | Severity |
|---|--------|--------|---------------|----------|
| 6 | **Double check-in dicegah oleh `findTodayByUserId` — TAPI menggunakan WITA date range, sementara `date` di record disimpan sebagai `clockInTime` (UTC full timestamp)** — `findTodayByUserId` mencari dengan range `00:00:00+08:00` s/d `23:59:59+08:00`, dan `create` menyimpan `date: clockInTime` (UTC timestamp). Jika karyawan clock-in tepat di boundary (misal 23:59 WITA → record disimpan), lalu keesokan harinya jam 00:01 WITA ingin clock-in, query bisa menemukan record "kemarin" karena `@@unique([userId, date])` di Prisma menggunakan DateTime (bukan Date). | Kemungkinan kecil tapi ada potensi: (a) gagal clock-in karena false positive "already clocked in", atau (b) bisa double clock-in pada kasus edge | Data absensi ganda atau gagal absensi | **Critical** |
| 7 | **Check-in pada hari libur (Off Day) dicek DUA KALI dengan logika berbeda** — Pertama oleh `offDayService.isOffDay()` (static user.offDay + OffDayRequest), kemudian oleh `scheduleService.getTodaySchedule()` (dynamic UserSchedule). Kedua source of truth BISA KONFLIK jika admin mengubah jadwal tapi OffDayRequest yang lama masih Approved. | Karyawan yang seharusnya libur bisa masuk (atau sebaliknya) | Data kehadiran tidak konsisten, konflik jadwal | **High** |
| 8 | **Geofencing bisa di-bypass jika `location` tidak dikirim** — Code: `if (location && location.latitude && location.longitude) { ... }` — jika client tidak mengirim location, validasi di-skip completely tanpa error. | Karyawan bisa clock-in dari mana saja tanpa mengirim lokasi | Manipulasi kehadiran, fraud absensi | **Critical** |
| 9 | **Check-in tanpa jadwal (schedule kosong) tetap diizinkan** — Jika `getTodaySchedule` return `null` dan user tidak punya swap aktif, sistem fallback ke `user.shift`. Jika user juga tidak punya default shift (`shiftId: null`), config tetap menggunakan default `08:00`/`17:00`. Clock-in tetap diterima. | Karyawan tanpa jadwal bisa tetap clock-in | Inkonsistensi data: ada record kehadiran tapi tidak ada jadwal | **Medium** |
| 10 | **IP Address tidak divalidasi** — `req.ip` dicatat tapi tidak digunakan untuk deteksi anomali (misal clock-in dari IP berbeda dalam waktu singkat). | Tidak ada deteksi manipulasi via VPN/proxy | Karyawan bisa meminta orang lain clock-in dari perangkat berbeda | **Low** |

---

## 3. CHECK-OUT (Clock Out)

| # | Temuan | Risiko | Dampak Bisnis | Severity |
|---|--------|--------|---------------|----------|
| 11 | **Tidak ada mekanisme Auto Clock-Out yang terimplementasi** — Config `autoClockoutHours` disimpan dan di-parse, tetapi TIDAK ADA scheduler/cron job yang menjalankan auto-clockout. Karyawan yang lupa clock-out akan selamanya memiliki record tanpa `clockOut`. | Karyawan yang lupa clock-out tidak pernah ter-handle | Total jam kerja null, payroll salah hitung, record menggantung selamanya | **Critical** |
| 12 | **Clock-out tidak memvalidasi durasi minimum atau maximum** — Jika karyawan clock-in jam 08:00 lalu clock-out jam 08:01 (1 menit), sistem tetap menerima. Begitu juga jika clock-out terjadi 20+ jam setelah clock-in. | Durasi kerja tidak realistis tercatat | Payroll bisa under/over-calculate, data tidak reliable | **Medium** |
| 13 | **Clock-out tidak menggunakan geofencing** — Berbeda dengan clock-in yang memvalidasi lokasi, `clockOut` hanya menyimpan lokasi tanpa validasi jarak. | Karyawan bisa clock-out dari mana saja | Tidak bisa memverifikasi karyawan masih di lokasi kerja saat pulang | **Low** |
| 14 | **Admin `updateAdmin` bisa menghasilkan `clockOut < clockIn` pada tanggal yang sama tanpa warning** — Validasi hanya menolak jika `clockInDate === clockOutDate` DAN `clockOut < clockIn`. Tapi jika admin hanya mengupdate `clockOut` tanpa `clockIn`, validasi dilewati (karena `updates.clockIn` undefined). | Admin bisa secara tidak sengaja set clockOut sebelum clockIn | Durasi kerja negatif, error pada kalkulasi payroll | **Medium** |

---

## 4. KETERLAMBATAN (Lateness)

| # | Temuan | Risiko | Dampak Bisnis | Severity |
|---|--------|--------|---------------|----------|
| 15 | **`calculateAttendanceStatus` menggunakan `config.workStartTime` yang bisa berasal dari 3 sumber berbeda** — Priority: Swap Shift > UserSchedule > User Default > System Config. Jika ada race condition atau data stale, status bisa salah. | Status LATE/PRESENT bisa salah jika sumber data shift berubah | Karyawan dianggap terlambat padahal tepat waktu (atau sebaliknya) | **Medium** |
| 16 | **Grace period Ramadhan hardcoded 15 menit (14:00 → 14:15)** — Logic: `if (hours === 14 && minutes === 0)` — ini hanya bekerja jika shift start PERSIS 14:00. Jika shift Ramadhan diubah menjadi 14:30 atau 13:00, hardcode ini menjadi dead code atau conflict. | Perubahan jadwal Ramadhan tidak otomatis terakomodasi | Kalkulasi keterlambatan salah saat Ramadhan | **Low** |
| 17 | **Tidak ada perhitungan MENIT keterlambatan** — Status hanya binary: `PRESENT` atau `LATE`. Tidak ada tracking berapa menit terlambat. Ini menyulitkan kebijakan potongan bertingkat (misal: 1-15 menit toleransi, 16-30 menit potongan X, >30 menit potongan Y). | Tidak bisa menerapkan kebijakan potongan keterlambatan granular | Sistem tidak mendukung skema penalti bertingkat | **Medium** |

---

## 5. LEMBUR (Overtime)

| # | Temuan | Risiko | Dampak Bisnis | Severity |
|---|--------|--------|---------------|----------|
| 18 | **TIDAK ADA sistem perhitungan lembur sama sekali** — Tidak ada model, service, atau kalkulasi yang membedakan jam kerja normal vs lembur. Payroll hanya menghitung `totalHours × hourlyRate` flat. | Karyawan yang kerja lebih dari jam normal tidak mendapat kompensasi lembur | Pelanggaran regulasi ketenagakerjaan, ketidakpuasan karyawan | **High** |
| 19 | **Tidak ada persetujuan/approval lembur** — Karena lembur tidak ditrack, tidak ada mekanisme untuk approve/reject request lembur sebelum dikerjakan. | Tidak bisa mengontrol biaya lembur | Budget tak terkendali jika lembur dibayar | **High** |

---

## 6. REKAP KEHADIRAN (Attendance Summary)

| # | Temuan | Risiko | Dampak Bisnis | Severity |
|---|--------|--------|---------------|----------|
| 20 | **`getDailySummary` menghitung `notClockedIn = totalEmployees - records.length` TANPA mempertimbangkan Off Day, Cuti, dan Izin** — Karyawan yang libur/cuti/izin dihitung sebagai "not clocked in" padahal seharusnya dikecualikan. | Angka "Belum Absen" di dashboard selalu lebih besar dari seharusnya | Dashboard menyesatkan, admin panik karena banyak yang "belum masuk" padahal memang libur | **High** |
| 21 | **Tidak ada pengecekan status ganda pada satu hari** — Database memiliki `@@unique([userId, date])` pada Attendance, TAPI `date` disimpan sebagai DateTime (bukan Date). Dua record pada "hari yang sama" secara WITA bisa memiliki timestamp DateTime berbeda. | Sangat kecil kemungkinannya karena `findTodayByUserId` memakai range query, tapi secara skema masih mungkin | Satu karyawan memiliki >1 record dalam 1 hari | **Low** |

---

## 7. DASHBOARD

| # | Temuan | Risiko | Dampak Bisnis | Severity |
|---|--------|--------|---------------|----------|
| 22 | **Dashboard `getDashboardStats` menggunakan `new Date().toLocaleDateString('en-CA')` (local server time)** — Jika server ada di timezone UTC (cloud deployment), "today" bisa berbeda dari "hari ini" di WITA. Inkonsistensi dengan `findTodayByUserId` yang memakai WITA offset manual. | Dashboard menampilkan data tanggal yang salah jika server di timezone berbeda | Angka dashboard tidak sesuai realita, decision-making error | **High** |
| - | **Persentase kehadiran tidak tersedia** — Dashboard hanya menampilkan count (present/late/absent) tanpa percentage. | UX issue | Admin sulit assess situasi secara cepat | **Low** |

---

## 8. PENGGAJIAN (Payroll)

| # | Temuan | Risiko | Dampak Bisnis | Severity |
|---|--------|--------|---------------|----------|
| 23 | **Payroll TIDAK memotong keterlambatan** — `PayrollService.calculatePayroll()` hanya menghitung `totalHours × hourlyRate`. Variabel `lateCount` dihitung tapi TIDAK digunakan untuk potongan. | Tidak ada konsekuensi finansial untuk keterlambatan | Karyawan tidak ada insentif untuk tepat waktu, kerugian operasional | **High** |
| 24 | **Payroll menghitung jam kerja dari record TANPA clockOut sebagai 0** — Hanya record dengan `clockIn && clockOut` yang dihitung (`totalDays++`). Karyawan yang lupa clock-out kehilangan seluruh hari kerja di payroll. | Hari kerja tanpa clock-out = 0 rupiah | Karyawan dirugikan secara signifikan karena lupa clock-out | **Critical** |
| 25 | **Tidak ada potongan untuk Alpha (tidak hadir tanpa keterangan)** — Record Alpha bahkan tidak otomatis dibuat. Jika karyawan tidak clock-in, TIDAK ADA record di database. Payroll hanya menghitung "hari yang ada record"-nya. | Alpha tidak terdeteksi dan tidak berpengaruh ke payroll | Karyawan bisa bolos tanpa konsekuensi | **High** |

---

## 9. AUDIT KEAMANAN (Security)

| # | Temuan | Risiko | Dampak Bisnis | Severity |
|---|--------|--------|---------------|----------|
| 26 | **Model `AuditLog` ada di schema tapi TIDAK PERNAH digunakan** — Tidak ada satupun file yang menulis ke `AuditLog`. Admin bisa edit/delete attendance record tanpa jejak. | Perubahan data oleh admin tidak tercatat | Tidak bisa trace siapa mengubah apa dan kapan, potensi manipulasi | **Critical** (untuk compliance) |

**Temuan Keamanan Tambahan:**

| Aspek | Status | Catatan |
|-------|--------|---------|
| Manipulasi jam masuk | ⚠️ Partially Protected | Geofencing ada tapi bisa bypass tanpa location |
| Manipulasi jam pulang | ❌ Tidak Protected | Tidak ada geofencing untuk clock-out |
| Edit absensi tanpa jejak | ❌ Kritis | AuditLog tidak diimplementasikan |
| Rate limiting | ✅ Ada | Auth: 10/min, Admin: 1000/15min, API: configurable |
| JWT Security | ✅ Ada | Token expiry + refresh mechanism |
| CORS | ✅ Ada | Whitelist-based |
| Helmet headers | ✅ Ada | CSP + security headers |

---

## 10. EDGE CASES

| # | Edge Case | Status | Dampak |
|---|-----------|--------|--------|
| A | **Shift melewati tengah malam** | ❌ Tidak didukung | Jika ditambahkan shift malam, seluruh sistem clock-in/out berdasarkan "today" akan rusak |
| B | **Pergantian bulan** | ⚠️ Partial | `rotateOffDay` menggeser hari libur per bulan, tapi jika generate schedule dimulai di tengah bulan, `lastMonth` tracker bisa miss-trigger |
| C | **Pergantian tahun** | ✅ Aman | Date parsing menggunakan ISO format, tidak ada hardcoded year |
| D | **Hari libur nasional** | ❌ Tidak ada | Tidak ada model untuk public holiday. Karyawan yang tidak masuk di hari libur nasional = Alpha |
| E | **Jadwal kosong** | ⚠️ Fallback ke default | Clock-in tetap bisa dilakukan dengan status calculation memakai default config |
| F | **Check-in tanpa internet** | N/A (server-side) | Perlu offline-first di frontend (PWA + queue) |
| G | **Check-out terlupa** | ❌ Kritis | Tidak ada auto-clockout, record menggantung, payroll 0 untuk hari itu |
| H | **Karyawan resign di tengah periode payroll** | ⚠️ Partial | `calculateAllPayroll` hanya proses `isActive: true`, karyawan yang di-nonaktifkan kehilangan payroll data |
| I | **Off-day swap conflicts** | ⚠️ Partial | `isOffDay()` di offDayService bisa konflik dengan `UserSchedule` yang di-manage terpisah |
| J | **Concurrent clock-in (race condition)** | ⚠️ Protected by unique constraint | `@@unique([userId, date])` di DB akan reject duplicate, tapi karena `date` = DateTime (bukan Date), dua request yang tiba dalam milidetik berbeda secara teori bisa bypass jika timestamp sedikit berbeda |

---

## PRIORITAS PERBAIKAN (Ranked)

### 🔴 SEGERA (Critical) — Harus diperbaiki dalam 1-2 minggu

1. **[#11] Implementasi Auto Clock-Out** — Buat cron job yang menjalankan auto-clockout setelah N jam. Tanpa ini, record menggantung dan payroll akan terus salah.

2. **[#6] Perbaiki mekanisme date storage untuk Attendance** — Gunakan Date (bukan DateTime) untuk field `date`, atau standardisasi ke WITA midnight. Saat ini `date: clockInTime` menyimpan full timestamp yang bisa menyebabkan unique constraint issues.

3. **[#26] Implementasi Audit Trail** — Aktifkan penulisan ke `AuditLog` untuk setiap operasi admin (edit/delete attendance, ubah jadwal, approve/reject leave).

4. **[#8] Wajibkan geofencing** — Tolak clock-in jika location tidak disertakan, atau buat flag "clock-in tanpa lokasi" yang ter-highlight di dashboard.

### 🟠 URGENT (High) — Harus diperbaiki dalam 2-4 minggu

5. **[#24] Handle record tanpa clock-out di payroll** — Gunakan estimasi (misal shift end time) atau tandai sebagai "incomplete" untuk review admin.

6. **[#25] Buat mekanisme deteksi Alpha otomatis** — Cron job harian yang membuat record ABSENT untuk karyawan yang tidak clock-in dan tidak punya izin/cuti/libur.

7. **[#20] Perbaiki kalkulasi `notClockedIn`** — Kurangi dari totalEmployees: yang libur, cuti approved, izin, dan off day.

8. **[#22] Standardisasi timezone di seluruh sistem** — Gunakan WITA offset yang konsisten di semua fungsi, jangan ada yang pakai local server time.

9. **[#1] Lindungi jadwal manual override** — Tambahkan cek `isManualOverride` di `generateSchedule()`.

10. **[#3] Auto-check conflict saat generate jadwal** — Panggil `checkConflicts` secara otomatis dan return warning.

11. **[#5] Gunakan UTC date math di `distributeKitchenShifts`** — Ganti `current.getDay()` dengan UTC-based calculation.

12. **[#7] Unifikasi sumber truth Off Day** — Pilih satu: UserSchedule ATAU offDayService, bukan keduanya.

13. **[#18 & #19] Pertimbangkan implementasi modul lembur** — Minimal: track jam kerja > threshold, butuh approval.

14. **[#23] Tambahkan potongan keterlambatan di payroll** — Minimal track dan expose data late minutes untuk kalkulasi manual.

### 🟡 PENTING (Medium) — Diperbaiki dalam 1-2 bulan

15. **[#4] Siapkan arsitektur untuk shift cross-midnight** — Pisahkan "schedule date" dari "attendance date", gunakan schedule-based matching.

16. **[#9] Tambahkan warning jika clock-in tanpa jadwal** — Return flag `noSchedule: true` agar frontend bisa tampilkan notice.

17. **[#12] Validasi durasi minimum/maximum** — Tolak clock-out < 1 jam atau > 16 jam kecuali ada justifikasi.

18. **[#14] Validasi clockOut > clockIn pada admin edit** — Cek juga saat hanya salah satu field yang diupdate.

19. **[#15] Cache dan lock shift config saat clock-in** — Simpan shift info yang digunakan saat clock-in di record attendance.

20. **[#17] Track menit keterlambatan** — Tambahkan field `lateMinutes` di model Attendance.

21. **[#2] Validasi offDay field di bulkGenerate** — Default ke -1 (no off day) jika undefined.

### 🟢 MINOR (Low) — Backlog improvement

22. **[#10] IP anomaly detection** — Log dan flag jika IP berubah drastis dalam satu hari.
23. **[#13] Tambahkan geofencing optional untuk clock-out.**
24. **[#16] Buat grace period Ramadhan configurable, bukan hardcoded.**
25. **[#21] Pertimbangkan migrasi field `date` ke `@db.Date` di Attendance model.**
26. **[D] Tambahkan model PublicHoliday** — Agar hari libur nasional tidak dihitung Alpha.

---

## CATATAN ARSITEKTUR

1. **Dual Source of Truth untuk Off Day** — Saat ini ada 2 mekanisme: `User.offDay` (static weekly) dan `UserSchedule.isOffDay` (dynamic per-date). Ini menyebabkan konflik potensial di `clockIn` flow dimana `offDayService.isOffDay()` dicek SEBELUM `scheduleService.getTodaySchedule()`.

2. **DateTime vs Date di Prisma** — `Attendance.date` menggunakan `DateTime` sedangkan `UserSchedule.date` menggunakan `@db.Date`. Inconsistency ini menyebabkan behavior berbeda saat query.

3. **Server Timezone Dependency** — Beberapa fungsi menggunakan WITA offset manual (`Date.now() + 8*60*60*1000`), beberapa menggunakan `+08:00` string, dan beberapa menggunakan local server time. Ini akan rusak jika server pindah timezone.

4. **Missing Cron/Scheduler** — Tidak ada worker/scheduler untuk:
   - Auto clock-out
   - Daily Alpha detection
   - Notification reminder untuk clock-out
   - Report generation otomatis

---

## KESIMPULAN

Sistem ini **fungsional untuk operasional dasar** (clock-in/out, jadwal, payroll sederhana), namun memiliki **gap signifikan** di area:

- **Data integrity**: Timezone inkonsistensi + missing auto-clockout = data tidak reliable
- **Payroll accuracy**: Tidak ada potongan late, tidak handle missing clock-out, tidak ada overtime
- **Security compliance**: Audit trail tidak active = tidak bisa prove data integrity ke auditor
- **Operational control**: Geofencing bypass, no Alpha tracking = manipulasi mudah dilakukan

Rekomendasi: **Prioritaskan perbaikan Critical dan High** sebelum periode payroll berikutnya untuk menghindari kesalahan pembayaran dan potensi sengketa ketenagakerjaan.
