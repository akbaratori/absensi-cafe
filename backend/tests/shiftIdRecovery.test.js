const { parseShiftNumber, findShiftById } = require('../src/utils/shiftResolver');
const prisma = require('../src/utils/database');

/**
 * Pemulihan `shiftId` yang MENGGANTUNG.
 *
 * Bug produksi yang dijaga: dua baris UserSchedule menyimpan `shiftId = 2`,
 * padahal tabel `shifts` hanya berisi id 1, 3, 5. Pembacaan naif
 * (`include: { shift: true }`) mengembalikan relasi null, sehingga record
 * absensi yang dibuat lewat jalur itu kehilangan info shift: `lateMinutes`
 * dihitung terhadap jam default 08:00 dan staff shift 2 yang masuk 11:00
 * tercatat "telat ~180 menit".
 *
 * `findShiftById` harus memulihkan lewat NAMA (nomor shift 2 -> baris
 * "Shift 2"), BUKAN mengembalikan baris id 2 yang tidak ada.
 */
describe('findShiftById — shiftId menggantung', () => {
    it('mengembalikan baris shift apa adanya bila id valid', async () => {
        const map = await require('../src/utils/shiftResolver').loadShiftMapByNumber();
        const shift2 = map.get(2);
        expect(shift2).toBeDefined();

        const hasil = await findShiftById(shift2.id);
        expect(hasil).not.toBeNull();
        expect(hasil.id).toBe(shift2.id);
        expect(hasil.startTime).toBe(shift2.startTime);
        expect(hasil.recoveredFrom).toBeNull();
    });

    it('memulihkan id menggantung lewat NAMA, bukan mengembalikan null', async () => {
        // Cari id yang benar-benar tidak ada di tabel shifts.
        const ada = new Set((await prisma.shift.findMany({ select: { id: true } })).map((s) => s.id));
        const menggantung = [2, 4, 6].find((id) => !ada.has(id));

        if (menggantung === undefined) {
            // Environment ini punya id berurutan; tidak ada yang perlu dipulihkan.
            return;
        }

        const hasil = await findShiftById(menggantung);
        expect(hasil).not.toBeNull();
        expect(hasil.recoveredFrom).toBe(menggantung);
        // Nama wajib cocok dengan nomor yang diminta — kalau tidak, staff justru
        // dinilai dengan jam shift yang salah.
        expect(parseShiftNumber(hasil.name)).toBe(menggantung);
        expect(typeof hasil.startTime).toBe('string');
    });

    it('id yang tidak punya padanan nama -> null (pemanggil pakai fallback)', async () => {
        expect(await findShiftById(9999)).toBeNull();
    });

    it('null/undefined/NaN -> null tanpa query', async () => {
        expect(await findShiftById(null)).toBeNull();
        expect(await findShiftById(undefined)).toBeNull();
        expect(await findShiftById('bukan-angka')).toBeNull();
    });

    it('menerima id bertipe string (hasil select yang tipenya meleset)', async () => {
        const map = await require('../src/utils/shiftResolver').loadShiftMapByNumber();
        const target = map.get(1) || map.values().next().value;
        const hasil = await findShiftById(String(target.id));
        expect(hasil?.id).toBe(target.id);
    });

    it('setiap lingkungan: jumlah pemulihan konsisten dengan jumlah nama shift', async () => {
        // Kontrak yang penting: selama baris "Shift N" ada, findShiftById(N)
        // tidak boleh mengembalikan null — karena itulah satu-satunya cara
        // absensi lama tetap bisa dinilai dengan jam shift yang benar.
        const map = await require('../src/utils/shiftResolver').loadShiftMapByNumber();
        for (const [nomor, shift] of map) {
            const hasil = await findShiftById(nomor);
            expect(hasil).not.toBeNull();
            expect(parseShiftNumber(hasil.name)).toBe(nomor);
            expect(hasil.startTime).toBe(shift.startTime);
        }
    });
});
