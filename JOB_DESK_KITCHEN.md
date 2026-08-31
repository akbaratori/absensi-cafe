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

---

## 2. Prinsip Keadilan (Cara Sistem Membagi)

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

**C – Checker / Stock**
- Verifikasi setiap order: menu, jumlah, catatan khusus, suhu
- Catat bahan yang menipis/habis ke daftar belanja
- Koordinasi dengan PIC Stok untuk re-stock

**D – Runner / Area**
- Antar order dari pass ke area/service dengan benar
- Jaga area pass & sekitar dapur tetap bersih
- Cuci alat kecil (sendok, piring saji) secara berkala

**E – Helper / Floating**
- Cuci alat masak besar (panci, wajan, grill)
- Bantu stasiun yang sedang overload (prioritas A → B)
- Siapkan prep sederhana (kupas, potong) saat senggang

**Penutup shift (semua stasiun):** bersihkan stasiun masing-masing,
kembalikan alat ke tempatnya, laporkan kerusakan ke Shift PIC.
