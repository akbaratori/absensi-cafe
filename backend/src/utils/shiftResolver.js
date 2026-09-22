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

module.exports = { parseShiftNumber, loadShiftMapByNumber };
