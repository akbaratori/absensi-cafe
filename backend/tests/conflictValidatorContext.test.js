const prisma = require('../src/utils/database');
const { checkEmployeeScheduleConflict } = require('../src/utils/conflictValidator');

/**
 * Regresi: tukar SHIFT dan tukar LIBUR mengubah sel jadwal yang BERBEDA.
 *
 * Bug yang dijaga: `checkEmployeeScheduleConflict` memeriksa ShiftSwap
 * approved/pending untuk konteks apa pun, sehingga tanggal yang pernah dipakai
 * tukar shift jadi mustahil ditukar liburnya — pengajuan tukar libur ditolak 422
 * dengan alasan "karyawan sudah memiliki tukar shift yang disetujui pada
 * tanggal X". Kejadian nyata: 23/9/2026 terblokir oleh ShiftSwap #17 walau yang
 * diajukan adalah tukar LIBUR, dan 20 dari 46 kombinasi yang ditawarkan modal
 * tukar libur ikut mati.
 *
 * Data uji dibuat sendiri di dalam suite dan dihapus setelahnya; tidak menyentuh
 * user/jadwal produksi. Guard di tests/setup.js tetap menolak bila DATABASE_URL
 * menunjuk DB produksi.
 */
describe('conflictValidator: konteks OFF_DAY vs SHIFT_SWAP', () => {
  const TAG = 'cv_ctx_test_';
  const TGL = new Date('2027-01-05T00:00:00.000Z'); // ada tukar shift APPROVED
  const TGL_BERSIH = new Date('2027-01-06T00:00:00.000Z'); // tanpa pertukaran

  let requester;
  let target;

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { username: { startsWith: TAG } } });

    requester = await prisma.user.create({
      data: {
        username: `${TAG}req`,
        passwordHash: 'x',
        fullName: `${TAG} Requester`,
        role: 'STAFF',
      },
    });
    target = await prisma.user.create({
      data: {
        username: `${TAG}tgt`,
        passwordHash: 'x',
        fullName: `${TAG} Target`,
        role: 'STAFF',
      },
    });

    await prisma.shiftSwap.create({
      data: {
        requesterId: requester.id,
        targetUserId: target.id,
        date: TGL,
        status: 'APPROVED',
        approvedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    const ids = [requester?.id, target?.id].filter(Boolean);
    if (ids.length) {
      await prisma.shiftSwap.deleteMany({ where: { requesterId: { in: ids } } });
      await prisma.shiftSwap.deleteMany({ where: { targetUserId: { in: ids } } });
      await prisma.offDayRequest.deleteMany({ where: { userId: { in: ids } } });
      await prisma.offDayRequest.deleteMany({ where: { targetUserId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.$disconnect();
  });

  it('konteks OFF_DAY mengabaikan tukar shift yang sudah disetujui', async () => {
    const res = await checkEmployeeScheduleConflict(requester.id, TGL, null, null, 'OFF_DAY');
    expect(res.hasConflict).toBe(false);
  });

  it('konteks OFF_DAY juga bebas untuk karyawan tujuan tukar shift', async () => {
    const res = await checkEmployeeScheduleConflict(target.id, TGL, null, null, 'OFF_DAY');
    expect(res.hasConflict).toBe(false);
  });

  it('konteks SHIFT_SWAP tetap menolak tukar shift ganda pada tanggal yang sama', async () => {
    const res = await checkEmployeeScheduleConflict(requester.id, TGL, null, null, 'SHIFT_SWAP');
    expect(res.hasConflict).toBe(true);
    expect(res.reason).toMatch(/tukar shift/i);
  });

  it('konteks ALL (legacy) tetap menolak, supaya pemanggil lama tidak berubah diam-diam', async () => {
    const res = await checkEmployeeScheduleConflict(requester.id, TGL);
    expect(res.hasConflict).toBe(true);
  });

  it('tanggal tanpa pertukaran tetap bebas di semua konteks', async () => {
    for (const ctx of ['OFF_DAY', 'SHIFT_SWAP', 'ALL']) {
      const res = await checkEmployeeScheduleConflict(requester.id, TGL_BERSIH, null, null, ctx);
      expect(res.hasConflict).toBe(false);
    }
  });
});
