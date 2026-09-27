const { calculateAttendanceStatus, toWITA } = require('../src/utils/attendanceHelpers');

/**
 * Semantik toleransi keterlambatan (`lateGraceMinutes`).
 *
 * Keluhan nyata yang dijaga di sini: "kenapa jam 11 lewat 1 menit sudah
 * dianggap terlambat? Toleransinya kan sampai 11:15."
 *
 * Dua kesalahan yang pernah terjadi:
 *   1. `lateMinutes` diukur dari JAM MULAI shift, bukan dari akhir toleransi.
 *      Akibatnya telat 1 menit tampil sebagai "telat 16 menit" dan denda
 *      melonjak ke tier yang salah.
 *   2. `Math.max(1, ...)` di /my-penalty membuat jam masuk yang masih DI DALAM
 *      toleransi tetap tercatat "telat 1 mnt" berikut denda Rp 7.500.
 *
 * Aturan yang benar: selama jam masuk <= mulai + toleransi, tidak ada
 * keterlambatan sama sekali (lateMinutes 0, tanpa denda).
 *
 * Semua waktu di bawah ditulis sebagai instant yang setara WITA (UTC+8),
 * karena calculateAttendanceStatus menerima clock-in UTC lalu mengonversinya.
 */
describe('Toleransi keterlambatan — calculateAttendanceStatus', () => {
    const CFG_SHIFT_2 = { workStartTime: '11:00', lateGraceMinutes: 15 };
    const CFG_SHIFT_1 = { workStartTime: '08:15', lateGraceMinutes: 15 };

    /** Instant untuk jam WITA pada tanggal 26 Sep 2026. */
    const wita = (hhmm) => new Date(`2026-09-26T${hhmm}:00+08:00`);

    it('jam masuk sebelum shift dimulai -> PRESENT, 0 menit', () => {
        expect(calculateAttendanceStatus(wita('10:45'), CFG_SHIFT_2))
            .toMatchObject({ status: 'PRESENT', lateMinutes: 0 });
    });

    it('tepat jam mulai -> PRESENT, 0 menit', () => {
        expect(calculateAttendanceStatus(wita('11:00'), CFG_SHIFT_2))
            .toMatchObject({ status: 'PRESENT', lateMinutes: 0 });
    });

    it('11:01 untuk shift 2 -> PRESENT, 0 menit (BUKAN telat 1 menit)', () => {
        // Inti keluhan: masih di dalam toleransi 15 menit, jadi tidak telat.
        expect(calculateAttendanceStatus(wita('11:01'), CFG_SHIFT_2))
            .toMatchObject({ status: 'PRESENT', lateMinutes: 0 });
    });

    it('11:14 dan 11:15 (batas toleransi) -> PRESENT, 0 menit', () => {
        expect(calculateAttendanceStatus(wita('11:14'), CFG_SHIFT_2))
            .toMatchObject({ status: 'PRESENT', lateMinutes: 0 });
        // Batas inklusif: tepat di menit terakhir toleransi belum dihitung telat.
        expect(calculateAttendanceStatus(wita('11:15'), CFG_SHIFT_2))
            .toMatchObject({ status: 'PRESENT', lateMinutes: 0 });
    });

    it('11:16 -> LATE 1 menit (dihitung dari akhir toleransi)', () => {
        expect(calculateAttendanceStatus(wita('11:16'), CFG_SHIFT_2))
            .toMatchObject({ status: 'LATE', lateMinutes: 1 });
    });

    it('11:31 -> LATE 16 menit (bukan 31 menit)', () => {
        // Rumus lama: masuk 11:31 tercatat telat 31 menit sehingga jatuh ke tier
        // denda tertinggi. Yang benar: 31 - 15 = 16 menit.
        expect(calculateAttendanceStatus(wita('11:31'), CFG_SHIFT_2))
            .toMatchObject({ status: 'LATE', lateMinutes: 16 });
    });

    it('11:46 -> LATE 31 menit', () => {
        expect(calculateAttendanceStatus(wita('11:46'), CFG_SHIFT_2))
            .toMatchObject({ status: 'LATE', lateMinutes: 31 });
    });

    it('berlaku sama untuk shift 1 (08:15 + 15 mnt = 08:30)', () => {
        expect(calculateAttendanceStatus(wita('08:30'), CFG_SHIFT_1))
            .toMatchObject({ status: 'PRESENT', lateMinutes: 0 });
        expect(calculateAttendanceStatus(wita('08:31'), CFG_SHIFT_1))
            .toMatchObject({ status: 'LATE', lateMinutes: 1 });
    });

    it('toleransi 0 menit -> lewat 1 menit pun sudah LATE', () => {
        const cfg = { workStartTime: '11:00', lateGraceMinutes: 0 };
        expect(calculateAttendanceStatus(wita('11:00'), cfg))
            .toMatchObject({ status: 'PRESENT', lateMinutes: 0 });
        expect(calculateAttendanceStatus(wita('11:01'), cfg))
            .toMatchObject({ status: 'LATE', lateMinutes: 1 });
    });

    it('toleransi dari config string tetap terbaca sebagai angka', () => {
        // SystemConfig menyimpan value sebagai String. Selain itu, konfigurasi
        // hilang/NaN harus jatuh ke default 15 menit — bukan diam-diam 0 menit
        // (yang akan menelatkan semua orang) atau NaN (yang membuat perbandingan
        // waktu selalu gagal sehingga tidak ada yang pernah telat).
        expect(calculateAttendanceStatus(wita('11:20'), { workStartTime: '11:00', lateGraceMinutes: '15' }))
            .toMatchObject({ status: 'LATE', lateMinutes: 5 });

        for (const bad of [undefined, null, NaN, '']) {
            expect(calculateAttendanceStatus(wita('11:15'), { workStartTime: '11:00', lateGraceMinutes: bad }))
                .toMatchObject({ status: 'PRESENT', lateMinutes: 0 });
            expect(calculateAttendanceStatus(wita('11:16'), { workStartTime: '11:00', lateGraceMinutes: bad }))
                .toMatchObject({ status: 'LATE', lateMinutes: 1 });
        }
    });

    it('mengembalikan graceMinutes yang dipakai supaya UI bisa menjelaskannya', () => {
        expect(calculateAttendanceStatus(wita('11:00'), CFG_SHIFT_2).graceMinutes).toBe(15);
        expect(calculateAttendanceStatus(wita('11:00'), { workStartTime: '11:00' }).graceMinutes).toBe(15);
    });

    it('selalu LATE minimal 1 menit begitu melewati toleransi (tidak pernah 0)', () => {
        // 11:15:30 WITA sudah lewat batas, tetapi selisihnya 30 detik; pembulatan
        // Math.ceil tetap harus menghasilkan 1, bukan 0.
        const hasil = calculateAttendanceStatus(new Date('2026-09-26T11:15:30+08:00'), CFG_SHIFT_2);
        expect(hasil.status).toBe('LATE');
        expect(hasil.lateMinutes).toBeGreaterThanOrEqual(1);
    });

    it('toWITA menggeser instant ke jam WITA (dasar perbandingan jam shift)', () => {
        // Shift disimpan dalam WITA, clock-in disimpan UTC. Tanpa konversi ini,
        // staff yang masuk 11:00 WITA dibandingkan dengan jam server.
        const clockIn = new Date('2026-09-26T03:00:00.000Z'); // 11:00 WITA
        expect(toWITA(clockIn).getUTCHours()).toBe(11);
        expect(toWITA(clockIn).getUTCMinutes()).toBe(0);
    });
});
