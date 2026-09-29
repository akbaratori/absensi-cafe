const fs = require('fs');
const prisma = require('../src/utils/database');
const rotationService = require('../src/services/rotationService');
const { AppError } = require('../src/utils/AppError');
const { parseShiftNumber, loadShiftMapByNumber } = require('../src/utils/shiftResolver');

/**
 * Fairness rotasi jobdesk Kitchen (huruf A–D) — pengganti rotasi
 * `dayOffset % jumlah staff yang masuk`.
 *
 * Bug yang dijaga di sini (terukur di laporan bulanan jobdesk Kitchen):
 *   1. Rotasi lama memakai `dayOffset % n` dengan n = jumlah staff HARI ITU.
 *      Setiap n berubah (3 ↔ 4 ↔ 5 karena libur/sakit), fase rotasi teracak
 *      dan satu orang bisa menumpuk satu huruf: Oktober 2026 (kehadiran 4
 *      staff identik) menghasilkan A=10 vs D=6 pada orang yang sama — gap 4,
 *      di atas ambang FAIRNESS_GAP_THRESHOLD = 3.
 *   2. Sort prioritas setelah rotasi paket membatalkan geseran paket, jadi
 *      "rotasi paket" lama tidak pernah benar-benar berputar.
 *   3. Saat jumlah staff > jumlah paket (5 masuk, 4 paket), staf ke-5 dapat
 *      potongan kosong → bekerja tanpa jobdesk sama sekali (roleCode '').
 *
 * Sekarang: setiap paket diberikan ke staff yang jumlah huruf paket itu
 * paling sedikit di riwayat periode (bulan) — rotasi tetap jalan sebagai
 * tie-break. Tes di bawah memakai kehadiran BERGANTI-GANTI (4/5/4/5/4),
 * skenario terburuk September, dan menuntut gap ≤ 3 tiap staff.
 */
describe('Fairness rotasi jobdesk Kitchen (huruf A-D)', () => {
  const JOBDESKS = ['Main Cook / Support Cook', 'Support Cook', 'Checker + Plating + Dishwasher', 'Runner + Helper'];
  const STAFF = [101, 102, 103, 104, 105];
  const QUEUE = new Map([
    [101, { userId: 101, queueIndex: 0 }],
    [102, { userId: 102, queueIndex: 1 }],
    [103, { userId: 103, queueIndex: 2 }],
    [104, { userId: 104, queueIndex: 3 }],
    [105, { userId: 105, queueIndex: 4 }],
  ]);
  const ROSTER = new Map(STAFF.map((u, i) => [u, i]));
  const blank = () => ({ A: 0, B: 0, C: 0, D: 0, total: 0 });
  const dayOffset = rotationService.dayOffsetOfMonth; // fase reset tiap tanggal 1
  // Dedup per huruf: sehari 'Checker + Plating' = 1x C, sama seperti laporan.
  const countLetters = (agg, roleCode) => {
    for (const L of rotationService._kitchenLettersOfRoleCode(roleCode)) agg[L] += 1;
  };

  /** Jumlahkan huruf tiap staff setelah N hari sesuai pola kehadiran.
   * opts.resetAtDay = indeks hari saat guard periode bulanan menyegarkan
   * counts (mimik `_kitchenPeriodKey` di generateWeek) — agg pun direset
   * supaya pengukuran hanya mencakup huruf bulan baru. */
  const runDays = (pattern, nDays, opts = {}) => {
    const { resetAtDay = -1 } = opts;
    let counts = new Map(STAFF.map((u) => [u, blank()]));
    let agg = new Map(STAFF.map((u) => [u, blank()]));
    const t0 = Date.UTC(2026, 10, 2); // Senin 2026-11-02
    for (let i = 0; i < nDays; i += 1) {
      if (i === resetAtDay) {
        counts = new Map(STAFF.map((u) => [u, blank()]));
        agg = new Map(STAFF.map((u) => [u, blank()]));
      }
      const dateObj = new Date(t0 + i * 86400000);
      const present = pattern(i);
      if (!present.length) continue;
      const assign = rotationService._assignKitchenByQueue(
        JOBDESKS, present, QUEUE, ROSTER, dayOffset(dateObj), counts
      );
      rotationService._applyKitchenDayToCounts(counts, assign);
      for (const uid of present) {
        countLetters(agg.get(uid), assign.get(uid)?.roleCode || '');
      }
    }
    return agg;
  };

  const gapOf = (a) => Math.max(a.A, a.B, a.C, a.D) - Math.min(a.A, a.B, a.C, a.D);

  it('kehadiran berubah-ubah (4/5/4/5/4) tetap merata: gap maks ≤ 3 per staff', () => {
    const pattern = (i) => STAFF.slice(0, i % 2 === 0 ? 4 : 5);
    const agg = runDays(pattern, 20);
    for (const uid of STAFF) {
      const a = agg.get(uid);
      expect(gapOf(a)).toBeLessThanOrEqual(3);
    }
    // Staf ke-5 (hanya masuk saat 5 orang) tetap kebagian jobdesk.
    expect(agg.get(105).A + agg.get(105).B + agg.get(105).C + agg.get(105).D).toBeGreaterThan(0);
  });

  it('5 staff & 4 paket: SEMUA staff dapat jobdesk (tidak ada roleCode kosong)', () => {
    const counts = new Map(STAFF.map((u) => [u, blank()]));
    for (let i = 0; i < 12; i += 1) {
      const assign = rotationService._assignKitchenByQueue(
        JOBDESKS, STAFF, QUEUE, ROSTER, dayOffset(new Date(Date.UTC(2026, 10, 2 + i))), counts
      );
      rotationService._applyKitchenDayToCounts(counts, assign);
      for (const uid of STAFF) {
        expect(String(assign.get(uid)?.roleCode || '').length).toBeGreaterThan(0);
      }
    }
  });

  it('semua staff masuk tiap hari: gap maks ≤ 2 dalam sebulan', () => {
    const agg = runDays(() => STAFF.slice(0, 4), 28);
    for (const uid of STAFF.slice(0, 4)) {
      expect(gapOf(agg.get(uid))).toBeLessThanOrEqual(2);
    }
  });

  it('musim libur: 3 staff, tidak ada yang menumpuk satu huruf', () => {
    const agg = runDays(() => STAFF.slice(0, 3), 28);
    for (const uid of STAFF.slice(0, 3)) {
      expect(gapOf(agg.get(uid))).toBeLessThanOrEqual(3);
    }
  });

  it('kunci periode bulanan berubah saat ganti bulan (guard reset counts)', () => {
    const key = (d) => rotationService._kitchenPeriodKey(d);
    expect(key(new Date(Date.UTC(2026, 9, 1)))).toBe('2026-10');
    expect(key(new Date(Date.UTC(2026, 9, 31)))).toBe('2026-10');
    expect(key(new Date(Date.UTC(2026, 10, 1)))).toBe('2026-11');
    expect(key(new Date(Date.UTC(2026, 10, 1)))).not.toBe(key(new Date(Date.UTC(2026, 9, 31))));
    // String ISO dan Date harus menghasilkan kunci yang sama.
    expect(key('2026-11-02')).toBe(key(new Date(Date.UTC(2026, 10, 2))));
  });

  it('bulan baru mulai dari nol: huruf bulan lama tidak terbawa', () => {
    // 10 hari = "akhir bulan", lalu guard periode menyegarkan counts,
    // lalu 20 hari bulan baru yang diukur tersendiri.
    const agg = runDays((i) => STAFF.slice(0, i % 2 === 0 ? 4 : 5), 30, { resetAtDay: 10 });
    for (const uid of STAFF) {
      const a = agg.get(uid);
      expect(gapOf(a)).toBeLessThanOrEqual(3);
      // 20 hari bulan baru => tak ada huruf yang bisa melebihi ~6 hari.
      expect(Math.max(a.A, a.B, a.C, a.D)).toBeLessThanOrEqual(8);
    }
  });

  it('fase antrian direset setiap tanggal 1 (bukan berlanjut dari bulan lama)', () => {
    // dayOffset HANYA tie-break, tapi dulu ia angka epoch yang terus naik.
    // Sekarang tanggal 1 selalu 0, tanggal 2 selalu 1, dst.
    expect(dayOffset(new Date(Date.UTC(2026, 9, 1)))).toBe(0);
    expect(dayOffset(new Date(Date.UTC(2026, 9, 15)))).toBe(14);
    expect(dayOffset(new Date(Date.UTC(2026, 9, 31)))).toBe(30);
    expect(dayOffset(new Date(Date.UTC(2026, 10, 1)))).toBe(0); // ganti bulan -> 0 lagi
    // String ISO harus sama hasilnya dengan Date.
    expect(dayOffset('2026-11-01')).toBe(0);
  });

  it('komposisi bulan identik -> distribusi huruf identik (fase tidak lompat)', () => {
    // Regresi bug skew Oktober: dulu fase bergeser tiap ganti bulan karena
    // offset epoch. Dengan offset per-bulan, dua bulan dengan kehadiran &
    // antrian sama persis menghasilkan PETA huruf yang sama persis.
    const monthA = runDays((i) => STAFF.slice(0, i % 2 === 0 ? 4 : 5), 20);
    const monthB = runDays((i) => STAFF.slice(0, i % 2 === 0 ? 4 : 5), 20);
    for (const uid of STAFF) {
      expect(monthB.get(uid)).toEqual(monthA.get(uid));
    }
  });

  // ---- Laporan jobdesk membaca tabel log, jadi SEMUA jalur penulis jadwal
  // harus menulis log. Sebelum perbaikan ini, redistribusi (swap/off-day)
  // hanya menulis userSchedule.kitchenStation sehingga laporan selisih
  // dengan jadwal aktual (terukur: 5 selisih huruf pada 1-4 Okt 2026).
  it('redistribusi kitchen ikut menulis kitchenJobdeskLog', () => {
    const srcService = fs.readFileSync(require.resolve('../src/services/rotationService'), 'utf8');
    const start = srcService.indexOf('async distributeKitchenJobdesksForDates');
    expect(start).toBeGreaterThan(-1);
    // badan fungsi redistribusi, sampai method berikutnya
    const body = srcService.slice(start, srcService.indexOf('\n  async ', start + 10));
    expect(body).toContain('_writeKitchenJobdeskLogs');
    expect(body).toContain('_kitchenLogRow');
    // hari libur: log lama ikut DIHAPUS, bukan ditinggal jadi "hari hantu"
    expect(body).toContain('kitchenJobdeskLog.deleteMany');
  });

  it('_kitchenLogRow membentuk baris log sesuai kolom laporan', () => {
    const date = new Date(Date.UTC(2026, 9, 5));
    const row = rotationService._kitchenLogRow(date, 101, 'Main Cook / Support Cook + Runner', 4);
    expect(row).toEqual({
      date,
      userId: 101,
      roleCode: 'MAIN+RUNNER',
      packagesAssigned: 'Main Cook / Support Cook + Runner',
      workingCount: 4,
      rotationVersion: 2,
    });
  });
});


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

  /** YYYY-MM-DD (UTC) — sama dengan toISO privat di rotationService. */
  const isoOf = (d) => new Date(d).toISOString().slice(0, 10);

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

  it('generate per-minggu (jalur UI bebas 504) menghasilkan jadwal yang SAMA dengan generate-month', async () => {
    // UI memanggil generate-week-with-check satu kali per minggu karena
    // /generate-month melewati batas 60 s function Vercel. Kedua jalur wajib
    // menghasilkan jadwal yang identik, kalau tidak admin melihat jadwal
    // berbeda hanya karena UI-nya beda.
    const nextWeek = new Date(WEEK.getTime() + 7 * day);

    await rotationService.generateMonth(positionNormal.id, '2026-11');
    const viaMonth = { this: await shiftMap(positionNormal.id, WEEK), next: await shiftMap(positionNormal.id, nextWeek) };

    await rotationService.generateWeekWithCheck(positionNormal.id, isoOf(WEEK), '2026-11');
    await rotationService.generateWeekWithCheck(positionNormal.id, isoOf(nextWeek), '2026-11');
    const viaWeek = { this: await shiftMap(positionNormal.id, WEEK), next: await shiftMap(positionNormal.id, nextWeek) };

    expect(viaWeek.this.s1).toEqual(viaMonth.this.s1);
    expect(viaWeek.this.s2).toEqual(viaMonth.this.s2);
    expect(viaWeek.next.s1).toEqual(viaMonth.next.s1);
    expect(viaWeek.next.s2).toEqual(viaMonth.next.s2);
  });

  it('generate-week-with-check melaporkan kekurangan staff minggu itu saja, sama seperti generate-month', async () => {
    const month = '2026-11';
    const monday = WEEK;

    const viaMonth = await rotationService.generateMonth(positionNormal.id, month);
    const weekData = await rotationService.generateWeekWithCheck(
      positionNormal.id,
      isoOf(monday),
      month,
    );

    // Hanya tanggal dalam minggu yang diminta — bukan tanggal minggu lain.
    const weekDates = new Set(
      Array.from({ length: 7 }, (_, i) => isoOf(new Date(monday.getTime() + i * day))),
    );
    const expected = viaMonth.understaffed.filter((u) => weekDates.has(u.date));

    expect(weekData.weekStart).toBe(isoOf(monday));
    expect(weekData.understaffed).toEqual(expected);
    // Tanggal yang dilaporkan harus berada di minggu ini — bukan minggu lain.
    expect(weekData.understaffed.every((u) => weekDates.has(u.date))).toBe(true);
  });

  it('generate-week-with-check menolak weekStart kosong', async () => {
    await expect(rotationService.generateWeekWithCheck(positionNormal.id, null)).rejects.toThrow(
      /weekStart/i,
    );
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

