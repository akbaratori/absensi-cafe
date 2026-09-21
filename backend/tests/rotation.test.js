const prisma = require('../src/utils/database');
const rotationService = require('../src/services/rotationService');
const { AppError } = require('../src/utils/AppError');

/**
 * Rotasi shift per posisi.
 *
 * Bug yang dijaga di sini (dilaporkan dari halaman Manajemen Posisi & Rotasi):
 *   1. Index rotasi disimpan (`currentStartIndex`) lalu DIMARJUKAN setiap kali
 *      generate dijalankan. Akibatnya menekan "Generate Jadwal Bulanan" dua kali
 *      untuk bulan yang sama MENUKAR Shift 1 <-> Shift 2 tanpa ada data yang
 *      berubah, dan generate satu bulan menggeser minggu di bulan sebelahnya.
 *   2. Mode `scheduleAllWorking` membagi `ceil(total / 2)`, sehingga kapasitas
 *      Shift 1 yang diatur admin (mis. 2 dari 5 orang) diabaikan.
 *
 * Sekarang index dihitung dari TANGGAL minggu (`anchor + jarak minggu * step`),
 * jadi uji idempotensi di bawah ini yang menjadi jaring pengaman.
 *
 * Data uji dibuat sendiri di dalam suite ini dan dihapus setelahnya; tidak
 * menyentuh posisi/user produksi. Guard di tests/setup.js tetap menolak bila
 * DATABASE_URL menunjuk DB produksi.
 */
describe('Rotation: generate jadwal per posisi', () => {
  const TAG = 'rot_test_';
  const POS_NORMAL = '__ROT_TEST_NORMAL__';
  const POS_ALL_WORKING = '__ROT_TEST_ALLWORKING__';
  const POS_FOUR = '__ROT_TEST_4__';
  const ALL_POS = [POS_NORMAL, POS_ALL_WORKING, POS_FOUR];
  const WEEK = new Date('2026-11-02T00:00:00.000Z'); // Senin
  const day = 86400000;

  let users = [];
  let positionNormal;
  let positionAllWorking;

  /** Daftar userId per shiftNumber untuk satu minggu pada WeeklySchedule. */
  async function shiftMap(positionId, weekStart) {
    const rows = await prisma.weeklySchedule.findMany({
      where: { positionId, weekStart },
      orderBy: { userId: 'asc' },
    });
    return {
      s1: rows.filter((r) => r.shiftNumber === 1).map((r) => r.userId),
      s2: rows.filter((r) => r.shiftNumber === 2).map((r) => r.userId),
    };
  }

  beforeAll(async () => {
    await prisma.position.deleteMany({ where: { name: { in: ALL_POS } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: TAG } } });

    users = [];
    for (const suffix of ['a', 'b', 'c', 'd', 'e']) {
      users.push(
        await prisma.user.create({
          data: {
            username: `${TAG}${suffix}`,
            passwordHash: 'x',
            fullName: `${TAG} ${suffix.toUpperCase()}`,
            role: 'STAFF',
          },
        }),
      );
    }

    // Kapasitas 2 / 2 dengan roster 4 orang: pemotongan kapasitas terlihat jelas.
    positionNormal = await rotationService.createPosition({
      name: POS_NORMAL,
      shift1Capacity: 2,
      shift2Capacity: 2,
    });
    await rotationService.setRoster(
      positionNormal.id,
      users.slice(0, 4).map((u) => ({ userId: u.id })),
    );

    // scheduleAllWorking dengan kapasitas 2 dari 5 orang (dulu menghasilkan 3/2).
    positionAllWorking = await rotationService.createPosition({
      name: POS_ALL_WORKING,
      shift1Capacity: 2,
      shift2Capacity: 3,
      scheduleAllWorking: true,
    });
    await rotationService.setRoster(
      positionAllWorking.id,
      users.map((u) => ({ userId: u.id })),
    );
  });

  afterAll(async () => {
    const ids = users.map((u) => u.id);
    // Ambil ulang dari DB: test membuat posisi sementara yang tidak disimpan di variabel.
    const leftover = await prisma.position.findMany({ where: { name: { in: ALL_POS } }, select: { id: true } });
    const posIds = leftover.map((p) => p.id);
    await prisma.userSchedule.deleteMany({ where: { userId: { in: ids } } });
    await prisma.weeklySchedule.deleteMany({ where: { positionId: { in: posIds } } });
    await prisma.rotationState.deleteMany({ where: { positionId: { in: posIds } } });
    await prisma.positionRoster.deleteMany({ where: { positionId: { in: posIds } } });
    await prisma.positionJobdesk.deleteMany({ where: { positionId: { in: posIds } } });
    await prisma.position.deleteMany({ where: { name: { in: ALL_POS } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('generate ulang minggu yang sama TIDAK menukar Shift 1 <-> Shift 2 (idempoten)', async () => {
    await rotationService.generateWeek(positionNormal.id, WEEK);
    const first = await shiftMap(positionNormal.id, WEEK);

    await rotationService.generateWeek(positionNormal.id, WEEK);
    const second = await shiftMap(positionNormal.id, WEEK);

    expect(second.s1).toEqual(first.s1);
    expect(second.s2).toEqual(first.s2);
    // Jaring pengaman eksplisit: hasil kedua BUKAN kebalikan hasil pertama.
    expect(second.s1).not.toEqual(first.s2);
  });

  it('generate ulang BULAN yang sama TIDAK menukar shift', async () => {
    const month = '2026-11';
    await rotationService.generateMonth(positionNormal.id, month);
    const first = await shiftMap(positionNormal.id, WEEK);

    await rotationService.generateMonth(positionNormal.id, month);
    const second = await shiftMap(positionNormal.id, WEEK);

    expect(second.s1).toEqual(first.s1);
    expect(second.s2).toEqual(first.s2);
  });

  it('generate bulan berikutnya TIDAK menggeser minggu di bulan sebelumnya', async () => {
    await rotationService.generateMonth(positionNormal.id, '2026-11');
    const before = await shiftMap(positionNormal.id, WEEK);

    // Desember mengambil Monday dari minggu yang memuat 1 Des = 30 Nov, jadi
    // minggu 2 Nov TIDAK boleh ikut berubah.
    await rotationService.generateMonth(positionNormal.id, '2026-12');
    const after = await shiftMap(positionNormal.id, WEEK);

    expect(after.s1).toEqual(before.s1);
    expect(after.s2).toEqual(before.s2);
  });

  it('Shift 1 berputar: minggu berikutnya digeser sebesar shift1Capacity', async () => {
    const step = positionNormal.shift1Capacity; // 2, roster 4 orang
    const rosterOrder = (
      await prisma.positionRoster.findMany({
        where: { positionId: positionNormal.id },
        orderBy: { orderIndex: 'asc' },
      })
    ).map((r) => r.userId);

    const week1 = await shiftMap(positionNormal.id, WEEK);
    const week2 = await shiftMap(positionNormal.id, new Date(WEEK.getTime() + 7 * day));

    expect(week1.s1).toEqual(rosterOrder.slice(0, step));
    // Digeser `step` posisi pada urutan rotasi.
    expect(week2.s1).toEqual(rosterOrder.slice(step, step * 2));
    // Kapasitas dihormati: tetap 2 orang di Shift 1 dan 2 orang di Shift 2.
    expect(week1.s1).toHaveLength(step);
    expect(week1.s2).toHaveLength(step);
  });

  it('posisi fleksibel: jumlah orang per shift mengikuti JUMLAH STAFF', async () => {
    // 5 staff -> 3/2 (diatur otomatis), walau kolom kapasitas di DB berisi 2.
    await rotationService.generateWeek(positionAllWorking.id, WEEK);
    const { s1, s2 } = await shiftMap(positionAllWorking.id, WEEK);
    expect(s1).toHaveLength(Math.ceil(users.length / 2)); // 3
    expect(s2).toHaveLength(Math.floor(users.length / 2)); // 2
    // Semua anggota roster tetap dijadwalkan (tidak ada yang OFF).
    expect(s1.length + s2.length).toBe(users.length);

    // 4 staff -> 2/2
    const four = users.slice(0, 4);
    const pos4 = await rotationService.createPosition({
      name: POS_FOUR, shift1Capacity: 2, shift2Capacity: 2, scheduleAllWorking: true,
    });
    await rotationService.setRoster(pos4.id, four.map((u) => ({ userId: u.id })));
    await rotationService.generateWeek(pos4.id, WEEK);
    const four4 = await shiftMap(pos4.id, WEEK);
    expect(four4.s1).toHaveLength(2);
    expect(four4.s2).toHaveLength(2);

    await prisma.userSchedule.deleteMany({ where: { userId: { in: four.map((u) => u.id) } } });
    await prisma.weeklySchedule.deleteMany({ where: { positionId: pos4.id } });
    await prisma.rotationState.deleteMany({ where: { positionId: pos4.id } });
    await prisma.positionRoster.deleteMany({ where: { positionId: pos4.id } });
    await prisma.position.delete({ where: { id: pos4.id } });
  });

  it('posisi fleksibel: 4 staff tukar penuh tiap Senin, 5 staff 1 orang bertahan', async () => {
    const nextWeek = new Date(WEEK.getTime() + 7 * day);

    // 5 staff (roster 5, S1=3): irisan S1 minggu ini & minggu depan = 1 orang.
    await rotationService.generateWeek(positionAllWorking.id, WEEK);
    await rotationService.generateWeek(positionAllWorking.id, nextWeek);
    const w5a = await shiftMap(positionAllWorking.id, WEEK);
    const w5b = await shiftMap(positionAllWorking.id, nextWeek);
    const overlap5 = w5a.s1.filter((id) => w5b.s1.includes(id));
    expect(overlap5).toHaveLength(1);
    expect(w5a.s1).toHaveLength(3);
    expect(w5a.s2).toHaveLength(2);

    // 4 staff (roster 4, S1=2): 2 + 2 = 4, jadi TIDAK ada yang bertahan.
    const pos4 = await rotationService.createPosition({
      name: POS_FOUR, shift1Capacity: 2, shift2Capacity: 2, scheduleAllWorking: true,
    });
    await rotationService.setRoster(pos4.id, users.slice(0, 4).map((u) => ({ userId: u.id })));
    await rotationService.generateWeek(pos4.id, WEEK);
    await rotationService.generateWeek(pos4.id, nextWeek);
    const w4a = await shiftMap(pos4.id, WEEK);
    const w4b = await shiftMap(pos4.id, nextWeek);
    expect(w4a.s1.filter((id) => w4b.s1.includes(id))).toHaveLength(0);
    expect(w4a.s1.slice().sort()).toEqual(w4b.s2.slice().sort());

    await prisma.userSchedule.deleteMany({ where: { userId: { in: users.slice(0, 4).map((u) => u.id) } } });
    await prisma.weeklySchedule.deleteMany({ where: { positionId: pos4.id } });
    await prisma.rotationState.deleteMany({ where: { positionId: pos4.id } });
    await prisma.positionRoster.deleteMany({ where: { positionId: pos4.id } });
    await prisma.position.delete({ where: { id: pos4.id } });
  });

  it('rotationPreview sama persis dengan hasil generate', async () => {
    const nextWeek = new Date(WEEK.getTime() + 7 * day);

    const preview = (await rotationService.getPosition(positionNormal.id, nextWeek)).rotationPreview;
    await rotationService.generateWeek(positionNormal.id, nextWeek);
    const generated = await shiftMap(positionNormal.id, nextWeek);

    expect(preview.weekStart).toBe(nextWeek.toISOString().slice(0, 10));
    expect(preview.shift1UserIds).toEqual(generated.s1);
    expect(preview.shift2UserIds).toEqual(generated.s2);
  });

  it('state lama (tanpa anchor) tetap menghasilkan minggu yang sama seperti sebelumnya', async () => {
    // Keadaan sebelum migrasi: hanya ada lastGeneratedWeekStart + currentStartIndex,
    // dan currentStartIndex = index untuk minggu BERIKUTNYA.
    const step = positionNormal.shift1Capacity;
    const legacyState = {
      anchorWeekStart: null,
      anchorIndex: null,
      lastGeneratedWeekStart: WEEK,
      currentStartIndex: step, // index minggu berikutnya = 0 + step
    };

    const anchor = rotationService._resolveAnchor(
      { rotationState: legacyState }, WEEK, 4, step,
    );
    const idx = rotationService._indexFromAnchor(anchor, WEEK, 4, step);

    // Minggu terakhir yang sudah tergenerate memakai index 0 -> jadwal yang
    // sudah tertulis tidak berubah setelah upgrade.
    expect(idx).toBe(0);
  });

  it('index rotasi tidak berubah walau currentStartIndex sudah maju (inti perbaikan)', async () => {
    const step = positionNormal.shift1Capacity;
    const anchor = { anchorWeekStart: WEEK, anchorIndex: 1 };

    const a = rotationService._indexFromAnchor(anchor, WEEK, 4, step);
    const b = rotationService._indexFromAnchor(anchor, new Date(WEEK.getTime() + 21 * day), 4, step);
    const c = rotationService._indexFromAnchor(anchor, new Date(WEEK.getTime() - 14 * day), 4, step);

    // Hasil untuk minggu yang sama selalu identik (tidak lagi bergantung pada
    // berapa kali generate dijalankan).
    expect(rotationService._indexFromAnchor(anchor, WEEK, 4, step)).toBe(a);
    // Tetap bergeser `step` per minggu, termasuk untuk minggu sebelum anchor.
    expect(b).toBe((1 + 3 * step) % 4);
    expect(c).toBe((((1 - 2 * step) % 4) + 4) % 4);
  });

  it('menolak kapasitas shift 0 / negatif', async () => {
    await expect(
      rotationService.createPosition({ name: '__ROT_TEST_BAD__', shift1Capacity: 0, shift2Capacity: 2 }),
    ).rejects.toThrow(AppError);
    await expect(
      rotationService.updatePosition(positionNormal.id, { shift2Capacity: -1 }),
    ).rejects.toThrow(AppError);
  });
});

