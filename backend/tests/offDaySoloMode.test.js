const prisma = require('../src/utils/database');
const offDayService = require('../src/services/offDayService');
const { checkEmployeeScheduleConflict } = require('../src/utils/conflictValidator');

/**
 * Mode SOLO — pindah hari libur mandiri tanpa rekan tujuan.
 *
 * Semantik yang diuji:
 *  - Pengajuan SOLO dibuat TANPA targetUserId, jadi `createRequest` tidak boleh
 *    menuntut rekan yang libur di workDate.
 *  - Setelah auto-validasi, status harus langsung `PENDING_APPROVAL`
 *    (tidak pernah menyentuh `PENDING_TARGET_RESPONSE`).
 *  - Setelah Admin menyetujui, jadwal pemohon berubah: `offDate` jadi kerja,
 *    `workDate` jadi libur — hanya 2 baris UserSchedule, tanpa rekan.
 *  - `conflictValidator` tidak boleh menganggap `offDate` SOLO sebagai hari libur.
 *
 * Data uji dibuat sendiri di dalam suite dan dihapus setelahnya. Guard di
 * tests/setup.js tetap menolak bila DATABASE_URL menunjuk DB produksi.
 */
describe('offDayService: mode SOLO (pindah libur mandiri)', () => {
  const TAG = 'offday_solo_test_';
  // Tanggal jauh di masa depan supaya tidak bentrok dengan data lain.
  const OFF_DATE = new Date('2027-03-10T00:00:00.000Z');
  const WORK_DATE = new Date('2027-03-11T00:00:00.000Z');
  const CONFLICT_WORK_DATE = new Date('2027-03-12T00:00:00.000Z');

  let requester;
  let admin;

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { username: { startsWith: TAG } } });

    requester = await prisma.user.create({
      data: {
        username: `${TAG}req`,
        passwordHash: 'x',
        fullName: `${TAG} Requester`,
        role: 'STAFF',
        shiftId: 1,
      },
    });
    admin = await prisma.user.create({
      data: {
        username: `${TAG}admin`,
        passwordHash: 'x',
        fullName: `${TAG} Admin`,
        role: 'ADMIN',
        shiftId: 1,
      },
    });

    // Jadwal dasar: OFF_DATE libur, WORK_DATE kerja — prasyarat mode SOLO.
    await prisma.userSchedule.createMany({
      data: [
        { userId: requester.id, date: OFF_DATE, isOffDay: true, isManualOverride: true },
        { userId: requester.id, date: WORK_DATE, isOffDay: false, shiftId: 1, isManualOverride: true },
        { userId: requester.id, date: CONFLICT_WORK_DATE, isOffDay: false, shiftId: 1, isManualOverride: true },
      ],
    });
  });

  afterAll(async () => {
    const ids = [requester?.id, admin?.id].filter(Boolean);
    if (ids.length) {
      await prisma.offDayRequest.deleteMany({ where: { userId: { in: ids } } });
      await prisma.userSchedule.deleteMany({ where: { userId: { in: ids } } });
      await prisma.manualOffDay.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.$disconnect();
  });

  it('createRequest SOLO tanpa targetUserId langsung ke PENDING_APPROVAL', async () => {
    const created = await offDayService.createRequest(requester.id, {
      mode: 'SOLO',
      offDate: OFF_DATE.toISOString().slice(0, 10),
      workDate: WORK_DATE.toISOString().slice(0, 10),
      reason: 'Uji pindah libur mandiri',
    });

    expect(created.targetUserId).toBeNull();
    expect(created.mode).toBe('SOLO');
    // Tidak ada tahap tanggapan rekan untuk mode SOLO.
    expect(created.status).toBe('PENDING_APPROVAL');
  });

  it('approveByAdmin hanya menulis 2 baris UserSchedule milik pemohon', async () => {
    const pending = await prisma.offDayRequest.findFirst({
      where: { userId: requester.id, mode: 'SOLO' },
      orderBy: { id: 'desc' },
    });
    expect(pending).not.toBeNull();

    const before = await prisma.userSchedule.count({
      where: { userId: requester.id, date: { in: [OFF_DATE, WORK_DATE] } },
    });
    expect(before).toBe(2);

    await offDayService.approveByAdmin(pending.id, admin.id, 'APPROVE');

    const approved = await prisma.offDayRequest.findUnique({ where: { id: pending.id } });
    expect(approved.status).toBe('APPROVED');
    expect(approved.approverId).toBe(admin.id);

    //Tetap 2 baris (tidak ada baris baru untuk rekan mana pun).
    const rows = await prisma.userSchedule.findMany({
      where: { userId: requester.id, date: { in: [OFF_DATE, WORK_DATE] } },
      select: { date: true, isOffDay: true },
    });
    expect(rows).toHaveLength(2);

    const byDate = Object.fromEntries(rows.map(r => [r.date.toISOString().slice(0, 10), r.isOffDay]));
    // offDate jadi kerja, workDate jadi libur.
    expect(byDate[OFF_DATE.toISOString().slice(0, 10)]).toBe(false);
    expect(byDate[WORK_DATE.toISOString().slice(0, 10)]).toBe(true);
  });

  it('setelah disetujui, offDate SOLO tidak lagi dihitung sebagai konflik libur', async () => {
    // offDate kini hari kerja pemohon — harus bebas untuk pengajuan baru.
    const res = await checkEmployeeScheduleConflict(requester.id, OFF_DATE, null, null, 'OFF_DAY');
    expect(res.hasConflict).toBe(false);
  });

  it('setelah disetujui, workDate SOLO menjadi konflik (pemohon libur di sana)', async () => {
    const res = await checkEmployeeScheduleConflict(requester.id, WORK_DATE, null, null, 'OFF_DAY');
    expect(res.hasConflict).toBe(true);
  });
});