/**
 * Test rekap jobdesk PRIBADI (GET /schedules/my-jobdesk-summary).
 *
 * Endpoint ini adalah padanan sisi-staff dari `jobdesk-fairness` (yang khusus
 * admin). Yang dijaga di sini:
 *   1. hanya data user pemanggil yang keluar — bukan jobdesk rekan kerja;
 *   2. jobdesk rangkap dihitung per jobdesk, sama seperti rekap admin;
 *   3. angka yang dilihat staff IDENTIK dengan baris miliknya di rekap admin,
 *      supaya tidak ada sengketa "kok beda dengan kata admin?";
 *   4. hari kerja tanpa jobdesk tetap terlihat agar bisa dilaporkan.
 */
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/utils/database');
const { generateAccessToken } = require('../src/utils/jwt');

const BASE = '/api/v1/schedules/my-jobdesk-summary';
const ADMIN_BASE = '/api/v1/schedules/jobdesk-fairness';
const MONTH = '2026-06';
const START = new Date(Date.UTC(2026, 5, 1));

let adminToken;
const createdUserIds = [];

const dayOffset = (n) => new Date(START.getTime() + n * 86400000);

const createKitchenUser = async (fullName) => {
    const user = await prisma.user.create({
        data: {
            username: `my_jobdesk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
        data: { userId, date: dayOffset(offset), isOffDay, kitchenStation },
    });

const fetchMine = (token, month = MONTH) =>
    request(app)
        .get(`${BASE}?month=${month}`)
        .set('Authorization', `Bearer ${token}`);

describe('Rekap jobdesk pribadi (my-jobdesk-summary)', () => {
    it('menolak request tanpa token (401)', async () => {
        const res = await request(app).get(`${BASE}?month=${MONTH}`);
        expect(res.status).toBe(401);
    });

    it('menolak format month tidak valid (400)', async () => {
        for (const bad of ['2026-13', '2026/06', 'Juni', '']) {
            const res = await fetchMine(adminToken, bad);
            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        }
    });

    it('menolak request tanpa month (400)', async () => {
        const res = await request(app).get(BASE).set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
    describe('data milik sendiri saja', () => {
        const NAME_ME = 'Uji Rekap Saya';
        const NAME_MATE = 'Uji Rekap Rekan';

        let me;
        let mate;
        let meToken;

        beforeAll(async () => {
            [me, mate] = await Promise.all([createKitchenUser(NAME_ME), createKitchenUser(NAME_MATE)]);

            // Saya: 3 hari 'Checker / Stock + Plating' → 3x Checker DAN 3x Plating.
            for (let i = 0; i < 3; i++) await addDay(me.id, i, 'Checker / Stock + Plating');
            // Rekan: 6 hari Helper saja → beban harian jauh lebih ringan (1 vs 6).
            for (let i = 0; i < 6; i++) await addDay(mate.id, i, 'Helper / Floating');

            meToken = generateAccessToken({ userId: me.id, role: 'EMPLOYEE' });
        });

        it('mengizinkan EMPLOYEE memanggil endpoint ini (200)', async () => {
            const res = await fetchMine(meToken);
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('mengembalikan baris milik pemanggil, bukan orang lain', async () => {
            const res = await fetchMine(meToken);
            expect(res.body.data.userId).toBe(me.id);
            expect(res.body.data.fullName).toBe(NAME_ME);
            expect(res.body.data.month).toBe(MONTH);

            // Nama rekan TIDAK boleh muncul dalam bentuk apa pun — endpoint ini
            // hanya boleh membocorkan angka agregat tim.
            expect(JSON.stringify(res.body)).not.toContain(NAME_MATE);
            for (const d of res.body.data.byDate) {
                expect(d.date.startsWith(MONTH)).toBe(true);
            }
        });

        it('menghitung SEMUA jobdesk dalam nilai rangkap', async () => {
            const res = await fetchMine(meToken);
            const d = res.body.data;

            expect(d.days.CHECKER).toBe(3);
            // Regresi yang sama seperti rekap admin: Plating tidak boleh hilang.
            expect(d.days.PLATING).toBe(3);
            expect(d.multiJobdeskDays).toBe(3);
            expect(d.daysWorked).toBe(3);

            // 3 hari x (Checker 3 + Plating 3) = 18 poin, dibagi 3 hari = 6.
            expect(d.loadTotal).toBe(18);
            expect(d.loadPerDay).toBe(6);
        });

        it('menyertakan rincian harian yang bisa ditelusuri sendiri', async () => {
            const res = await fetchMine(meToken);
            const byDate = res.body.data.byDate;

            expect(byDate).toHaveLength(3);
            for (const d of byDate) {
                expect(d.jobdesks.map((j) => j.key).sort()).toEqual(['CHECKER', 'PLATING']);
                expect(d.load).toBe(6);
            }
        });

        it('membandingkan dengan rata-rata tim tanpa membuka data per orang', async () => {
            const res = await fetchMine(meToken);
            const c = res.body.data.comparison;

            // Tim = saya (6) + rekan (1) → rata-rata 3.5.
            expect(c.teamStaffCount).toBe(2);
            expect(c.teamAvgLoadPerDay).toBe(3.5);
            expect(c.diff).toBe(2.5);
            expect(res.body.data.verdict.key).toBe('above');
            expect(res.body.data.verdict.tone).toBe('warning');
        });

        it('angkanya sama dengan baris milik staff ini di rekap admin', async () => {
            const [mine, admin] = await Promise.all([
                fetchMine(meToken),
                request(app).get(`${ADMIN_BASE}?month=${MONTH}`).set('Authorization', `Bearer ${adminToken}`),
            ]);

            const adminRow = admin.body.data.staff.find((s) => s.userId === me.id);
            expect(adminRow).toBeDefined();
            expect(adminRow.loadPerDay).toBe(mine.body.data.loadPerDay);
            expect(adminRow.loadTotal).toBe(mine.body.data.loadTotal);
            expect(adminRow.daysWorked).toBe(mine.body.data.daysWorked);
            expect(adminRow.multiJobdeskDays).toBe(mine.body.data.multiJobdeskDays);
            expect(adminRow.counts).toEqual(mine.body.data.days);
        });

        it('ADMIN pun hanya melihat barisnya sendiri di endpoint ini', async () => {
            const res = await fetchMine(adminToken);
            expect(res.status).toBe(200);
            // Token admin pun di-scope ke dirinya sendiri, bukan seluruh tim.
            expect(res.body.data).not.toHaveProperty('staff');
            expect(res.body.data.userId).not.toBe(me.id);
        });
    });

    describe('hari kerja tanpa jobdesk', () => {
        const NAME_KOSONG = 'Uji Rekap Kosong';
        let kosongToken;

        beforeAll(async () => {
            const kosong = await createKitchenUser(NAME_KOSONG);
            // 2 hari kerja tanpa jobdesk + 2 hari libur (libur tidak dihitung).
            for (let i = 0; i < 2; i++) await addDay(kosong.id, i, null);
            for (let i = 2; i < 4; i++) await addDay(kosong.id, i, 'Main Cook', true);
            kosongToken = generateAccessToken({ userId: kosong.id, role: 'EMPLOYEE' });
        });

        it('menghitung hari kerja kosong dan menyebutkannya sebagai peringatan', async () => {
            const res = await fetchMine(kosongToken);
            const d = res.body.data;

            expect(res.status).toBe(200);
            expect(d.daysWorked).toBe(2);
            expect(d.daysWithoutJobdesk).toBe(2);
            expect(d.loadPerDay).toBe(0);

            // Hari kosong tetap dikirim agar staff tahu tanggal mana yang bolong.
            expect(d.byDate).toHaveLength(2);
            for (const day of d.byDate) {
                expect(day.jobdesks).toEqual([]);
                expect(day.raw).toBeNull();
            }

            expect(d.verdict.key).toBe('missing');
            expect(d.verdict.tone).toBe('warning');
        });
    });
});

beforeAll(async () => {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, role: true } });
    if (!admin) throw new Error('Butuh minimal 1 user ADMIN di database untuk menjalankan tes ini');
    adminToken = generateAccessToken({ userId: admin.id, role: admin.role });
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
