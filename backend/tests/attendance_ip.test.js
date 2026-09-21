const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/utils/database');
const bcrypt = require('bcrypt');
const { getAttendanceConfig } = require('../src/utils/attendanceHelpers');

/**
 * Logging IP saat clock-in.
 *
 * Catatan penting: service clock-in menolak (400) bila user TIDAK punya jadwal
 * untuk hari ini. Semua user yang terdaftar di PositionRoster dan tidak punya
 * baris UserSchedule dianggap "hari libur" -> CLOCK_IN_OFF_DAY. Karena itu test
 * ini WAJIB menyiapkan sendiri (a) baris roster dan (b) jadwal shift hari ini
 * untuk user uji. Tanpa itu test gagal bukan karena bug logging IP, melainkan
 * karena 400 CLOCK_IN_OFF_DAY.
 */

const TEST_USERNAME = 'ip_test_user';

/** Tanggal hari ini menurut WITA (UTC+8), dikembalikan sebagai Date UTC T00:00Z. */
function todayUtcMidnight() {
  const nowWita = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return new Date(`${nowWita.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

describe('Attendance IP Logging', () => {
  let token;
  let userId;
  let positionId;
  let shiftId;

  beforeAll(async () => {
    const today = todayUtcMidnight();

    const shift = await prisma.shift.upsert({
      where: { id: 1 },
      update: { startTime: '08:00', endTime: '20:00' },
      create: { id: 1, name: 'Shift 1 (Pagi)', startTime: '08:00', endTime: '20:00' },
    });
    shiftId = shift.id;

    // Cleanup sisa run sebelumnya (urutan penting: child dulu, lalu user).
    const stale = await prisma.user.findUnique({ where: { username: TEST_USERNAME } });
    if (stale) {
      await prisma.attendance.deleteMany({ where: { userId: stale.id } });
      await prisma.userSchedule.deleteMany({ where: { userId: stale.id } });
      await prisma.positionRoster.deleteMany({ where: { userId: stale.id } });
      await prisma.user.delete({ where: { id: stale.id } });
    }

    const hashedPassword = await bcrypt.hash('password123', 10);
    const user = await prisma.user.create({
      data: {
        username: TEST_USERNAME,
        passwordHash: hashedPassword,
        fullName: 'IP Test User',
        role: 'EMPLOYEE',
        employeeId: 'IP001',
      },
    });
    userId = user.id;

    // Fixture posisi + roster: getTodaySchedule() langsung return null bila user
    // tidak ada di PositionRoster.
    const position = await prisma.position.upsert({
      where: { name: 'IP Test Position' },
      update: {},
      create: { name: 'IP Test Position', shift1Capacity: 1, shift2Capacity: 1 },
    });
    positionId = position.id;

    await prisma.positionRoster.create({
      data: { positionId, userId, orderIndex: 1, shiftNumber: 1 },
    });

    // Jadwal hari ini, BUKAN hari libur -> clock-in diizinkan service.
    await prisma.userSchedule.create({
      data: { userId, date: today, shiftId, isOffDay: false },
    });

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: TEST_USERNAME, password: 'password123' });

    token = loginRes.body?.data?.accessToken;
    if (!token) {
      throw new Error(
        `Login user uji gagal (status ${loginRes.status}). Fixture tidak siap untuk test logging IP.`,
      );
    }
  });

  afterAll(async () => {
    await prisma.attendance.deleteMany({ where: { userId } });
    await prisma.userSchedule.deleteMany({ where: { userId } });
    await prisma.positionRoster.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.position.delete({ where: { id: positionId } });
  });

  it('should save IP address when clocking in', async () => {
    const cfg = await getAttendanceConfig(prisma);

    const res = await request(app)
      .post('/api/v1/attendance/clock-in')
      .set('Authorization', `Bearer ${token}`)
      .send({
        // Titik tengah geofence dari config -> tidak akan ditolak jarak.
        location: { latitude: cfg.cafeLatitude, longitude: cfg.cafeLongitude },
        notes: 'Test IP',
      });

    expect(res.status).toBe(201);

    const attendance = await prisma.attendance.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    expect(attendance).toBeTruthy();
    expect(attendance.clockInIp).toBeTruthy(); // Should not be null
  });
});

