# Pengaturan Jobdesk Kitchen (Dapur) yang Adil

Dokumen ini adalah aturan main pembagian tugas dapur agar beban kerja merata,
transparan, dan tidak ada staf yang merasa selalu kebagian tugas berat.
Selaras dengan sistem rotasi otomatis di aplikasi absensi
(`scheduleService.js` → `assignDailyStations`).

---

## 1. Daftar Stasiun & Jobdesk

| Stasiun | Nama | Jobdesk Utama | Beban |
|---------|------|---------------|-------|
| **A** | Main Cook | Masak menu utama, kontrol rasa & plating akhir, ambil keputusan saat ramai | Berat |
| **B** | Support Cook / Snack | Masak snack/pendamping, bantu prep Main Cook, goreng & bakar | Sedang–Berat |
| **C** | Checker / Stock | Cek kelengkapan pesanan sebelum keluar, catat stok habis, re-stock bumbu | Sedang |
| **D** | Runner / Area | Antar makanan ke area, jaga kebersihan meja pass, cuci alat kecil | Ringan–Sedang |
| **E** | Helper / Floating | Bantu semua stasiun, cuci piring besar, bersih-bersih area, tugas dadakan | Ringan |

> Beban **A paling berat, E paling ringan** — karena itu sistem menghitung
> frekuensi tiap orang di tiap stasiun agar tidak ada yang terus-terusan di A.
>
> **Huruf kolom di rekap jobdesk = 4 huruf (A–D), bukan 5.** Jobdesk yang
> selalu menempel digabung ke huruf induknya, jadi tidak ada lagi kolom
> setengah seperti "C+" di rekap admin maupun di rekap staff:
>
> | Huruf kolom | Isi |
> |-------------|-----|
> | **A** | Main Cook |
> | **B** | Support Cook |
> | **C** | Checker / Stock + Plating + Dishwasher |
> | **D** | Runner / Area + Helper / Floating |
>
> Satu hari dihitung **sekali per huruf**: sehari `Checker / Stock + Plating`
> menyumbang 1x C (bukan 2x), karena keduanya memang satu paket. Rincian per
> jobdesk tetap dihitung terpisah di backend (`roleCounts`) supaya tidak ada
> jobdesk yang hilang dari laporan. Implementasi: `JOBDESK_GROUPS` +
> `parseJobdeskGroups()` di `scheduleService.js`.
>
> **Satu hari kerja hanya tercatat di satu kolom — stasiun utama** (huruf
> berprioritas tertinggi A→D). Saat 3 orang masuk dan satu staf merangkap
> `Support Cook + Checker` (B + C), hari itu tercatat 1x B saja; kolom
> **Rangkap** di rekap menampilkan berapa hari ia memegang dua stasiun
> sekaligus. Dengan aturan ini **Σ A–D selalu = hari kerja** (dikurangi hari
> tanpa jobdesk); sebelumnya Σ = hari kerja + hari rangkap, sehingga Oktober
> tampak 31 > 27. Beban kerja tetap menjumlah seluruh stasiun yang dipegang
> (termasuk takeover) karena beban adalah metrik pekerjaan nyata.

---

## 2. Aturan Paket Jobdesk (WAJIB — berlaku sejak September 2026)

Jobdesk dibagi sebagai **paket tetap** sesuai jumlah staf yang masuk kerja hari itu.
Implementasi: `rotationService.buildKitchenPackages()` + `assignKitchenStations()`,
dipakai oleh `generateWeek()` (generate mingguan) dan
`distributeKitchenJobdesksForDates()` (setelah off-day/swap berubah).

| Staf masuk | Paket |
|------------|-------|
| **5** | `Main Cook` \| `Support Cook` \| `Checker / Stock` \| `Runner / Area` \| `Helper / Floating` |
| **4** | `Main Cook` \| `Support Cook` \| `Checker / Stock` \| `Runner / Area + Helper / Floating` |
| **3** | `Main Cook + Support Cook` \| `Checker / Stock` \| `Runner / Area + Helper / Floating` |
| **2** | `Main Cook + Support Cook` \| `Checker / Stock + Runner / Area + Helper / Floating` |
| **1** | Semua jobdesk di satu orang |

**Aturan yang tidak boleh dilanggar:**

1. **Main Cook dan Support Cook selalu ada setiap hari operasional.** Kalau salah
   satu libur, satu orang merangkap `Main Cook + Support Cook` — bukan kosong.
2. **Checker / Stock selalu dipegang tepat 1 orang per hari operasional**, dan
   jobdesk itu tidak pernah dipecah ke dua orang.
3. **Plating menempel pada Checker.** Jobdesk `Plating` disimpan di
   *Rotasi & Libur → Kelola Jobdesk* dan **selalu digabung** menjadi
   `Checker / Stock + Plating` pada orang yang sama — tidak pernah dipecah.
   Kalau `Plating` dihapus dari daftar jobdesk, tugas plating tetap bagian
   dari Checker (lihat panduan role C di halaman Jadwal staf).
4. **Pemegang paket berputar tiap hari**, dan **fase rotasinya di-reset setiap
   tanggal 1** (lihat § 2c). Tidak ada orang yang pegang jobdesk berat
   terus-menerus, dan tiap bulan mulai dari fase yang sama.
5. **Baris dengan `isManualOverride = true` tidak pernah ditimpa** — jobdesk yang
   diatur manual oleh admin dipertahankan.

> Prasyarat: baris jadwal staf Dapur harus punya `temporary_department = 'KITCHEN'`.
> Kalau nilainya `'BAR'`, sistem menganggap staf itu sedang dipinjam ke departemen
> lain dan **melewatinya** dari pembagian jobdesk. Perbaiki dengan:
> `node backend/scripts/fix-kitchen-temporary-department.js --apply`

---

## 2b. Prinsip Keadilan (algoritma lama — arsip)

Sistem **otomatis menghitung kumulatif** berapa kali tiap staf memegang
stasiun dalam bulan berjalan, lalu tiap hari memilih yang **paling sedikit**
memegang stasiun itu:

1. **Kandidat dengan hitungan terendah di stasiun X dipilih duluan.**
2. Untuk stasiun berat (**A & B**), tie-breaker: yang total (A+B) paling
   sedikit diprioritaskan.
3. **PIC Stok mingguan tidak boleh memegang stasiun A** (agar fokus kontrol
   stok) — sistem otomatis melewatinya ke kandidat adil berikutnya.
4. **Maksimal 1 peran kontrol per orang per hari** (PIC Stok / Shift PIC /
   Sanitasi tidak boleh menumpuk di satu orang).

---

## 2c. Fase Rotasi Bulanan (berlaku sejak Oktober 2026)

Pembagian jobdesk Kitchen dihitung **per bulan kalender dan berdiri sendiri**.
Empat hal yang perlu diketahui admin:

1. **Fase di-reset tiap tanggal 1.** `dayOffset` = `tanggal − 1` (tanggal 1 → 0,
   tanggal 15 → 14, tanggal 31 → 30), bukan jumlah hari sejak epoch. Efeknya: dua
   bulan dengan komposisi kehadiran identik menghasilkan **peta huruf yang
   identik**; fase tidak lagi bergeser sendiri saat ganti bulan.
2. **Tidak ada koreksi antar bulan.** Kalau seorang staf menumpuk satu huruf di
   akhir Oktober, November mulai dengan hitungan nol — November tidak "membayar
   utang" Oktober. Ini disengaja, supaya rekap bisa dinilai per periode gajian.
3. **`queueIndex` (posisi antrian) tetap permanen, tidak ikut di-reset.** Nilainya
   ada di tabel `KitchenJobdeskState` dan hanya berubah lewat endpoint rotasi
   (dihitung ulang dari roster). Perubahan fase di § ini **tidak butuh migrasi
   database**.
4. **Dua sumber angka, keduanya wajib ditulis bersamaan.** Jadwal yang dipakai
   staf ada di `user_schedules.kitchen_station` (dibaca panel rekap admin &
   rekap personal staff), sedangkan laporan rotasi bulanan
   (`getKitchenJobdeskMonthlyReport`) membaca tabel `kitchenJobdeskLog` —
   angka di sana diambil apa adanya saat generate, tidak dihitung ulang saat
   dibaca, jadi laporan lama tetap sah walau algoritma berganti. Kalau hanya
   salah satu yang ditulis, dua tampilan itu pasti berbeda. Semua jalur
   penulis jadwal karena itu WAJIB menulis keduanya:

   - `generateWeek` (generate mingguan/bulanan)
   - `distributeKitchenJobdesksForDates` (setelah swap shift / off-day)

   Jalur kedua dulu hanya menulis jadwal tanpa log — itu sebabnya laporan
   Oktober 2026 sempat melapor sebaran huruf yang berbeda dari jadwal yang
   benar-benar dipakai (selisih 5 kemunculan huruf pada 1–4 Oktober). Sekaligus
   kini hari libur ikut menghapus log lamanya, supaya tidak ada "hari hantu":
   staf dihitung memegang huruf padahal sedang libur.

   **Manual override** (`isManualOverride = true`): jadwalnya tidak pernah
   ditimpa generator, dan log-nya ditulis dengan **nilai yang admin atur**
   (bukan nilai hasil rotasi) — jadi laporan selalu sama dengan jadwal. Kalau
   admin menandai staf libur lewat manual override, tidak ada log hari itu.

> Jadwal yang terlanjur tidak cocok dengan laporan cukup diperbaiki dengan
> menjalankan ulang **Admin → Jadwal → Generate Bulanan** untuk bulan terkait.
> Proses ini menimpa jadwal dan log periode itu secara idempoten.

### 2c. Admin mengoreksi angka rekap (menyentuh jadwal, bukan cuma tampilan)

Tombol **Edit** di panel *Rekap Keadilan Jobdesk* membuat admin bisa mengetik
angka A–D sendiri, misalnya mengubah `8 / 8 / 4 / 7` menjadi `7 / 8 / 5 / 7`.
Angka rekap adalah hasil hitungan dari `user_schedules.kitchen_station`, jadi
**backend memindahkan hari kerja yang sebenarnya** sampai hitungan ulang sama
dengan angka yang diinput — bukan sekadar menimpa tampilan. Endpoint:
`PUT /api/v1/schedules/jobdesk-fairness/adjust` (`adjustJobdeskCounts`).

Aturan yang menjaga supaya jadwal & rekap tidak berbeda:

1. **Σ A–D wajib = jumlah hari kerja yang sudah punya jobdesk.** Hari kerja
   tanpa jobdesk tidak ikut dihitung (harus diisi lebih dulu lewat tabel
   jadwal), dan hari libur memang tidak pernah dihitung. Kalau Σ tidak cocok,
   permintaan ditolak dan tidak ada yang ditulis.
2. **Hari rangkap dipertahankan apa adanya.** Memindahkan stasiun utamanya
   berarti membongkar jobdesk gabungan, jadi target tiap kolom tidak boleh
   turun di bawah jumlah hari rangkap dengan primary di kolom itu.
3. **Hari terkunci manual override tidak ditimpa.** Kalau target memaksa
   perpindahan hari yang sudah terkunci, permintaan ditolak dengan pesan yang
   menyebut alasannya — admin membuka kuncinya lewat tabel jadwal dulu.
4. **Hari yang dipindah langsung dikunci** (`isManualOverride = true`) supaya
   tidak ditimpa generate/rotasi berikutnya, dan `kitchenJobdeskLog` ditulis
   ulang dengan nilai baru (§2 butir 4) supaya laporan bulanan tetap sama
   dengan jadwal. Setelah itu response memuat daftar hari yang berubah
   beserta peringatan kalau ada stasiun A–D yang jadi kosong di hari tersebut.

---

## 2d. Stasiun yang Dikunci Manual & Station yang Wajib Penuh (berlaku sejak Oktober 2026)

Aturan lama cacat: staf `isManualOverride = true` ikut **mengambil** paket dari
antrian, tetapi hasil rotasinya dibuang saat menulis database (baris admin
dipertahankan). Paket itu lalu **lenyap** — satu huruf A–D kosong, huruf lain
dobel. Terukur pada 2026-10-07: 3 staf, ketiganya huruf D, huruf A/B/C kosong.

Aturan baru (`_assignKitchenByQueue`, dipakai `generateWeek` **dan**
`distributeKitchenJobdesksForDates` supaya kedua jalur identik):

1. **Nilai admin dipakai apa adanya**, dan hurufnya dicatat sebagai **sudah
   terisi** — tidak ada paket yang dibagikan untuk huruf yang sudah terkunci.
2. **Jumlah paket dihitung dari TOTAL staf hari itu** (staf bebas + staf terkunci),
   bukan hanya staf bebas. Kalau hanya staf bebas yang dihitung, satu staf bebas
   bisa kebagian SEMUA jobdesk saat redistribute swap/off-day (kelebihan beban).
3. **Staf bebas lebih sedikit dari huruf yang tersisa → paketnya DIGABUNG** dari
   belakang (aturan penggabungan yang sama dengan `buildKitchenPackages`). Contoh:
   2 staf terkunci di D + 1 staf bebas → staf bebas memegang A+B+C supaya A–D penuh.
4. **Semua huruf sudah terkunci → staf sisanya ikut paket paling ringan**, bukan
   bekerja kosong.
5. Kalau **semua staf hari itu terkunci manual**, generator tidak bisa menambah apa
   pun — station yang kosong adalah keputusan admin, perbaiki lewat tabel jadwal.

> Huruf sebuah jobdesk dibaca lewat `_kitchenRoleOf` yang mengikuti urutan
> prioritas laporan **A→D** (bukan penemu pertama). Nama gabungan seperti
> `Checker + Plating + Dishwasher` harus tetap terbaca **C** — kalau `/plating/`
> diuji lebih dulu, kolom C terpotret sebagai PLATING dan hurufnya hilang dari
> pemerataan. Urutan ini WAJIB sinkron dengan `JOBDESK_GROUPS` /
> `parseJobdeskGroups()` di `scheduleService.js` (sumber huruf di laporan).

Data yang terlanjur berlubang tidak ikut tersentuh tombol Generate kalau
staff-nya terkunci manual; perbaiki dengan
`node backend/scripts/repair-kitchen-stations.cjs [FROM] [TO]` (idempoten,
hanya menulis ulang baris **non**-override dan log-nya).

### 2e. Cakupan Stasiun & Tanda "Stasiun Kosong" di Jadwal (berlaku sejak Oktober 2026)

Admin perlu **melihat** stasiun mana yang belum ada pegawainya **sebelum**
jadwal dipakai. Untuk itu ada endpoint dan tanda visual:

* **API coverage** — `GET /api/v1/rotation/kitchen-station-coverage?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
  (khusus ADMIN, read-only, rentang maksimal 62 hari). Balasannya berisi,
  per tanggal: `required` (huruf yang wajib ada), `filled`, `missing`,
  `holders` (siapa memegang apa + flag `manual`), `staffCount`, dan
  `allManual`. Huruf wajib diturunkan dari jobdesk yang benar-benar ada di
  DB; kalau posisi dapur tidak punya jobdesk sama sekali, dipakai default
  **A–D** supaya kegagalan konfigurasi tetap kelihatan.
* **Pool staf sama dengan generator** (roster Kitchen/Dapur ∪
  `temporaryDepartment='KITCHEN'` ∪ baris dengan `kitchenStation`) — supaya
  tidak ada laporan "kosong" palsu hanya karena stafnya dihitung dari pool
  yang berbeda.
* **Kalender jadwal admin** (`ScheduleCalendar.jsx`): setiap hari operasional
  menampilkan chip **A B C D**. Hijau = sudah ada pemegang, **merah + ✕** =
  belum ada. Tooltip menampilkan nama pemegang; kalau `allManual`, tooltip
  mengingatkan bahwa semua jobdesk hari itu terkunci manual sehingga harus
  diubah lewat Edit Jadwal. Badge ini di-refresh otomatis setelah tambah /
  ubah / hapus jadwal.
* **Modal tambah/edit jadwal**: di atas dropdown jobdesk muncul peringatan
  merah "Stasiun kosong hari ini: …" dan opsi jobdesk yang hurufnya kosong
  ditandai "⚠ belum ada (stasiun kosong)" — memandu admin mengisi huruf
  yang benar, bukan menambah huruf yang sudah penuh.
* **Halaman Jadwal Lengkap** (`FullSchedulePage.jsx`): banner merah
  meringkas semua tanggal (minggu/bulan tampil) yang punya stasiun kosong,
  dan header tanggal pada tabel posisi dapur diberi badge merah kecil.
* **Hari libur dapur vs stasiun kosong**: hari yang TIDAK punya satu pun
  staf dapur masuk kerja dianggap **hari libur dapur** — tidak ditandai
  apapun. Baru disebut "stasiun kosong" kalau ada staf dapur bekerja
  tetapi huruf A–D yang wajib tidak terisi semua.
* **Pemetaan E → D**: `E - Helper / Floating` menempel pada Runner (D), jadi
  dihitung sebagai D. Kolom rekap hanya A–D; E tidak pernah muncul sebagai
  "stasiun kosong" tersendiri.

---

## 3. Aturan Rotasi Mingguan

| Aturan | Penjelasan |
|--------|-----------|
| **Rotasi harian** | Stasiun A–E diacak ulang setiap hari oleh sistem berdasarkan hitungan bulanan |
| **PIC Stok** | Hanya hari **Senin**, bergiliran antar staf dapur per minggu |
| **Shift PIC** | 1 orang per shift, memastikan SOP berjalan; bergantian tiap hari |
| **Sanitasi** | 1 orang per hari, bertanggung jawab kebersihan akhir shift; bergantian |
| **Libur (OFF)** | Dirotasi bulanan agar tidak selalu orang yang sama libur di hari yang sama |

---

## 4. Aturan Adil Tambahan (Kebijakan Manual)

Agar benar-benar adil, terapkan aturan ini di atas sistem otomatis:

1. **Maksimal 2 hari berturut-turut di stasiun A.** Jika sistem menempatkan
   orang yang sama 3 hari berturut, admin wajib tukar manual via edit jadwal.
2. **Staf baru** mulai dari stasiun E/D selama masa training (±2 minggu),
   lalu masuk rotasi penuh.
3. **Komplain stasiun:** staf boleh ajukan tukar stasiun maksimal H-1 lewat
   fitur swap — tidak boleh tukar sendiri di hari-H tanpa persetujuan admin.
4. **Rekap bulanan:** di akhir bulan, admin cek laporan distribusi stasiun.
   Jika ada selisih > 3 kali di stasiun A antar staf, bulan berikutnya staf
   yang paling sedikit di A diprioritaskan.
5. **Kondisi khusus** (sakit, hamil, cedera) boleh dikecualikan dari stasiun
   berat A/B — catat di notes jadwal agar transparan ke staf lain.
6. **Backup dari dapur:** jika staf dapur jadi backup shift lain, jadwal
   dapurnya hari itu otomatis dibersihkan sistem — stasiunnya diisi ulang
   dari sisa staf dengan hitungan paling rendah.

---

## 5. Cara Admin Mengatur di Aplikasi

1. **Generate jadwal bulanan** → sistem otomatis membagi shift Pagi/Siang
   dan stasiun A–E secara adil.
2. **Edit per tanggal** (jika perlu koreksi) lewat halaman jadwal bulanan —
   pilih tanggal → ubah stasiun/shift → simpan.
3. **Tandai manual override** agar tidak tertimpa saat generate ulang.
4. **Cek keadilan** lewat kalender generate — tampilan warna menunjukkan
   distribusi; pastikan tidak ada nama yang dominan di stasiun berat.

---

## 6. Ringkasan Tanggung Jawab Harian per Stasiun

**A – Main Cook**
- Mise en place menu utama sebelum jam buka
- Eksekusi semua order menu utama sesuai standar resep
- Koordinasi timing dengan Checker agar order keluar serempak

**B – Support Cook / Snack**
- Siapkan & masak semua snack/side dish
- Backup Main Cook saat order menumpuk
- Jaga stok bahan siap masak (prepped) tetap aman

**C – Checker / Stock (+ Plating + Dishwasher)**
- Verifikasi setiap order: menu, jumlah, catatan khusus, suhu
- Catat bahan yang menipis/habis ke daftar belanja
- Koordinasi dengan PIC Stok untuk re-stock
- **Plating** (menempel, tidak pernah dipisah): atur tampilan akhir — porsi,
  kebersihan pinggir piring, garnish. Saat ramai, dahulukan cek order.
- **Dishwasher** (menempel): cuci alat makan & masak, jaga area sink bersih.

**D – Runner / Area + Helper / Floating**
- Antar order dari pass ke area/service dengan benar
- Jaga area pass & sekitar dapur tetap bersih
- Cuci alat kecil (sendok, piring saji) secara berkala
- Bantu stasiun yang sedang overload (prioritas A → B)
- Cuci alat masak besar (panci, wajan, grill) & siapkan prep sederhana saat senggang

**Penutup shift (semua stasiun):** bersihkan stasiun masing-masing,
kembalikan alat ke tempatnya, laporkan kerusakan ke Shift PIC.
