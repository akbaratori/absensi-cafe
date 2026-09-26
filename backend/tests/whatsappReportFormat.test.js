/**
 * Test format pesan WhatsApp & guard header cron.
 *
 * Latar: layanan cron di luar aplikasi pernah menempelkan header
 *   "Cronjob Response: laporan-absensi-harian
 *    (job_id: 87ba56470480)"
 * di depan pesan. Header itu metadata internal — tidak perlu dibaca pegawai.
 * Yang dijaga di sini: header tersebut tidak pernah lolos, isi pesan tetap utuh,
 * dan laporan harian tampil langsung ke inti.
 *
 * Semua fungsi yang diuji murni (tanpa jaringan), jadi tidak ada panggilan Fonnte.
 */
process.env.FONNTE_TOKEN = '';
process.env.WA_GROUP_TARGET = '';

const {
    stripCronNoise,
    prepareOutgoingMessage,
    buildDailyAttendanceReport,
} = require('../src/services/whatsappService');

const HEADER = 'Cronjob Response: laporan-absensi-harian';

describe('stripCronNoise', () => {
    it('membuang header dua baris "Cronjob Response" + "(job_id)"', () => {
        const input = `${HEADER}\n(job_id: 87ba56470480)\n\nLAPORAN ABSENSI HARIAN CAFE\nTotal: 10`;
        expect(stripCronNoise(input)).toBe('LAPORAN ABSENSI HARIAN CAFE\nTotal: 10');
    });

    it('membuang header satu baris', () => {
        const input = `${HEADER} (job_id: 87ba56470480)\nLAPORAN ABSENSI HARIAN CAFE`;
        expect(stripCronNoise(input)).toBe('LAPORAN ABSENSI HARIAN CAFE');
    });

    it('membuang header dengan CRLF dan indentasi', () => {
        const input = `  ${HEADER}\r\n\r\n(job_id: 87ba56470480)\r\n\r\nLAPORAN ABSENSI HARIAN CAFE`;
        expect(stripCronNoise(input)).toBe('LAPORAN ABSENSI HARIAN CAFE');
    });

    it('membuang header yang menumpuk (job terantre beberapa kali)', () => {
        const input = 'Cronjob Response: a (job_id: 1)\nCronjob Response: b (job_id: 2)\nLAPORAN ABSENSI HARIAN CAFE';
        expect(stripCronNoise(input)).toBe('LAPORAN ABSENSI HARIAN CAFE');
    });

    it('tidak mengubah pesan biasa', () => {
        const input = '🏪 *LAPORAN ABSEN MASUK*\n👤 Budi';
        expect(stripCronNoise(input)).toBe(input);
    });

    it('tidak memotong job_id yang muncul di tengah pesan', () => {
        const input = 'LAPORAN ABSENSI HARIAN CAFE\njob_id: 123';
        expect(stripCronNoise(input)).toBe(input);
    });

    it('aman untuk nilai kosong / null', () => {
        expect(stripCronNoise('')).toBe('');
        expect(stripCronNoise(null)).toBe(null);
        expect(stripCronNoise(undefined)).toBe(undefined);
    });
});

describe('prepareOutgoingMessage', () => {
    it('mengembalikan pesan bersih + target', () => {
        const res = prepareOutgoingMessage(`${HEADER}\n(job_id: 1)\n\nHalo`, '628@g.us');
        expect(res).toEqual({ ok: true, target: '628@g.us', message: 'Halo' });
    });

    it('menolak pesan yang isinya hanya header cron', () => {
        const res = prepareOutgoingMessage(`${HEADER}\n(job_id: 1)`);
        expect(res.ok).toBe(false);
        expect(res.reason).toMatch(/kosong/i);
    });
});

describe('buildDailyAttendanceReport', () => {
    const data = {
        date: '2026-02-14',
        summary: {
            totalEmployees: 12, present: 9, late: 2, absent: 1, halfDay: 0, notClockedIn: 0,
        },
        records: [
            { status: 'LATE', user: { fullName: 'Budi' } },
            { status: 'PRESENT', user: { fullName: 'Andi' } },
            { status: 'LATE', user: { fullName: 'Siti' } },
        ],
    };

    it('judulnya langsung ke inti, tanpa embel-embel teknis', () => {
        const msg = buildDailyAttendanceReport(data);
        expect(msg.startsWith('🏪 *LAPORAN ABSENSI HARIAN CAFE*')).toBe(true);
        expect(msg).not.toMatch(/cronjob/i);
        expect(msg).not.toMatch(/job_id/i);
    });

    it('memuat semua angka ringkasan', () => {
        const msg = buildDailyAttendanceReport(data);
        expect(msg).toContain('Sabtu, 14 Februari 2026');
        expect(msg).toContain('Total pegawai: *12*');
        expect(msg).toContain('Tepat waktu: *9*');
        expect(msg).toContain('Terlambat: *2* (Budi, Siti)');
        expect(msg).toContain('Tidak masuk: *1*');
    });

    it('tidak menyebut nama siapa pun kalau tidak ada yang terlambat', () => {
        const msg = buildDailyAttendanceReport({
            date: '2026-02-15',
            summary: { totalEmployees: 3, present: 3, late: 0, absent: 0, halfDay: 0, notClockedIn: 0 },
            records: [{ status: 'PRESENT', user: { fullName: 'Andi' } }],
        });
        expect(msg).toContain('Terlambat: *0*');
        expect(msg).not.toMatch(/\(.*\)\s*$/m);
    });

    it('tetap terbentuk walau data kosong', () => {
        const msg = buildDailyAttendanceReport();
        expect(msg.startsWith('🏪 *LAPORAN ABSENSI HARIAN CAFE*')).toBe(true);
        expect(msg).toContain('Total pegawai: *0*');
    });
});
