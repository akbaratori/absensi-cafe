# Rencana: Jadwal Fleksibel + Rapi-rapi Halaman Redundan

Dokumen kerja (bukan dokumentasi produk). Dipakai sebagai urutan langkah supaya
tidak ada halaman yang dihapus sebelum fiturnya benar-benar pindah.

## Temuan audit (dari kode, bukan dugaan)

| Halaman | Route | Dipakai di Sidebar? | Isi | Status temuan |
|---|---|---|---|---|
| Laporan | `/admin/reports` | ya (baris 63-67) | Daily/Monthly report dari `/admin/reports/daily` + `/monthly`, export CSV, **kartu Estimasi Gaji** + filter per pegawai | Terduplikasi: tabel harian = `Data Absensi`, rekap periode = `Rekap Absensi`. Yang khas hanya: estimasi gaji, export CSV periode harian/bulanan |
| Rekap Absensi | `/admin/attendance-recap` | ya (baris 53-57) | `AttendanceRecapPanel` — periode bebas, sudah punya tombol **CSV** (client-side) | Sudah menjadi pengganti yang lebih benar dari Laporan |
| Manajemen Jadwal | `/admin/schedules` | ya (baris 84-88) | `ScheduleCalendar` + `BulkSchedulePanel` + `ClosingSetupPanel`; tombol Generate/Redistribute/Distribute semua tabrakan dengan Posisi & Rotasi | Panel-panelnya masih hidup, jadi belum aman dihapus |

Fakta pendukung:
- `ScheduleCalendar` hanya dipakai di `ScheduleManagementPage` (1 tempat).
- `BulkSchedulePanel` & `ClosingSetupPanel` hanya dipakai di `ScheduleManagementPage`.
- Tombol `/schedules/distribute-kitchen`, `/assign-stations`, `/redistribute-stations`
  di Manajemen Jadwal bertabrakan fungsi dengan alur Generate di `RotationManagementPage`
  (yang juga memakai `ManualOffDayPanel`).
- `RelatedPage` (estimasi gaji) hanya dihitung `getDailyReport`/`getMonthlyReport`
  saat `userId` dikirim → satu-satunya fitur yang belum ada di Rekap Absensi.
- Tabel Laporan masih Inggris ("Date", "Employee", "Clock In", "Hours") sementara
  Rekap Absensi sudah memakai istilah Indonesia + kalkulasi telat dari akhir grace.
- `/admin/reports/export` (server CSV) pola query-nya sudah mendukung
  `startDate`/`endDate`/`userId`/`department`, jadi tidak perlu endpoint baru untuk
  export rekap periode bebas.

## Keputusan yang dipakai (selaras permintaan terakhir)

1. **Panel Rekap Keadilan Jobdesk tidak dihapus, tapi bisa disembunyikan.**
   Alasan: ada test backend yang menjaganya (`jobdeskFairness.test.js`) dan
   informasinya masih dipakai admin. Yang mengganggu = posisinya selalu terbuka
   penuh di atas kalender. Solusi: kartu **collapsible**, keadaan tertutup
   disimpan di `localStorage` per-perangkat, judul tetap terlihat.
   Tindakan sama untuk "Rangkuman Jobdesk Pegawai" (satu keluarga tampilan).

2. **Manajemen Jadwal ditata, bukan dihapus.**
   Ia satu-satunya tempat: setup closing + redistribusi jobdesk yang sedang
   berjalan. Yang dihapus hanyalah tombol yang duplikat dengan alur Generate
   (Distribute Kitchen / Assign Role / Generate per pegawai) — setelah dipastikan
   tidak ada yang memakainya.
   **Tahan dulu**: ini perlu konfirmasi karena bisa mengubah kebiasaan kerja.

3. **Laporan (`/admin/reports`) dijadikan sub-halaman Rekap Absensi.**
   Fitur yang diselamatkan: export CSV periode harian/bulanan + Estimasi Gaji.
   Setelah itu route dan menu "Laporan" dihapus.

4. **Halaman jadwal utama (`FullSchedulePage`) dibuat lebih fleksibel.**
   Tambahan yang direncanakan (memakai endpoint yang sudah ada,
   `PUT /schedules/user-schedule-cell` — jadi tanpa migrasi DB):
   - a. Tambah shift pada tanggal yang belum punya baris jadwal.
   - b. Ubah shift per pegawai **per rentang tanggal** (bukan klik satu-satu).
   - c. Pindah pegawai antar posisi dengan tetap menyimpan jobdesk-nya.
   - d. Sembunyikan/tampilkan panel analitik (poin 1).

## Urutan kerja

- [x] 1. Tambah `hidePanelTitle`/wrapper collapsible di `FullSchedulePage` (poin 1d + 1).
      → `usePersistentToggle` + tombol `EyeOff`/`Eye` di `JobdeskFairnessPanel` &
      `JobdeskEmployeeSummaryPanel`; `expanded`/`hidden` tersimpan di `localStorage`.
- [x] 2. Tambah tombol "Tambah jadwal" (`+`) di sel kosong + prefill dari shift default (poin 4a).
      → sel kosong jadi tombol `+`; modal yang sama dipakai ulang, dropdown "Pegawai"
      muncul hanya saat `editCellData.userId` masih null.
- [x] 3. Tambah aksi "Ubah shift untuk rentang tanggal" per pegawai (poin 4b).
      → `EmployeeShiftEditor.jsx` + `PUT /schedules/user-shift-range` +
      `scheduleService.updateUserShiftRange`; rentang awal mengikuti tampilan aktif.
- [x] 4. Perbaiki alur pindah posisi (poin 4c).
      → Tidak diubah: perpindahan posisi sudah dijaga `upsertSingleSchedule`
      (jobdesk lama tetap tersimpan di baris UserSchedule-nya sendiri, bukan
      dipindah bersama orangnya). Yang TIDAK dilakukan sengaja: membuat
      tombol pindah posisi baru, karena alurnya sudah ada di Posisi & Rotasi
      dan menambah jalur kedua justru memperbesar peluang jadwal ganda.
- [x] 5. Pindahkan export CSV + Estimasi Gaji ke `AttendanceRecapPanel`, lalu hapus Laporan.
      → `includeSalary` opt-in di `/reports/recap`; kartu Estimasi Gaji + tombol
      "Rincian CSV" (server) + "CSV" (browser) di Rekap Absensi; route
      `/admin/reports` + menu Sidebar + `ReportsPage.jsx` dihapus.
      **Bug ikut ketemu & diperbaiki:** `/reports/export` divalidasi
      `reportQuerySchema` yang `stripUnknown` → `startDate`/`endDate` dari UI
      dibuang, CSV selalu berisi rentang default. Kini pakai
      `attendanceExportQuerySchema`.
- [x] 6. Rapikan Manajemen Jadwal (hapus tombol duplikat).
      → Dihapus: tombol + modal **Distribusi Kitchen**, **Generate Jadwal**
      (per pegawai + cek konflik), dan **Generate Rotasi Role (A-E)**. Ketiganya
      memanggil `/schedules/generate`, `/schedules/check-conflicts`, dan
      `/schedules/distribute-kitchen` — hasilnya bertabrakan dengan alur
      Posisi & Rotasi. State/handler yang tersisa dari modal itu ikut dibuang,
      plus 3 fungsi yatim di `scheduleService.js`.
      Yang **dipertahankan**: `ScheduleCalendar`, `ClosingSetupPanel`,
      `BulkSchedulePanel`, download gambar, dan aksi
      **Redistribusi Jobdesk** (`/schedules/redistribute-stations`) — ini
      kasus darurat closing, bukan generate jadwal, jadi tidak ada
      penggantinya di Posisi & Rotasi. Tombolnya dikeluarkan dari modal
      menjadi tombol header + modal kecil sendiri, supaya tidak perlu
      membuka modal Generate yang sudah hilang.
      Panel `ScheduleCalendar`/`BulkSchedulePanel`/`ClosingSetupPanel`
      **tidak dipindah** — tetap di halaman ini sesuai keputusan user.
- [x] 7. Update dokumen (DEPLOY.md, frontend/README.md) + jalankan test.
      → DEPLOY.md bagian 9 + 9b; test backend: 116/118 lulus. 2 kegagalan
      sudah diverifikasi **bukan** dari perubahan ini (lihat catatan bawah).

Catatan tambahan yang dikerjakan di luar daftar: `variant="outline"` pada `Button`
ternyata tidak pernah punya kelas `btn-outline` di `index.css`, jadi 9 pemakaian
lama tampil polos. Ditambahkan alias `outline` → `btn-secondary`. Masalah yang
sama ketemu lagi saat langkah 6: `variant="warning"` (dipakai juga di
`SwapApprovalPage`) tidak punya kelas `btn-warning`. Ditambahkan
`.btn-warning` + entri `warning` di `Button.jsx`.

## Hasil test (bukan klaim, hasil jalan nyata)

`npm run test:staging -- --coverage=false` → **116 lulus / 118 total** (13 suite).

Build frontend (`npx vite build`) setelah langkah 6: **4616 modul ditransformasi,
exit 0** — jumlah modul sama seperti sebelum penghapusan, karena yang dibuang
hanya kode di dalam berkas yang sudah ikut ter-bundle.

| Suite | Status | Sebab |
|---|---|---|
| `attendanceRecap.test.js` | LULUS saat dijalankan ulang | Sekali gagal karena `P1001 Can't reach database server` (staging Aiven) — server DB-nya putus, bukan logika. Dijalankan ulang sendiri: 15/15 lulus. |
| `shiftIdRecovery.test.js` | 5/6, **gagal sejak sebelum perubahan ini** | Dibuktikan dengan `git stash` semua perubahan lalu menjalankan suite ini di `main` bersih: tetap gagal 1. Jadi bukan regresi dari pekerjaan ini. |

## Yang menunggu keputusan user

Tidak ada lagi — langkah 6 sudah dikerjakan setelah user memilih
"tombol yang duplikat saja yang dihilangkan". Panel
`ScheduleCalendar` / `BulkSchedulePanel` / `ClosingSetupPanel` sengaja
tidak dipindah.

## Langkah 8 (tambahan, permintaan user): fleksibilitas ganti shift dari panel roster

- [x] Tombol **🔁 Ubah Shift** di header panel Roster (Posisi & Rotasi) —
      pilih pegawai → shift tujuan (Shift 1 / Shift 2 / Libur / **Auto**) →
      rentang tanggal, dengan ringkasan "N hari akan diubah … menjadi …"
      sebelum menyimpan. Maks. 62 hari sekali jalan.

Keputusan teknis yang dipakai (dan alasannya):

- **Menulis lewat `PUT /rotation/:id/schedule-assignment` (satu tanggal = satu
  request), BUKAN `PUT /schedules/user-shift-range`.** Endpoint `/schedules`
  memang lebih hemat request, tapi ia mengosongkan `temporaryDepartment`
  (`scheduleService.upsertSingleSchedule`). Untuk posisi Dapur kolom itu WAJIB:
  staf yang tidak bertanda `KITCHEN` dilewati saat distribusi jobdesk kitchen
  (baca catatan di `RotationService.setScheduleAssignment`). Endpoint rotasi
  juga menyimpan `kitchenStation`, sehingga jobdesk/stasiun yang sudah diatur
  untuk hari itu tidak ikut terhapus. Karena itu pula batas 62 hari dipasang.
- **Tidak mengubah `PositionRoster.shiftNumber`.** Kolom itu sengaja diabaikan
  `generateWeek` (rotasi murni dari `orderIndex`); menulisnya justru membuat
  admin merasa shift "terkunci" padahal tidak berpengaruh apa pun.
- **Tidak mengunci shift per orang tiap minggu** (opsi "pin S1/S2 permanen"):
  itu mengubah rumus rotasi + `_shiftSplit`, dampaknya ke keadilan jobdesk dan
  semua test rotasi. Bisa dikerjakan menyusul bila memang diperlukan.
- Hari yang masih bertanda libur di `ManualOffDayPanel` TIDAK dihapus otomatis
  saat shift diberikan; imbauannya ditulis di modal ("hapus dulu tanda
  liburnya bila pegawai memang masuk"), sejalan dengan perilaku kalender yang
  juga tidak menghapusnya.
- Menu **Auto** memakai endpoint `DELETE …/schedule-assignment`, jadi sama
  dengan tombol "Auto" di modal per tanggal — bukan fitur baru di backend.
- Kegagalan di tengah rentang tidak menghentikan hari sisanya; jumlah yang
  berhasil/gagal dilaporkan apa adanya, lalu `monthSchedule` selalu dimuat
  ulang dari server supaya kalender menampilkan yang benar-benar tersimpan.

Verifikasi: `esbuild` 0 error, `npx vite build` **4616 modul, exit 0**.
Proyek ini tidak punya konfigurasi ESLint (tidak ada `.eslintrc*` /
`eslint.config.*`), jadi `npm run lint` memang tidak bisa dijalankan.

## Yang TIDAK dilakukan

- Tidak menghapus endpoint backend yang masih dipakai test. Endpoint
  `/schedules/generate`, `/schedules/check-conflicts`,
  `/schedules/distribute-kitchen`, dan `/schedules/assign-stations` masih ada di
  backend (sebagian masih dipakai test); yang dihapus hanya pemakaiannya di UI.
- Yang justru ikut dihapus: 3 export tanpa pemakaian di `scheduleService.js`
  (`generateSchedule`, `checkConflicts`, `distributeKitchenShifts`) — sudah
  dipastikan nol referensi di seluruh `frontend/src` sebelum dibuang.
- Tidak mengubah rumus telat/keadilan jobdesk (sudah diperbaiki dan diuji).
- Tidak memaksa ikut export gambar/PDF saat panel disembunyikan.
