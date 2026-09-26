/**
 * Test rekap absensi periode fleksibel (GET /admin/reports/recap).
 *
 * Endpoint ini dipakai panel admin "Rekap Absensi Seluruh Pegawai". Yang dijaga:
 *   1. hanya ADMIN (401 tanpa token, 403 non-admin);
 *   2. periode bisa diminta 4 cara (date / month / start+end / tanpa param)
 *      dan semuanya menghasilkan rentang inklusif yang sama panjangnya;
 *   3. rentang ngawur ditolak 400, bukan 500;
 *   4. angka ringkasan IDENTIK dengan penjumlahan baris pegawai yang dikirim
 *      ke UI — inti janji "kartu dan tabel tidak mungkin berbeda";
 *   5. urutan presedensi: start/end menang, lalu month, lalu date.
 */
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/utils/database');
const { generateAccessToken } = require('../src/utils/jwt');

const BASE = '/api/v1/admin/reports/recap';

// Periode uji yang jauh di masa depan supaya tidak bertabrakan dengan data nyata.
const START = '2031-03-01';
const END = '2031-03-05';
const MONTH = '2031-03';
const DAY = '2031-03-05';
const DAY_MS = 86400000;

let adminToken;
let employeeToken;
let adminUser;
let employeeUser;
const createdUserIds = [];

const dayDate = (offset) => new Date(new Date(`${START}T00:00:00.000Z`).getTime() + offset * DAY_MS);

const createUser = async (fullName, department) => {
    const user = await prisma.user.create({
        data: {
            username: `recap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            passwordHash: 'x',
            fullName,
            department,
            isActive: true,
        },
    });
    createdUserIds.push(user.id);
    return user;
};

const addAttendance = (userId, offset, { status = 'PRESENT', clockOut = true, lateMinutes = 0 } = {}) =>
    prisma.attendance.create({
        data: {
            userId,
            date: dayDate(offset),
            clockIn: new Date(dayDate(offset).getTime() + 8 * 3600000),
            clockOut: clockOut ? new Date(dayDate(offset).getTime() + 16 * 3600000) : null,
            status,
            lateMinutes,
        },
    });

const fetchRecap = (token, query) =>
    request(app).get(`${BASE}?${query}`).set('Authorization', `Bearer ${token}`);

describe('Rekap absensi seluruh pegawai — periode fleksibel', () => {
    beforeAll(async () => {
        adminUser = await createUser('Rekap Admin', 'MANAJEMEN');
        adminUser = await prisma.user.update({ where: { id: adminUser.id }, data: { role: 'ADMIN' } });
        employeeUser = await createUser('Rekap Staff A', 'KITCHEN');
        const otherUser = await createUser('Rekap Staff B', 'BAR');

        adminToken = generateAccessToken({ userId: adminUser.id, role: 'ADMIN' });
        employeeToken = generateAccessToken({ userId: employeeUser.id, role: 'EMPLOYEE' });

        // Staff A: 3 hari hadir (1 telat 20 menit), 1 hari setengah hari.
        await addAttendance(employeeUser.id, 0, { status: 'PRESENT' });
        await addAttendance(employeeUser.id, 1, { status: 'PRESENT' });
        await addAttendance(employeeUser.id, 2, { status: 'LATE', lateMinutes: 20 });
        await addAttendance(employeeUser.id, 4, { status: 'HALF_DAY' });
        // Staff B: 1 hari hadir, 1 hari tercatat tapi belum absen pulang.
        await addAttendance(otherUser.id, 0, { status: 'PRESENT' });
        await addAttendance(otherUser.id, 3, { status: 'PRESENT', clockOut: false });
    });

    afterAll(async () => {
        try {
            if (createdUserIds.length) {
                await prisma.attendance.deleteMany({ where: { userId: { in: createdUserIds } } });
                await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
            }
        } finally {
            await prisma.$disconnect();
        }
    });

    it('menolak request tanpa token (401)', async () => {
        const res = await request(app).get(`${BASE}?start=${START}&end=${END}`);
        expect(res.status).toBe(401);
    });

    it('menolak non-ADMIN (403)', async () => {
        const res = await fetchRecap(employeeToken, `start=${START}&end=${END}`);
        expect(res.status).toBe(403);
    });

    it('menerima rentang start..end dan menandai tepinya inklusif', async () => {
        const res = await fetchRecap(adminToken, `start=${START}&end=${END}`);
        expect(res.status).toBe(200);
        expect(res.body.data.period).toMatchObject({ start: START, end: END, days: 5 });
    });

    it('preset month menghasilkan rentang satu bulan penuh', async () => {
        const res = await fetchRecap(adminToken, `month=${MONTH}`);
        expect(res.status).toBe(200);
        expect(res.body.data.period.start).toBe('2031-03-01');
        expect(res.body.data.period.end).toBe('2031-03-31');
        expect(res.body.data.period.days).toBe(31);
    });

    it('preset date menghasilkan rentang satu hari', async () => {
        const res = await fetchRecap(adminToken, `date=${DAY}`);
        expect(res.status).toBe(200);
        expect(res.body.data.period).toMatchObject({ start: DAY, end: DAY, days: 1 });
    });

    it('menolak start > end dengan 400 (bukan 500)', async () => {
        const res = await fetchRecap(adminToken, `start=${END}&end=${START}`);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('INVALID_DATE_RANGE');
    });

    it('menolak format tanggal ngawur dengan 400', async () => {
        const res = await fetchRecap(adminToken, 'start=31-03-2031&end=2031-04-01');
        expect(res.status).toBe(400);
    });

    it('menolak rentang lebih dari 366 hari dengan 400', async () => {
        const res = await fetchRecap(adminToken, 'start=2030-01-01&end=2031-12-31');
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('INVALID_DATE_RANGE');
    });

    it('angka ringkasan = penjumlahan baris pegawai yang dikirim ke UI', async () => {
        const res = await fetchRecap(adminToken, `start=${START}&end=${END}`);
        const { summary, employees } = res.body.data;

        const sum = (key) => employees.reduce((acc, r) => acc + r[key], 0);
        expect(summary.totalEmployees).toBe(employees.length);
        expect(summary.present).toBe(sum('present'));
        expect(summary.late).toBe(sum('late'));
        expect(summary.halfDay).toBe(sum('halfDay'));
        expect(summary.absent).toBe(sum('absent'));
        expect(summary.onLeaveDays).toBe(sum('onLeaveDays'));
        expect(summary.totalLateMinutes).toBe(sum('lateMinutes'));
        expect(summary.daysWithoutClockOut).toBe(sum('daysWithoutClockOut'));
        expect(summary.totalHours).toBeCloseTo(sum('totalHours'), 5);
    });

    it('hitung per pegawai: hari unik, jam kerja, telat, dan belum absen pulang', async () => {
        const res = await fetchRecap(adminToken, `start=${START}&end=${END}&userId=${employeeUser.id}`);
        const row = res.body.data.employees.find((r) => r.userId === employeeUser.id);

        expect(row.presentDays).toBe(4);   // 4 tanggal unik
        expect(row.present).toBe(2);       // 2x PRESENT
        expect(row.late).toBe(1);          // 1x LATE
        expect(row.halfDay).toBe(1);       // 1x HALF_DAY
        expect(row.absent).toBe(0);
        expect(row.lateMinutes).toBe(20);
        // 4 hari × 8 jam (clockIn 08:00 -> clockOut 16:00)
        expect(row.totalHours).toBe(32);
        expect(row.avgHoursPerPresentDay).toBe(8);
    });

    it('menghitung hari tanpa absen pulang dan tidak menagih jamnya', async () => {
        const res = await fetchRecap(adminToken, `start=${START}&end=${END}`);
        const b = res.body.data.employees.find((r) => r.fullName === 'Rekap Staff B');

        expect(b.presentDays).toBe(2);
        expect(b.daysWithoutClockOut).toBe(1);
        expect(b.totalHours).toBe(8); // hanya hari yang ada clockOut
    });

    it('sebaran harian mencakup SETIAP tanggal dalam rentang, termasuk yang kosong', async () => {
        const res = await fetchRecap(adminToken, `start=${START}&end=${END}`);
        const { daily, period } = res.body.data;

        expect(daily).toHaveLength(period.days);
        expect(daily.map((d) => d.date)).toEqual([
            '2031-03-01', '2031-03-02', '2031-03-03', '2031-03-04', '2031-03-05',
        ]);
        // 2031-03-01: Staff A + Staff B
        expect(daily[0]).toMatchObject({ total: 2, uniqueStaff: 2, present: 2 });
        // 2031-03-02: hanya Staff A
        expect(daily[1]).toMatchObject({ total: 1, uniqueStaff: 1 });
    });

    it('tidak membocorkan pegawai di luar filter userId', async () => {
        const res = await fetchRecap(adminToken, `start=${START}&end=${END}&userId=${employeeUser.id}`);

        expect(res.body.data.employees).toHaveLength(1);
        expect(res.body.data.employees[0].userId).toBe(employeeUser.id);
    });

    it('memfilter berdasarkan departemen tanpa mengubah konsistensi ringkasan', async () => {
        const res = await fetchRecap(adminToken, `start=${START}&end=${END}&department=KITCHEN`);
        const { employees, summary } = res.body.data;

        expect(employees.every((r) => r.department === 'KITCHEN')).toBe(true);
        expect(summary.totalEmployees).toBe(employees.length);
        expect(employees.some((r) => r.fullName === 'Rekap Staff B')).toBe(false);
    });

    it('tanpa parameter sama sekali tetap membalas 200 dengan rentang default', async () => {
        const res = await request(app).get(BASE).set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.period.start).toMatch(/^\d{4}-\d{2}-01$/);
        expect(res.body.data.period.days).toBeGreaterThan(0);
    });
});
