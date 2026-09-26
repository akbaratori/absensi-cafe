/**
 * Test rangkuman jumlah jobdesk SELURUH pegawai (GET /schedules/jobdesk-summary).
 *
 * Endpoint ini dipakai panel admin "Rangkuman Jobdesk Pegawai". Yang dijaga:
 *   1. hanya ADMIN (401 tanpa token, 403 non-admin);
 *   2. rute tidak tertangkap oleh '/:userId';
 *   3. total jobdesk = Σ hari per jobdesk (nilai rangkap dihitung per jobdesk);
 *   4. angkanya IDENTIK dengan rekap keadilan & rekap personal staff — inti
 *      janji "tidak ada dua tampilan yang bisa berbeda".
 */
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/utils/database');
const { generateAccessToken } = require('../src/utils/jwt');

const BASE = '/api/v1/schedules/jobdesk-summary';
const FAIRNESS_BASE = '/api/v1/schedules/jobdesk-fairness';
const MINE_BASE = '/api/v1/schedules/my-jobdesk-summary';
const MONTH = '2026-05';
const START = new Date(Date.UTC(2026, 4, 1));

let adminToken;
let employeeToken;
const createdUserIds = [];

const dayOffset = (n) => new Date(START.getTime() + n * 86400000);

const createKitchenUser = async (fullName) => {
    const user = await prisma.user.create({
        data: {
            username: `jobdesk_sum_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            passwordHash: 'x',
            fullName,
            department: 'KITCHEN',
            isActive: true,
        },
    });
    createdUserIds.push(user.id);
    return user;
};

const addDay = (userId, offset, kitchenStation) =>
    prisma.userSchedule.create({
        data: { userId, date: dayOffset(offset), isOffDay: false, kitchenStation },
    });

const fetchSummary = (token, month = MONTH) =>
    request(app).get(`${BASE}?month=${month}`).set('Authorization', `Bearer ${token}`);

describe('Rangkuman jobdesk seluruh pegawai (jobdesk-summary)', () => {
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

    it('menolak request tanpa month (400)', async () => {
        const res = await request(app).get(BASE).set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('menolak format month tidak valid (400)', async () => {
        for (const bad of ['2026-13', '2026/05', 'Mei', 'x']) {
            const res = await fetchSummary(adminToken, bad);
            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        }
    });

    it('rute tidak tertangkap oleh "/:userId" dan mengembalikan struktur laporan', async () => {
        const res = await fetchSummary(adminToken);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.month).toBe(MONTH);
        expect(Array.isArray(res.body.data.roles)).toBe(true);
        expect(Array.isArray(res.body.data.staff)).toBe(true);
        expect(Array.isArray(res.body.data.byJobdesk)).toBe(true);
        expect(res.body.data.summary).toBeDefined();
    });
});

describe('perhitungan angka', () => {
    const NAME_A = 'Uji Summary A';
    const NAME_B = 'Uji Summary B';

    let userA;
    let userB;
    let tokenA;

    beforeAll(async () => {
        [userA, userB] = await Promise.all([createKitchenUser(NAME_A), createKitchenUser(NAME_B)]);

        // A: 3 hari rangkap 'Checker / Stock + Plating' → 3x Checker DAN 3x
        //    Plating = 6 jobdesk dari 3 hari kerja (rangkap dihitung per jobdesk).
        for (let i = 0; i < 3; i++) await addDay(userA.id, i, 'Checker / Stock + Plating');
        // B: 2 hari Main Cook saja → 2 jobdesk.
        for (let i = 0; i < 2; i++) await addDay(userB.id, i, 'Main Cook');

        tokenA = generateAccessToken({ userId: userA.id, role: 'EMPLOYEE' });
    });

    it('menghitung total jobdesk per pegawai dengan rangkap dihitung per jobdesk', async () => {
        const res = await fetchSummary(adminToken);
        expect(res.status).toBe(200);

        const rowA = res.body.data.staff.find((s) => s.userId === userA.id);
        const rowB = res.body.data.staff.find((s) => s.userId === userB.id);

        expect(rowA.totalJobdesk).toBe(6);
        expect(rowA.jobdeskTypes).toBe(2);
        expect(rowA.counts.CHECKER).toBe(3);
        expect(rowA.counts.PLATING).toBe(3);
        expect(rowA.daysWorked).toBe(3);

        expect(rowB.totalJobdesk).toBe(2);
        expect(rowB.jobdeskTypes).toBe(1);
    });

    it('mengurutkan pegawai dari yang paling banyak mengerjakan jobdesk', async () => {
        const res = await fetchSummary(adminToken);
        const totals = res.body.data.staff.map((s) => s.totalJobdesk);
        const sorted = [...totals].sort((a, b) => b - a);
        expect(totals).toEqual(sorted);
    });

    it('sebaran tiap jobdesk menjumlah tepat sama dengan total seluruh pegawai', async () => {
        const res = await fetchSummary(adminToken);
        const { staff, byJobdesk, summary } = res.body.data;

        const sumStaff = staff.reduce((a, s) => a + s.totalJobdesk, 0);
        const sumByJobdesk = byJobdesk.reduce((a, j) => a + j.total, 0);

        expect(sumByJobdesk).toBe(sumStaff);
        expect(summary.totalJobdesk).toBe(sumStaff);

        for (const j of byJobdesk) {
            const fromStaff = staff.reduce((a, s) => a + (s.counts[j.key] || 0), 0);
            expect(j.total).toBe(fromStaff);
        }
    });

    it('angka tiap pegawai identik dengan rekap keadilan dan rekap personalnya', async () => {
        const [summaryRes, fairnessRes, mineRes] = await Promise.all([
            fetchSummary(adminToken),
            request(app).get(`${FAIRNESS_BASE}?month=${MONTH}`).set('Authorization', `Bearer ${adminToken}`),
            request(app).get(`${MINE_BASE}?month=${MONTH}`).set('Authorization', `Bearer ${tokenA}`),
        ]);

        const row = summaryRes.body.data.staff.find((s) => s.userId === userA.id);
        const fair = fairnessRes.body.data.staff.find((s) => s.userId === userA.id);

        // Rekap keadilan (admin) — sumber yang sama.
        expect(row.counts).toEqual(fair.counts);
        expect(row.daysWorked).toBe(fair.daysWorked);
        expect(row.loadPerDay).toBe(fair.loadPerDay);
        expect(row.totalJobdesk).toBe(Object.values(fair.counts).reduce((a, b) => a + b, 0));

        // Rekap personal (staff) — angka yang dilihat pegawai sendiri.
        expect(row.counts).toEqual(mineRes.body.data.days);
        expect(row.daysWorked).toBe(mineRes.body.data.daysWorked);
        expect(row.totalJobdesk).toBe(mineRes.body.data.totalJobdesk);
    });

    it('menandai pegawai yang paling sering dapat tiap jobdesk', async () => {
        const res = await fetchSummary(adminToken);
        const checker = res.body.data.byJobdesk.find((j) => j.key === 'CHECKER');

        expect(checker.topStaff.userId).toBe(userA.id);
        expect(checker.topStaff.count).toBe(3);
        expect(checker.max).toBe(3);
    });
});

// __NEXT__

beforeAll(async () => {
    const [admin, employee] = await Promise.all([
        prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, role: true } }),
        prisma.user.findFirst({ where: { role: 'EMPLOYEE' }, select: { id: true, role: true } }),
    ]);
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
