const prisma = require('../utils/database');

/**
 * Pemetaan nomor shift <-> baris tabel `shifts`.
 *
 * Latar masalah: `shiftNumber` (1, 2, 3) di banyak tabel BUKAN primary key
 * tabel `shifts`. Di produksi id-nya tidak berurutan:
 *   id=1 -> "Shift 1"   id=3 -> "Shift 2"   id=5 -> "Shift 3"
 * Sehingga dua asumsi yang tampak wajar justru salah:
 *   - menulis `shiftId = shiftNumber`  -> "S2" tersimpan sebagai id 2 (tidak ada)
 *   - membaca `allShifts[n-1]`         -> benar hanya karena kebetulan
 *
 * Sumber kebenaran = NAMA shift, dengan pencocokan toleran supaya nama yang
 * berbeda antar environment ("Shift 2" vs "Shift 2 (Siang)") tetap terbaca.
 */

function parseShiftNumber(name) {
  const m = /^shift\s*(\d+)\b/i.exec(String(name || '').trim());
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Peta { nomorShift -> baris shift }. Bila nomor kembar, id terkecil menang.
 *
 * PENTING: kembalikan SELURUH kolom shift (bukan hanya id + name).
 * Baris hasil peta ini dipakai langsung sebagai "shift efektif" di
 * resolveEffectiveShift; tanpa startTime/endTime, classifyByDuration menghitung
 * String(undefined).split(':') -> NaN, sehingga user selalu dinilai setengah
 * hari. Jangan sempitkan select di sini.
 */
async function loadShiftMapByNumber() {
  const shifts = await prisma.shift.findMany({ orderBy: { id: 'asc' } });
  const map = new Map();
  for (const s of shifts) {
    const n = parseShiftNumber(s.name);
    if (n != null && !map.has(n)) map.set(n, s);
  }
  return map;
}

/**
 * Cari baris shift dari sebuah `shiftId` yang mungkin MENGGANTUNG.
 *
 * Latar masalah (nyata di produksi): `shiftId = 2` tersimpan di UserSchedule,
 * padahal tabel `shifts` hanya punya id 1, 3, 5. Pembacaan naif
 * (`where: { id: 2 }`) mengembalikan null, sehingga record absensi yang dibuat
 * lewat jalur itu KEHILANGAN info shift: tidak ada `[Shift: ...]` di catatan,
 * `lateMinutes` dihitung terhadap jam default 08:00 (staff shift 2 yang masuk
 * 11:00 tercatat "telat 180 menit"), dan tanggal itu ikut menjatuhkan potongan
 * payroll. Sumbernya adalah validasi global lama yang keliru mengira
 * `shiftNumber` == primary key `shifts` (lihat catatan di
 * rotationService.setScheduleAssignment yang sudah diperbaiki).
 *
 * Fungsi ini TIDAK mengembalikan baris yang salah. Ia mengembalikan:
 *   - baris shift bila `shiftId` valid, atau
 *   - hasil fallback berbasis NAMA ("S2"/"Shift 2" -> baris "Shift 2") dengan
 *     `recoveredFrom` berisi id menggantung tadi, supaya pemanggil bisa
 *     memberi catatan "perlu dibetulkan" — bukan diam-diam menilai staff
 *     dengan jam shift yang salah.
 *
 * Perbandingan id memakai Number() supaya baris hasil `select` yang tipenya
 * meleset (string vs angka) tidak dianggap menggantung.
 *
 * @param {Number|String|null} shiftId
 * @returns {Promise<{id:Number,name:String,startTime:String,endTime:String,recoveredFrom:Number|null}|null>}
 */
async function findShiftById(shiftId) {
  const id = Number(shiftId);
  if (!shiftId || Number.isNaN(id)) return null;

  const direct = await prisma.shift.findUnique({ where: { id } });
  if (direct) return { ...direct, recoveredFrom: null };

  // Menggantung (mis. shiftId=2 yang tidak ada di tabel). Coba pulihkan dari
  // nama "Shift <n>" — persis konvensi yang dipakai UI saat menyimpan nomor shift.
  const recovered = (await loadShiftMapByNumber()).get(id);
  return recovered ? { ...recovered, recoveredFrom: id } : null;
}

module.exports = { parseShiftNumber, loadShiftMapByNumber, findShiftById };
