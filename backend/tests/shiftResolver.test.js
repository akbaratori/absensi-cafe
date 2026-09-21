const prisma = require('../src/utils/database');
const { parseShiftNumber, loadShiftMapByNumber } = require('../src/utils/shiftResolver');

/**
 * Pemetaan nomor shift <-> baris tabel `shifts`.
 *
 * Bug yang dijaga di sini: `shiftNumber` (1/2/3) di banyak tabel BUKAN primary
 * key tabel `shifts`. Di produksi id-nya tidak berurutan (1, 3, 5). Dua asumsi
 * yang tampak wajar jadi salah:
 *   - menulis `shiftId = shiftNumber` -> "S2" tersimpan sebagai id 2 (tidak ada)
 *   - membaca `allShifts[n-1]`        -> benar hanya karena kebetulan
 *
 * Karena itu sumber kebenaran = NAMA shift, bukan urutan array.
 */
describe('Pemetaan shiftNumber <-> shiftId', () => {
  describe('parseShiftNumber (murni, tanpa DB)', () => {
    it('membaca nama shift standar', () => {
      expect(parseShiftNumber('Shift 1')).toBe(1);
      expect(parseShiftNumber('Shift 2')).toBe(2);
      expect(parseShiftNumber('Shift 3')).toBe(3);
    });

    it('toleran terhadap embel-embel dan spasi', () => {
      // Nama berbeda antar environment: produksi "Shift 2", staging "Shift 2 (Siang)".
      expect(parseShiftNumber('Shift 1 (Pagi)')).toBe(1);
      expect(parseShiftNumber('Shift 2 (Siang)')).toBe(2);
      expect(parseShiftNumber('  Shift 10  ')).toBe(10);
      expect(parseShiftNumber('shift3')).toBe(3);
    });

    it('mengembalikan null bila nama tidak memuat nomor shift', () => {
      expect(parseShiftNumber('Shift Malam')).toBeNull();
      expect(parseShiftNumber('Pagi')).toBeNull();
      expect(parseShiftNumber('')).toBeNull();
      expect(parseShiftNumber(null)).toBeNull();
      expect(parseShiftNumber(undefined)).toBeNull();
    });
  });

  describe('loadShiftMapByNumber', () => {
    const TAG = 'Shift 9 (test)';
    let tempId = null;

    afterAll(async () => {
      if (tempId) await prisma.shift.deleteMany({ where: { id: tempId } });
    });

    it('setiap entri peta konsisten dengan NAMA-nya', async () => {
      const map = await loadShiftMapByNumber();
      expect(map.size).toBeGreaterThan(0);
      for (const [num, s] of map) {
        expect(parseShiftNumber(s.name)).toBe(num);
      }
    });

    it('memetakan lewat NAMA, bukan posisi array', async () => {
      // Shift nomor 9 ditaruh di akhir tabel. Kalau pemetaan memakai posisi
      // array (`allShifts[n-1]`), nomor 9 TIDAK akan ketemu. Dengan pemetaan
      // berbasis nama, nomor 9 harus menunjuk tepat ke id shift ini.
      const created = await prisma.shift.create({
        data: { name: TAG, startTime: '00:00', endTime: '00:01' },
      });
      tempId = created.id;

      const map = await loadShiftMapByNumber();
      expect(map.get(9)).toBeTruthy();
      expect(map.get(9).id).toBe(created.id);
      expect(map.get(9).name).toBe(TAG);
    });
  });
});
