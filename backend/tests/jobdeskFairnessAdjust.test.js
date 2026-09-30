/**
 * Test penyesuaian angka rekap keadilan jobdesk
 * (PUT /api/v1/schedules/jobdesk-fairness/adjust).
 *
 * Yang dijaga di sini adalah hal-hal yang tidak boleh terjadi:
 *  1. Σ A–D yang diinput admin WAJIB sama dengan hari kerja berjobdesk —
 *     kalau tidak, angka di tabel akan bohong soal jadwal.
 *  2. Angka di tabel harus didukung jadwal: setelah adjust, isi
 *     `kitchen_station` berubah sehingga hitungan ulang (GET fairness)
 *     persis sama dengan yang diinput admin.
 *  3. Hari rangkap tidak boleh jadi sumber pemindahan (primary-nya dipindah
 *     berarti jobdesk gabungan dibongkar), dan hari terkunci manual override
 *     juga tidak boleh ditimpa diam-diam.
 *  4. `kitchen_jobdesk_logs` ikut ter-update supaya laporan rotasi bulanan
 *     tidak beda dengan jadwal aktual.
 */
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/utils/database');
const { generateAccessToken } = require('../src/utils/jwt');

/** Bulan uji terpisah supaya tidak bentrok dengan data produksi. */
const BASE = '/api/v1/schedules/jobdesk-fairness';
const ADJUST = `${BASE}/adjust`;
const MONTH = '2026-06';
const START = new Date(Date.UTC(2026, 5, 1)); // 1 Juni 2026

let adminToken;
let employeeToken;
const createdUserIds = [];

const dayOffset = (n) => new Date(START.getTime() + n * 86400000);

const createKitchenUser = async (fullName) => {
    const user = await prisma.user.create({
        data: {
            username: `jobdesk_adj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
const addDay = (userId, offset, kitchenStation, extra = {}) =>
    prisma.userSchedule.create({
        data: {
            userId,
            date: dayOffset(offset),
            isOffDay: false,
            kitchenStation,
            ...extra,
        },
    });

const adjust = (body) =>
    request(app)
        .put(ADJUST)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(body);

const fetchReport = (month = MONTH) =>
    request(app)
        .get(`${BASE}?month=${month}`)
        .set('Authorization', `Bearer ${adminToken}`);

const staffBy = (body, fullName) => body.data.staff.find((s) => s.fullName === fullName);

const sumCounts = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);

describe('Penyesuaian angka rekap keadilan jobdesk (admin)', () => {
    it('menolak request tanpa token (401)', async () => {
        const res = await request(app).put(ADJUST).send({ month: MONTH, userId: 1, targets: {} });
        expect(res.status).toBe(401);
    });

    it('menolak non-ADMIN (403)', async () => {
        const res = await request(app)
            .put(ADJUST)
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({ month: MONTH, userId: 1, targets: {} });
        expect(res.status).toBe(403);
    });

    it('menolak parameter tidak lengkap (400)', async () => {
        for (const bad of [{}, { month: MONTH }, { month: MONTH, userId: 1 }]) {
            const res = await adjust(bad);
            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        }
    });

    it('menolak format month tidak valid (400)', async () => {
        const res = await adjust({ month: '2026/06', userId: 1, targets: { A: 1 } });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    describe('pemindahan hari kerja sesuai angka admin', () => {
        // 3 hari A, 1 hari B, 1 hari C → Σ = 5. Admin mau 2A/1B/2C.
        const NAME = 'Uji Adjust Fairness';
        let user;

        beforeAll(async () => {
            user = await createKitchenUser(NAME);
            for (let i = 0; i < 3; i++) await addDay(user.id, i, 'Main Cook');
            await addDay(user.id, 3, 'Support Cook');
            await addDay(user.id, 4, 'Checker / Stock');
        });

        it('menolak Σ target yang tidak sama dengan hari kerja berjobdesk (400)', async () => {
            const res = await adjust({
                month: MONTH,
                userId: user.id,
                targets: { A: 2, B: 1, C: 1 }, // Σ = 4 ≠ 5
            });
            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.message).toMatch(/harus sama dengan jumlah hari/);
        });

        it('menolak nilai kolom negatif atau bukan bilangan bulat (400)', async () => {
            for (const targets of [{ A: -1, B: 2, C: 2 }, { A: 2.5, B: 1, C: 1.5 }]) {
                const res = await adjust({ month: MONTH, userId: user.id, targets });
                expect(res.status).toBe(400);
                expect(res.body.error.code).toBe('VALIDATION_ERROR');
            }
        });

        it('menolak user yang tidak ada (404)', async () => {
            const res = await adjust({ month: MONTH, userId: 99999999, targets: { A: 1 } });
            expect(res.status).toBe(404);
        });

        it('menggeser jadwal sehingga hitungan kolom = angka yang diinput admin', async () => {
            const res = await adjust({
                month: MONTH,
                userId: user.id,
                targets: { A: 2, B: 1, C: 2 },
            });
            expect(res.status).toBe(200);
            expect(res.body.data.before).toEqual({ A: 3, B: 1, C: 1, D: 0 });
            expect(res.body.data.after).toEqual({ A: 2, B: 1, C: 2, D: 0 });
            expect(res.body.data.changedDays).toBe(1);

            // Hitungan ULANG dari jadwal harus sama persis dengan input admin.
            const report = await fetchReport();
            expect(report.status).toBe(200);
            const s = staffBy(report.body, NAME);
            expect(s.counts).toEqual({ A: 2, B: 1, C: 2, D: 0 });
            // Σ kolom tetap = hari kerja berjobdesk.
            expect(sumCounts(s.counts)).toBe(s.daysWorked);
        });

        it('mengunci hari yang dipindah (manual override) + menyinkronkan log', async () => {
            const row = await prisma.userSchedule.findFirst({
                where: { userId: user.id, kitchenStation: 'Checker / Stock' },
            });
            expect(row).toBeTruthy();
            expect(row.isManualOverride).toBe(true);

            const log = await prisma.kitchenJobdeskLog.findFirst({
                where: { userId: user.id, date: row.date },
            });
            expect(log).toBeTruthy();
            expect(log.packagesAssigned).toBe('Checker / Stock');
            expect(log.roleCode).toBe('CHECKER');
        });
    });

    describe('batas yang menjaga integritas jadwal', () => {
        // 1 hari rangkap (B + C) → primary B, tidak boleh jadi sumber.
        const NAME_RANGKAP = 'Uji Adjust Rangkap';
        let rangkap;

        beforeAll(async () => {
            rangkap = await createKitchenUser(NAME_RANGKAP);
            await addDay(rangkap.id, 0, 'Support Cook + Checker / Stock');
            await addDay(rangkap.id, 1, 'Support Cook');
            await addDay(rangkap.id, 2, 'Support Cook');
        });

        it('menolak target kolom yang lebih kecil dari jumlah hari rangkap', async () => {
            // Ada 1 hari rangkap primary B, jadi target B tidak boleh di bawah 1.
            const res = await adjust({
                month: MONTH,
                userId: rangkap.id,
                targets: { A: 3, B: 0, C: 0, D: 0 },
            });
            expect(res.status).toBe(400);
            expect(res.body.error.message).toMatch(/hari rangkap/);

            // Hari rangkap tetap utuh.
            const row = await prisma.userSchedule.findFirst({
                where: { userId: rangkap.id, date: dayOffset(0) },
            });
            expect(row.kitchenStation).toBe('Support Cook + Checker / Stock');
        });

        it('mempertahankan jobdesk rangkap dan tetap mencapai angka admin', async () => {
            // Naikkan C jadi 1, turunkan B jadi 2 (Σ tetap 3).
            const res = await adjust({
                month: MONTH,
                userId: rangkap.id,
                targets: { A: 0, B: 2, C: 1, D: 0 },
            });
            expect(res.status).toBe(200);

            // Hari pertama (rangkap) primary-nya tetap B → tidak disentuh.
            const row = await prisma.userSchedule.findFirst({
                where: { userId: rangkap.id, date: dayOffset(0) },
            });
            expect(row.kitchenStation).toBe('Support Cook + Checker / Stock');

            const report = await fetchReport();
            const s = staffBy(report.body, NAME_RANGKAP);
            expect(s.counts).toEqual({ A: 0, B: 2, C: 1, D: 0 });
            expect(sumCounts(s.counts)).toBe(s.daysWorked);
        });
    });

    describe('hari kerja tanpa jobdesk', () => {
        const NAME_KOSONG = 'Uji Adjust Kosong';
        let kosong;

        beforeAll(async () => {
            kosong = await createKitchenUser(NAME_KOSONG);
            await addDay(kosong.id, 0, 'Main Cook');
            await addDay(kosong.id, 1, null); // hari kerja tanpa jobdesk
        });

        it('hanya menghitung hari yang sudah berjobdesk', async () => {
            // Hanya 1 hari punya jobdesk, jadi Σ target harus 1.
            const res = await adjust({
                month: MONTH,
                userId: kosong.id,
                targets: { A: 0, B: 0, C: 1, D: 0 },
            });
            expect(res.status).toBe(200);
            expect(res.body.data.after).toEqual({ A: 0, B: 0, C: 1, D: 0 });

            // Σ = 2 padahal hanya 1 hari berjobdesk → ditolak, dengan alasan jelas.
            const bad = await adjust({
                month: MONTH,
                userId: kosong.id,
                targets: { A: 2, B: 0, C: 0, D: 0 },
            });
            expect(bad.status).toBe(400);
            expect(bad.body.error.message).toMatch(/tanpa jobdesk/);
        });
    });

    describe('hari terkunci manual override', () => {
        const NAME_LOCK = 'Uji Adjust Lock';
        let terkunci;

        beforeAll(async () => {
            terkunci = await createKitchenUser(NAME_LOCK);
            await addDay(terkunci.id, 0, 'Main Cook', { isManualOverride: true });
            await addDay(terkunci.id, 1, 'Main Cook');
            await addDay(terkunci.id, 2, 'Main Cook');
        });

        it('tidak menimpa hari terkunci dan menolak target yang memaksanya', async () => {
            // Butuh 3 hari sumber, 1 di antaranya terkunci manual.
            const res = await adjust({
                month: MONTH,
                userId: terkunci.id,
                targets: { A: 0, B: 0, C: 3, D: 0 },
            });
            expect(res.status).toBe(400);
            expect(res.body.error.message).toMatch(/bisa dipindah/);

            const rows = await prisma.userSchedule.findMany({ where: { userId: terkunci.id } });
            expect(rows.every((r) => r.kitchenStation === 'Main Cook')).toBe(true);
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
            await prisma.kitchenJobdeskLog.deleteMany({ where: { userId: { in: createdUserIds } } });
            await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
        }
    } finally {
        await prisma.$disconnect();
    }
});


