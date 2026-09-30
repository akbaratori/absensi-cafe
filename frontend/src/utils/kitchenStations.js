/**
 * Huruf stasiun dapur & pemetaannya — sumber tunggal untuk tampilan jadwal.
 *
 * Konsep huruf sama dengan rekap backend (JOBDESK_GROUPS di scheduleService dan
 * _kitchenRoleOf di rotationService): huruf = KOLOM rekap A–D, bukan nama jobdesk
 * individual. Jobdesk "menempel" (Plating/Dishwasher → C, Helper → D) tidak
 * membuat kolom baru, jadi "E - Helper / Floating" milik dropdown lama dihitung
 * sebagai D supaya memilihnya tetap dianggap menutup kolom D.
 */

export const KITCHEN_STATION_LETTERS = [
  { letter: 'A', label: 'Main Cook' },
  { letter: 'B', label: 'Support Cook' },
  { letter: 'C', label: 'Checker / Stock' },
  { letter: 'D', label: 'Runner / Area' },
];

/**
 * Nama lengkap jobdesk (potongan kitchen_station) → huruf A–D.
 * Sengaja longgar (case-insensitive, substring) supaya jobdesk kustom admin
 * (mis. "Cuci Alat", "Sanitation") tetap terpetakan seperti di backend.
 */
const NAME_TO_LETTER = [
  ['A', [/main\s*cook|head\s*cook|kepala/i]],
  ['B', [/support|snack/i]],
  ['C', [/checker|stock|stok|plating|dishwash|cuci|sanitation/i]],
  ['D', [/runner|area|helper|floating/i]],
];

/** Huruf A–D dari SATU nama jobdesk; null bila tidak dikenali. */
export function stationLetterOf(name) {
  const raw = String(name || '').trim();
  if (!raw) return null;
  for (const [letter, patterns] of NAME_TO_LETTER) {
    if (patterns.some((re) => re.test(raw))) return letter;
  }
  return null;
}

/** Huruf A–D unik dari nilai kitchen_station ('X + Y + Z'), urut A→D. */
export function stationLettersOf(station) {
  const raw = String(station || '');
  if (!raw.trim()) return [];
  const found = new Set(
    raw.split(' + ').map((part) => stationLetterOf(part.trim())).filter(Boolean),
  );
  return KITCHEN_STATION_LETTERS.map((s) => s.letter).filter((L) => found.has(L));
}

/** Label singkat "A — Main Cook" dsb. */
export function stationLetterLabel(letter) {
  const found = KITCHEN_STATION_LETTERS.find((s) => s.letter === letter);
  return found ? `${found.letter} — ${found.label}` : letter;
}

/**
 * Huruf stasiun yang belum ada pegangannya pada satu tanggal, dari data coverage
 * backend. Mengembalikan [] bila tanggal itu libur dapur / belum ada datanya.
 */
export function missingStationLetters(coverageByDate, dateKey) {
  const day = coverageByDate?.[dateKey];
  return day && Array.isArray(day.missing) ? day.missing : [];
}
