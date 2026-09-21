const prisma = require('../src/utils/database');
const rotationService = require('../src/services/rotationService');
const { AppError } = require('../src/utils/AppError');
const { parseShiftNumber, loadShiftMapByNumber } = require('../src/utils/shiftResolver');

// DB test ini remote (Aiven), jadi satu test bisa butuh puluhan detik:
// `generateMonth` menulis ratusan baris satu per satu. Batas bawaan Jest 5 detik
// membuat test idempotensi gagal karena WAKTU, bukan karena logika rotasi.
jest.setTimeout(180000);

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

/**
 * Pemetaan nomor shift -> id tabel `shifts`.
 *
 * Bug yang dijaga di sini: kolom `shiftId` menyimpan PRIMARY KEY tabel `shifts`,
 * sedangkan `shiftNumber` adalah nomor logis (1, 2, 3) yang dipakai UI dan
 * generate. Di produksi id-nya TIDAK berurutan — id=1 "Shift 1", id=3 "Shift 2",
 * id=5 "Shift 3". Kode yang menyamakan keduanya (`shiftId: shiftNumber`) atau
 * memakai posisi array (`shifts[n-1]`) akan menulis / membaca shift yang salah:
 *
 *   - setScheduleAssignment menulis "S2" sebagai shiftId=2 -> id 2 tidak ada,
 *     baris kehilangan jam shift. Di produksi ini menghasilkan 2 baris rusak
 *     (Gio 2026-09-06, Nhelam 2026-09-08).
 *   - resolveEffectiveShift memakai `allShifts[n-1]`, benar hanya selama id rapat.
 *
 * Perbaikan: selalu petakan lewat NAMA ("Shift N" -> id), sumber kebenaran yang
 * sama dipakai generateWeek.
 */
describe('Pemetaan shiftNumber <-> shiftId', () => {
  const TAG = 'shiftmap_test_';
  const POS = '__SHIFTMAP_TEST__';
  const WEEK = new Date('2026-11-02T00:00:00.000Z'); // Senin

  let user;
  let position;
  let shift1;
  let shift2;
  let shift3;
  const createdShiftIds = [];

  /** Benar bila ini menjalankan test-nya langsung: -t "Pemetaan shiftNumber". */
  const onlyThisSuite = (process.argv.find((a) => a.startsWith('-t=')) || '').includes('Pemetaan');

  beforeAll(async () => {
    // Suite ini butuh baris `shifts` untuk nomor 1/2/3. Cari lewat NOMOR shift —
    // nama berbeda antar environment (staging "Shift 2 (Siang)", produksi
    // "Shift 2"), jadi pencocokan nama persis membuat baris duplikat.
    // WAJIB pilih NOMOR terkecil per nomor dan urut id: memang ada baris jelek
    // legacy di staging, mis. id=3 bernama "Shift 1" (00:00-00:01) yang menang
    // bila id besar dipilih lebih dulu — persis pilihan yang menghasilkan jam
    // salah, satu hal yang mau dicegah oleh pemetaan berbasis nama ini.
    async function ensureShift(name) {
      const wanted = parseShiftNumber(name);
      const map = await loadShiftMapByNumber();
      const found = map.get(wanted);
      if (found) return found;
      const s = await prisma.shift.create({
        data: { name, startTime: '00:00', endTime: '00:01' },
      });
      createdShiftIds.push(s.id);
      return s;
    }

    shift1 = await ensureShift('Shift 1');
    shift2 = await ensureShift('Shift 2');
    shift3 = await ensureShift('Shift 3');

    if (onlyThisSuite) return; // dipilih lewat -t: tidak perlu posisi/user

    await prisma.position.deleteMany({ where: { name: POS } });
    await prisma.user.deleteMany({ where: { username: { startsWith: TAG } } });

    user = await prisma.user.create({
      data: {
        username: `${TAG}1`,
        passwordHash: 'x',
        fullName: `${TAG} 1`,
        role: 'STAFF',
        shiftId: shift1.id,
      },
    });

    position = await rotationService.createPosition({
      name: POS, shift1Capacity: 1, shift2Capacity: 1,
    });
    await rotationService.setRoster(position.id, [{ userId: user.id }]);
  });

  afterAll(async () => {
    if (user?.id) {
      await prisma.userSchedule.deleteMany({ where: { userId: user.id } });
    }
    if (position?.id) {
      await prisma.weeklySchedule.deleteMany({ where: { positionId: position.id } });
      await prisma.rotationState.deleteMany({ where: { positionId: position.id } });
      await prisma.positionRoster.deleteMany({ where: { positionId: position.id } });
    }
    await prisma.position.deleteMany({ where: { name: POS } });
    await prisma.user.deleteMany({ where: { username: { startsWith: TAG } } });
    // Hanya hapus shift yang DIBUAT suite ini — jangan sentuh shift asli DB.
    if (createdShiftIds.length) {
      await prisma.shift.deleteMany({ where: { id: { in: createdShiftIds } } });
    }
  });

  it('menyimpan S1 & S2 sebagai id shift yang BENAR (bukan nomornya)', async () => {
    if (onlyThisSuite) return;
    const dateISO = '2026-11-03';
    const dateObj = new Date(`${dateISO}T00:00:00.000Z`);

    await rotationService.setScheduleAssignment(position.id, {
      date: dateISO, userId: user.id, shiftNumber: 1,
    });
    let row = await prisma.userSchedule.findUnique({
      where: { userId_date: { userId: user.id, date: dateObj } },
      include: { shift: true },
    });
    expect(row.shiftId).toBe(shift1.id);
    // Bandingkan lewat NOMOR, bukan nama persis: nama berbeda antar environment.
    expect(parseShiftNumber(row.shift.name)).toBe(1);
    expect(row.isManualOverride).toBe(true);

    await rotationService.setScheduleAssignment(position.id, {
      date: dateISO, userId: user.id, shiftNumber: 2,
    });
    row = await prisma.userSchedule.findUnique({
      where: { userId_date: { userId: user.id, date: dateObj } },
      include: { shift: true },
    });
    // Inti perbaikan: harus menunjuk shift NOMOR 2, bukan id 2.
    expect(row.shift).not.toBeNull();
    expect(parseShiftNumber(row.shift.name)).toBe(2);
    expect(row.shiftId).toBe(shift2.id);

    await rotationService.setScheduleAssignment(position.id, {
      date: dateISO, userId: user.id, shiftNumber: 0,
    });
    row = await prisma.userSchedule.findUnique({
      where: { userId_date: { userId: user.id, date: dateObj } },
    });
    expect(row.isOffDay).toBe(true);
    expect(row.shiftId).toBeNull();
  });

  it('menolak shiftNumber yang tidak punya baris di tabel shifts', async () => {
    if (onlyThisSuite) return;
    await expect(
      rotationService.setScheduleAssignment(position.id, {
        date: '2026-11-04', userId: user.id, shiftNumber: 99,
      }),
    ).rejects.toThrow(AppError);
  });

  it('membaca ulang shiftNumber dari shiftId lewat nama, bukan asumsi id', async () => {
    if (onlyThisSuite) return;
    const date = new Date('2026-11-05T00:00:00.000Z');
    await prisma.userSchedule.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: { shiftId: shift2.id, isOffDay: false, isManualOverride: true },
      create: { userId: user.id, date, shiftId: shift2.id, isOffDay: false, isManualOverride: true },
    });

    let month = await rotationService.getMonthSchedule(position.id, '2026-11');
    let row = month.find((r) => r.date === '2026-11-05' && r.userId === user.id);
    expect(row).toBeTruthy();
    expect(row.shiftNumber).toBe(2);
    expect(row.isManualOverride).toBe(true);

    // Shift 3 harus terbaca 3 — dulu dipaksa jadi 2 oleh `shiftId === 1 ? 1 : 2`.
    await prisma.userSchedule.update({
      where: { userId_date: { userId: user.id, date } },
      data: { shiftId: shift3.id },
    });
    month = await rotationService.getMonthSchedule(position.id, '2026-11');
    row = month.find((r) => r.date === '2026-11-05' && r.userId === user.id);
    expect(row.shiftNumber).toBe(3);
  });

  it('hasil generate menulis shiftId yang VALID di tabel shifts', async () => {
    if (onlyThisSuite) return;
    await rotationService.generateWeek(position.id, WEEK);

    // WeeklySchedule memang hanya menyimpan `shiftNumber` (tidak punya kolom
    // shiftId), jadi validitas id shift harus diperiksa di `user_schedules` —
    // di situlah id nyata dipakai untuk membaca jam shift, dan di situlah bug
    // lama menulis shiftId=2 yang tidak ada di tabel shifts.
    const gen = await prisma.userSchedule.findMany({
      where: { userId: user.id, date: { gte: WEEK, lte: new Date(WEEK.getTime() + 7 * 86400000) } },
      select: { date: true, shiftId: true, isOffDay: true },
    });
    expect(gen.length).toBeGreaterThan(0);

    const validIds = new Set([shift1.id, shift2.id, shift3.id]);
    for (const g of gen) {
      if (g.isOffDay) {
        expect(g.shiftId).toBeNull();
      } else {
        expect(validIds.has(g.shiftId)).toBe(true);
      }
    }
  });
});

