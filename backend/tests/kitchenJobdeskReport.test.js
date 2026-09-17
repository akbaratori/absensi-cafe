const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/utils/database');
const { generateAccessToken } = require('../src/utils/jwt');

/**
 * Uji endpoint laporan bulanan jobdesk Kitchen.
 *
 * READ-ONLY: tidak membuat/mengubah/menghapus data apa pun. Token dibuat
 * langsung dari user yang sudah ada supaya tes tidak perlu menulis user baru.
 *
 * Fokus uji:
 *  - route '/kitchen-jobdesk-report' TIDAK tertangkap oleh route '/:id'
 *  - otorisasi (401 tanpa token, 403 bukan ADMIN)
 *  - validasi parameter month
 *  - konsistensi struktur laporan + pemisahan rotationVersion 1 vs 2
 */
const BASE = '/api/v1/rotation/kitchen-jobdesk-report';
const MONTH = '2026-09';

describe('Laporan bulanan jobdesk Kitchen', () => {
    let adminToken;
    let employeeToken;

    beforeAll(async () => {
        const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, role: true } });
        const employee = await prisma.user.findFirst({ where: { role: 'EMPLOYEE' }, select: { id: true, role: true } });

        if (!admin) throw new Error('Butuh minimal 1 user ADMIN di database untuk menjalankan tes ini');
        if (!employee) throw new Error('Butuh minimal 1 user EMPLOYEE di database untuk menjalankan tes ini');

        adminToken = generateAccessToken({ userId: admin.id, role: admin.role });
        employeeToken = generateAccessToken({ userId: employee.id, role: employee.role });
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

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

    it('rute tidak tertangkap oleh "/:id" dan mengembalikan laporan', async () => {
        const res = await request(app)
            .get(`${BASE}?month=${MONTH}`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        // Kalau tertangkap '/:id', parseInt('kitchen-jobdesk-report') = NaN dan
        // payload ini tidak akan pernah ada.
        expect(res.body.data.month).toBe(MONTH);
        expect(Array.isArray(res.body.data.daily)).toBe(true);
        expect(Array.isArray(res.body.data.staff)).toBe(true);
        expect(Array.isArray(res.body.data.positions)).toBe(true);
    });

    it('struktur laporan konsisten (hari, total, pemisahan versi)', async () => {
        const res = await request(app)
            .get(`${BASE}?month=${MONTH}`)
            .set('Authorization', `Bearer ${adminToken}`);

        const { summary, daily, staff } = res.body.data;

        expect(res.status).toBe(200);
        expect(summary.daysInMonth).toBe(30);
        expect(daily).toHaveLength(30);
        expect(summary.daysWithData + summary.daysWithoutData).toBe(summary.daysInMonth);

        // Pemisahan rotationVersion 1 (pra-antrian) vs 2 (antrian tetap) harus
        // menjumlah tepat ke total entri.
        expect(summary.byVersion[1].entries + summary.byVersion[2].entries).toBe(summary.totalEntries);

        const entriesInDaily = daily.reduce((n, d) => n + d.entryCount, 0);
        expect(entriesInDaily).toBe(summary.totalEntries);
        expect(staff.reduce((n, s) => n + s.daysWorked, 0)).toBe(summary.totalEntries);

        const allEntries = daily.flatMap((d) => d.entries);
        expect(allEntries.length).toBe(summary.totalEntries);
        for (const e of allEntries) {
            expect([1, 2]).toContain(e.rotationVersion);
            expect(typeof e.packagesAssigned).toBe('string');
            expect(e.packagesAssigned.length).toBeGreaterThan(0);
        }

        // Tanggal berturut-turut dari awal bulan, tanpa duplikat.
        const dates = daily.map((d) => d.date);
        expect(dates[0]).toBe(`${MONTH}-01`);
        expect(new Set(dates).size).toBe(30);

        // daysWithData harus cocok dengan jumlah tanggal yang punya entri.
        expect(summary.daysWithData).toBe(daily.filter((d) => d.hasData).length);
    });

    it('setiap staff punya rekap per versi dan per peran', async () => {
        const res = await request(app)
            .get(`${BASE}?month=${MONTH}`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        for (const s of res.body.data.staff) {
            expect(s.byVersion[1] + s.byVersion[2]).toBe(s.daysWorked);
            const roleTotal = Object.values(s.roleCounts).reduce((a, b) => a + b, 0);
            expect(roleTotal).toBeGreaterThanOrEqual(s.daysWorked);
        }
    });

    it('mendukung filter positionId', async () => {
        const res = await request(app)
            .get(`${BASE}?month=${MONTH}&positionId=2`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.positions).toHaveLength(1);
        expect(res.body.data.positions[0].id).toBe(2);
    });

    it('menolak parameter month tidak valid (400)', async () => {
        for (const bad of ['2026-9', 'September', '2026-13', '2026-00']) {
            const res = await request(app)
                .get(`${BASE}?month=${bad}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        }
    });

    it('menolak request tanpa month (400)', async () => {
        const res = await request(app)
            .get(BASE)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('menolak positionId tidak valid (400)', async () => {
        const res = await request(app)
            .get(`${BASE}?month=${MONTH}&positionId=abc`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
});
