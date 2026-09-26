/**
 * Test rekap keadilan jobdesk (GET /schedules/jobdesk-fairness).
 *
 * Yang dijaga di sini adalah hal-hal yang dulu salah pada rekap lama
 * (endpoint station-summary yang sudah dihapus):
 *   1. jobdesk rangkap ('Checker / Stock + Plating') harus dihitung DUA kali,
 *      bukan hanya potongan pertama;
 *   2. pembanding keadilan adalah beban rata-rata per hari kerja, sehingga
 *      staff dengan jumlah hari kerja berbeda tetap bisa dibandingkan;
 *   3. jobdesk yang distribusinya timpang ditandai (selisih > 3 hari, §4.4).
 */
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/utils/database');
const { generateAccessToken } = require('../src/utils/jwt');

/**
 * Uji endpoint rekap keadilan jobdesk dapur (GET /api/v1/schedules/jobdesk-fairness).
 *
 * Fokus uji (semua pada bulan uji terpisah '2026-05' agar tidak bentrok dengan
 * data produksi):
 *  - otorisasi (401 tanpa token, 403 bukan ADMIN)
 *  - validasi parameter month
 *  - jobdesk rangkap ('Checker / Stock + Plating') dihitung sebagai 2 jobdesk
 *    — bug rekap lama hanya mengambil potongan pertama sehingga 'Plating' hilang
 *  - pembanding keadilan = beban rata-rata per hari kerja (bukan total), supaya
 *    staff dengan jumlah hari kerja berbeda tetap setara
 *  - hari kerja tanpa jobdesk terhitung sebagai data bolong
 *  - jobdesk dengan selisih hari antar staff > 3 ditandai timpang (§4.4)
 */
const BASE = '/api/v1/schedules/jobdesk-fairness';
const MONTH = '2026-05';
const START = new Date(Date.UTC(2026, 4, 4));

let adminToken;
let employeeToken;
const createdUserIds = [];

const dayOffset = (n) => new Date(START.getTime() + n * 86400000);

const createKitchenUser = async (fullName) => {
    const user = await prisma.user.create({
        data: {
            username: `jobdesk_fair_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            passwordHash: 'x',
            fullName,
            department: 'KITCHEN',
            isActive: true,
        },
    });
    createdUserIds.push(user.id);
    return user;
};

/** Simpan satu hari kerja + nilai kitchen_station-nya. */
const addDay = (userId, offset, kitchenStation, isOffDay = false) =>
    prisma.userSchedule.create({
        data: {
            userId,
            date: dayOffset(offset),
            isOffDay,
            kitchenStation,
        },
    });

const fetchReport = (month = MONTH) =>
    request(app)
        .get(`${BASE}?month=${month}`)
        .set('Authorization', `Bearer ${adminToken}`);

const staffBy = (body, fullName) => body.data.staff.find((s) => s.fullName === fullName);

describe('Rekap keadilan jobdesk dapur', () => {
    it('menolak request tanpa token (401)', async () => {
        const res = await request(app).get(`${BASE}?month=${MONTH}`);
        expect(res.status).toBe(401);
    });

    it('menolak non-ADMIN (403)', async () => {
        const res = await request(app)
            .get(`${BASE}?month=${MONTH}`)
            .set('Authorization', `Bearer ${employeeToken}`);
        expect(res.status).toBe(403);
    });

    it('menolak format month tidak valid (400)', async () => {
        for (const bad of ['2026-13', '2026/05', 'Mei', '']) {
            const res = await fetchReport(bad);
            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        }
    });

    it('menolak request tanpa month (400)', async () => {
        const res = await request(app).get(BASE).set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    describe('perhitungan jobdesk rangkap & beban', () => {
        // Uji memakai nama unik supaya bisa dibedakan dari data produksi bulan sama.
        const NAME_RANGKAP = 'Uji Rangkap Fairness';
        const NAME_LAMA = 'Uji Lama Fairness';
        const NAME_KOSONG = 'Uji Kosong Fairness';

        let rangkap;
        let lama;
        let kosong;

        beforeAll(async () => {
            [rangkap, lama, kosong] = await Promise.all([
                createKitchenUser(NAME_RANGKAP),
                createKitchenUser(NAME_LAMA),
                createKitchenUser(NAME_KOSONG),
            ]);

            // Rangkap: 3 hari 'Checker / Stock + Plating' → 3x Checker DAN 3x Plating.
            for (let i = 0; i < 3; i++) await addDay(rangkap.id, i, 'Checker / Stock + Plating');
            // Lama: 6 hari 'Checker / Stock + Runner / Area' → 6x Checker + 6x Runner.
            for (let i = 0; i < 6; i++) await addDay(lama.id, i, 'Checker / Stock + Runner / Area');
            // Kosong: 4 hari kerja tanpa jobdesk + 4 hari libur (libur tidak dihitung).
            for (let i = 0; i < 4; i++) await addDay(kosong.id, i, null);
            for (let i = 4; i < 8; i++) await addDay(kosong.id, i, 'Main Cook', true);
        });

        it('menghitung SEMUA jobdesk dalam nilai rangkap (bukan potongan pertama)', async () => {
            const res = await fetchReport();
            expect(res.status).toBe(200);

            const s = staffBy(res.body, NAME_RANGKAP);
            expect(s).toBeDefined();
            expect(s.counts.CHECKER).toBe(3);
            // Inilah regresi utama rekap lama: Plating hilang dari nilai rangkap.
            expect(s.counts.PLATING).toBe(3);
            expect(s.multiJobdeskDays).toBe(3);

            // Beban/hari = (Checker 3 + Plating 3) = 6 tiap hari, dibagi 3 hari = 6.
            // Rangkap berarti satu hari menanggung dua jobdesk sekaligus.
            expect(s.daysWorked).toBe(3);
            expect(s.loadTotal).toBe(18);
            expect(s.loadPerDay).toBe(6);
        });

        it('memakai beban rata-rata per hari kerja, bukan total, untuk membandingkan', async () => {
            const res = await fetchReport();
            const rangkapS = staffBy(res.body, NAME_RANGKAP);
            const lamaS = staffBy(res.body, NAME_LAMA);

            expect(lamaS.counts.CHECKER).toBe(6);
            expect(lamaS.counts.RUNNER).toBe(6);
            // 6 hari x (Checker 3 + Runner 2) = 30, dibagi 6 hari kerja = 5.
            expect(lamaS.loadTotal).toBe(30);
            expect(lamaS.loadPerDay).toBe(5);

            // Inti normalisasi: dari beban TOTAL, staff 6 hari terlihat lebih berat
            // (30 vs 18) padahal beban HARIAN-nya justru lebih ringan (5 vs 6).
            // Tanpa `loadPerDay`, staff yang sekadar lebih banyak masuk kerja akan
            // selalu tampak "paling berat".
            expect(lamaS.loadTotal).toBeGreaterThan(rangkapS.loadTotal);
            expect(rangkapS.loadPerDay).toBeGreaterThan(lamaS.loadPerDay);
        });

        it('menandai hari kerja tanpa jobdesk', async () => {
            const res = await fetchReport();
            const s = staffBy(res.body, NAME_KOSONG);
            expect(s.daysWorked).toBe(4); // hari libur tidak dihitung
            expect(s.daysWithoutJobdesk).toBe(4);
            expect(s.loadPerDay).toBe(0);

            const missing = res.body.data.missingJobdesk.filter((m) => m.fullName === NAME_KOSONG);
            expect(missing).toHaveLength(4);
        });

        it('mengurutkan staff dari beban harian terberat', async () => {
            const res = await fetchReport();
            // Hanya berlaku pada bulan uji yang benar-benar berisi fixture ini,
            // supaya tidak rapuh bila ikut dijalankan di DB berisi data lain.
            const testNames = [NAME_RANGKAP, NAME_LAMA, NAME_KOSONG];
            const testStaff = res.body.data.staff.filter((s) => testNames.includes(s.fullName));
            expect(testStaff).toHaveLength(3);
            // Rangkap 6 > Lama 5 > Kosong 0.
            expect(testStaff.map((s) => s.loadPerDay)).toEqual([6, 5, 0]);

            const loads = res.body.data.staff.map((s) => s.loadPerDay);
            expect(loads).toEqual([...loads].sort((a, b) => b - a));
        });

        it('menandai jobdesk timpang bila selisih hari > 3 (Checker: 6 vs 3)', async () => {
            const res = await fetchReport();
            const checker = res.body.data.byJobdesk.find((j) => j.key === 'CHECKER');
            expect(checker.total).toBeGreaterThanOrEqual(9);
            expect(checker.spread).toBeGreaterThan(3);
            expect(checker.isUneven).toBe(true);
            expect(res.body.data.summary.gapThreshold).toBe(3);

            // Jobdesk yang hanya dipegang satu orang tidak disebut timpang
            // (tidak ada pembanding), meski selisihnya besar.
            const main = res.body.data.byJobdesk.find((j) => j.key === 'MAIN');
            expect(main.isUneven).toBe(false);
        });

        it('menyertakan daftar jobdesk beserta bobotnya untuk header tabel', async () => {
            const res = await fetchReport();
            const roles = res.body.data.roles;
            expect(roles.map((r) => r.key)).toEqual(['MAIN', 'SUPPORT', 'CHECKER', 'PLATING', 'RUNNER', 'HELPER']);
            // Bobot A=5 paling berat … E=1 paling ringan (JOB_DESK_KITCHEN.md).
            expect(roles[0].weight).toBe(5);
            expect(roles[roles.length - 1].weight).toBe(1);
        });
    });
});

beforeAll(async () => {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, role: true } });
    const employee = await prisma.user.findFirst({ where: { role: 'EMPLOYEE' }, select: { id: true, role: true } });

    if (!admin) throw new Error('Butuh minimal 1 user ADMIN di database untuk menjalankan tes ini');
    if (!employee) throw new Error('Butuh minimal 1 user EMPLOYEE di database untuk menjalankan tes ini');

    adminToken = generateAccessToken({ userId: admin.id, role: admin.role });
    employeeToken = generateAccessToken({ userId: employee.id, role: employee.role });
});

afterAll(async () => {
    try {
        if (createdUserIds.length) {
            await prisma.userSchedule.deleteMany({ where: { userId: { in: createdUserIds } } });
            await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
        }
    } finally {
        await prisma.$disconnect();
    }
});
