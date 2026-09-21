const { AppError } = require('../utils/AppError');
const prisma = require('../utils/database');

/**
 * Rotation Service
 * Handles position-based circular shift rotation.
 *
 * Aturan rotasi: urutan roster (orderIndex) digeser `step` posisi SETIAP MINGGU.
 *   idx(week) = (anchorIndex + jumlahMingguSejakAnchor(week) * step) % totalRoster
 *   Shift 1   = roster[idx .. idx + s1Count - 1]
 *   Shift 2   = sisanya (melingkar)
 *
 * `step` dan `s1Count` dihitung di _shiftSplit(position, totalRoster):
 *   - Posisi mode "jadwalkan semua yang tidak libur" (Dapur/Kitchen):
 *     FLEKSIBEL mengikuti JUMLAH STAFF.
 *       s1Count = ceil(n / 2)   dan   step = s1Count
 *         2 staff -> 1/1      3 staff -> 2/1      4 staff -> 2/2      5 staff -> 3/2
 *     Akibatnya n GENAP tukar penuh tiap Senin, n GANJIL tepat 1 orang bertahan.
 *   - Posisi biasa (mis. Bar): s1Count = step = shift1Capacity yang diatur admin.
 *
 * `idx` dihitung dari TANGGAL minggu tersebut (anchor + jarak minggu), BUKAN
 * disimpan lalu dimajukan tiap generate. Jadi generate ulang untuk minggu/bulan
 * yang sama menghasilkan jadwal identik (idempoten) dan tidak saling menggeser
 * antar bulan.
 *
 * `roster.shiftNumber` TIDAK dipakai untuk menentukan shift hasil generate —
 * hanya sebagai catatan pengaturan admin. Lihat dokumentasi di generateWeek().
 */

function toDateOnly(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Get Monday (00:00 UTC) of the week containing `date`. */
function getMonday(date) {
  const d = toDateOnly(date);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon
  const diff = (day === 0 ? -6 : 1 - day);
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/** Format a Date to YYYY-MM-DD (UTC). */
function toISO(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Circular slice of an array starting at index, length `count`. */
function circularSlice(arr, start, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(arr[(start + i) % arr.length]);
  }
  return out;
}

/**
 * Selisih jumlah minggu antara dua tanggal (dihitung dari Senin-nya).
 * Bisa negatif bila `to` lebih awal dari `from`.
 */
function weeksBetween(fromDate, toDate) {
  return Math.round(
    (getMonday(toDate).getTime() - getMonday(fromDate).getTime()) / (7 * 86400000),
  );
}

/** Modulo yang selalu mengembalikan nilai non-negatif. */
function mod(n, m) {
  return ((n % m) + m) % m;
}

/**
 * Indeks hari sejak epoch (1970-01-01 UTC). Dipakai sebagai `dayOffset` rotasi
 * Kitchen agar hasilnya KONSISTEN di semua jalur pemanggil: menghasilkan
 * jobdesk yang sama untuk tanggal yang sama, tak peduli minggu mana yang
 * sedang digenerate maupun urutan tanggal yang diproses.
 */
function dayOffsetEpoch(date) {
  return Math.floor(toDateOnly(date).getTime() / 86400000);
}

class RotationService {
  // ---------- Positions ----------

  async listPositions(includeDetails = true) {
    const positions = await prisma.position.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    if (!includeDetails) return positions;

    const result = [];
    for (const p of positions) {
      const rosters = await prisma.positionRoster.findMany({
        where: { positionId: p.id },
        orderBy: { orderIndex: 'asc' },
        include: { user: { select: { id: true, fullName: true } } },
      });
      const rotationState = await prisma.rotationState.findFirst({
        where: { positionId: p.id },
      });
      const jobdesks = await prisma.positionJobdesk.findMany({
        where: { positionId: p.id },
        orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
      });
      result.push({
        ...p,
        rosters,
        rotationState,
        jobdesks,
      });
    }
    return result;
  }

  async getPosition(positionId, weekStart) {
    const position = await prisma.position.findUnique({
      where: { id: positionId },
    });
    if (!position) {
      throw new AppError(`Posisi dengan ID ${positionId} tidak ditemukan`, 404, 'NOT_FOUND');
    }
    const rawRosters = await prisma.positionRoster.findMany({
      where: { positionId },
      orderBy: { orderIndex: 'asc' },
      include: { user: { select: { id: true, fullName: true } } },
    });
    // Dedupe roster berdasarkan userId: jika seorang user terdaftar dua kali
    // (data legacy), rotasi akan menghitung dia dua kali dan hasil dedupe di
    // generateWeek membuat dia HILANG dari salah satu shift. Ambil entri
    // pertama per user agar setiap user hanya dihitung sekali.
    const seen = new Set();
    const rosters = rawRosters.filter((r) => {
      if (seen.has(r.userId)) return false;
      seen.add(r.userId);
      return true;
    });
    const rotationState = await prisma.rotationState.findFirst({
      where: { positionId },
    });
    const jobdesks = await prisma.positionJobdesk.findMany({
      where: { positionId },
      orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
    });
    // Pratinjau rotasi: supaya UI bisa menunjukkan siapa di Shift 1/2 minggu itu
    // (roster = URUTAN rotasi, bukan penugasan shift tetap).
    const previewWeekStart = weekStart || new Date();
    const rotationPreview = this.buildRotationPreview(
      { ...position, rotationState },
      rosters,
      previewWeekStart,
    );
    return { ...position, rosters, rotationState, jobdesks, rotationPreview };
  }

  // ---------- Jobdesk (rotasi harian) ----------

  // Ganti seluruh daftar jobdesk sebuah posisi.
  // names: array berurutan berisi string ATAU objek { name, isHeavy }.
  async setJobdesks(positionId, names) {
    await this.getPosition(positionId);
    if (!Array.isArray(names)) {
      throw new AppError('Daftar jobdesk tidak valid', 400, 'VALIDATION_ERROR');
    }
    // Normalisasi ke { name, isHeavy } dan buang duplikat nama.
    const seen = new Set();
    const clean = [];
    for (const n of names) {
      const name = String(typeof n === 'object' && n !== null ? n.name : n).trim();
      const isHeavy = !!(typeof n === 'object' && n !== null && n.isHeavy);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      clean.push({ name, isHeavy });
    }
    await prisma.positionJobdesk.deleteMany({ where: { positionId } });
    if (clean.length) {
      await prisma.positionJobdesk.createMany({
        data: clean.map((j, i) => ({ positionId, name: j.name, isHeavy: j.isHeavy, orderIndex: i })),
      });
    }
    return prisma.positionJobdesk.findMany({
      where: { positionId },
      orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
    });
  }

  async listJobdesks(positionId) {
    return prisma.positionJobdesk.findMany({
      where: { positionId },
      orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Validasi kapasitas shift: harus angka bulat minimal 1, karena kapasitas
   * 0/negatif berarti tidak ada seorang pun yang bisa ditempatkan di shift itu.
   *
   * DILEWATI untuk posisi mode "jadwalkan semua yang tidak libur": pada mode itu
   * jumlah orang per shift dihitung dari jumlah roster, bukan dari kolom ini.
   */
  _assertCapacities(shift1Capacity, shift2Capacity, scheduleAllWorking = false) {
    if (scheduleAllWorking) return;
    const fields = [];
    if (shift1Capacity !== undefined && shift1Capacity !== null) fields.push(['Kapasitas Shift 1', shift1Capacity]);
    if (shift2Capacity !== undefined && shift2Capacity !== null) fields.push(['Kapasitas Shift 2', shift2Capacity]);
    for (const [label, value] of fields) {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) {
        throw new AppError(`${label} harus angka bulat minimal 1`, 400, 'VALIDATION_ERROR');
      }
    }
  }

  /**
   * Menerjemahkan opsi perubahan posisi menjadi data Prisma, sekaligus
   * mengosongkan `shift1Capacity`/`shift2Capacity` saat posisi masuk mode
   * "jadwalkan semua yang tidak libur". Pada mode itu jumlah orang per shift
   * ditentukan JUMLAH ROSTER (lihat _shiftSplit), jadi angka kapasitas hanya
   * menyesatkan admin. Diubah ke 0 = "diikuti jumlah staff"; kolomnya tetap
   * NOT NULL sehingga tidak bisa diisi null.
   */
  _positionWriteData({ name, shift1Capacity, shift2Capacity, isActive, scheduleAllWorking }, current = {}) {
    const data = {};
    if (name !== undefined) data.name = name;
    if (shift1Capacity !== undefined) data.shift1Capacity = shift1Capacity;
    if (shift2Capacity !== undefined) data.shift2Capacity = shift2Capacity;
    if (isActive !== undefined) data.isActive = isActive;
    if (scheduleAllWorking !== undefined) data.scheduleAllWorking = scheduleAllWorking;

    const flexible = data.scheduleAllWorking !== undefined
      ? data.scheduleAllWorking
      : current.scheduleAllWorking;
    if (flexible) {
      data.shift1Capacity = 0;
      data.shift2Capacity = 0;
    }
    return data;
  }

  async createPosition({ name, shift1Capacity, shift2Capacity, scheduleAllWorking }) {
    if (!name) {
      throw new AppError('Nama posisi wajib diisi', 400, 'VALIDATION_ERROR');
    }
    this._assertCapacities(shift1Capacity, shift2Capacity, scheduleAllWorking ?? false);
    const existing = await prisma.position.findUnique({ where: { name } });
    if (existing) {
      throw new AppError(`Posisi "${name}" sudah ada`, 409, 'VALIDATION_ERROR');
    }

    const position = await prisma.position.create({
      data: this._positionWriteData(
        {
          name,
          shift1Capacity: shift1Capacity ?? 2,
          shift2Capacity: shift2Capacity ?? 3,
          scheduleAllWorking: scheduleAllWorking ?? false,
        },
        { scheduleAllWorking: false },
      ),
    });

    await prisma.rotationState.create({
      data: { positionId: position.id, currentStartIndex: 0 },
    });

    return this.getPosition(position.id);
  }

  async deletePosition(positionId) {
    const position = await prisma.position.findUnique({ where: { id: positionId } });
    if (!position) throw new AppError('Posisi tidak ditemukan', 404);
    // Soft delete: set isActive = false
    return prisma.position.update({
      where: { id: positionId },
      data: { isActive: false },
    });
  }

  async updatePosition(positionId, { name, shift1Capacity, shift2Capacity, isActive, scheduleAllWorking }) {
    const position = await prisma.position.findUnique({ where: { id: positionId } });
    if (!position) {
      throw new AppError(`Posisi dengan ID ${positionId} tidak ditemukan`, 404, 'NOT_FOUND');
    }
    const flexible = scheduleAllWorking !== undefined
      ? scheduleAllWorking
      : position.scheduleAllWorking;
    this._assertCapacities(
      shift1Capacity !== undefined ? shift1Capacity : position.shift1Capacity,
      shift2Capacity !== undefined ? shift2Capacity : position.shift2Capacity,
      flexible,
    );

    await prisma.position.update({
      where: { id: positionId },
      data: this._positionWriteData(
        { name, shift1Capacity, shift2Capacity, isActive, scheduleAllWorking },
        position,
      ),
    });
    return this.getPosition(positionId);
  }

  // ---------- Roster ----------

  async setRoster(positionId, entries) {
    await this.getPosition(positionId);

    if (!Array.isArray(entries) || entries.length === 0) {
      throw new AppError('Roster minimal berisi 1 karyawan', 400, 'VALIDATION_ERROR');
    }

    const normalized = entries.map((e, index) => {
      const userId = typeof e === 'number' ? e : e?.userId;
      const shiftNumber = typeof e === 'number' ? 1 : (e?.shiftNumber || 1);
      return { userId, shiftNumber, orderIndex: index };
    });

    const userIds = normalized.map((e) => e.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, isActive: true },
      select: { id: true },
    });
    const validIds = new Set(users.map((u) => u.id));
    const invalid = userIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      throw new AppError(`User ID tidak valid/nonaktif: ${invalid.join(', ')}`, 400, 'VALIDATION_ERROR');
    }

    await prisma.$transaction([
      prisma.positionRoster.deleteMany({ where: { positionId } }),
      ...normalized.map((e) =>
        prisma.positionRoster.create({
          data: { positionId, userId: e.userId, orderIndex: e.orderIndex, shiftNumber: e.shiftNumber },
        }),
      ),
    ]);

    const existingState = await prisma.rotationState.findFirst({
      where: { positionId },
    });
    // Roster berubah = urutan rotasi berubah, jadi anchor di-reset. Generate
    // berikutnya akan memakai anchor baru (index 0 di minggu yang digenerate).
    // Jadwal yang sudah tertulis TIDAK dihapus di sini; generate ulang minggu
    // tersebut yang akan menyesuaikannya.
    if (existingState) {
      await prisma.rotationState.update({
        where: { id: existingState.id },
        data: {
          currentStartIndex: 0,
          lastGeneratedWeekStart: null,
          anchorWeekStart: null,
          anchorIndex: 0,
        },
      });
    } else {
      await prisma.rotationState.create({
        data: { positionId, currentStartIndex: 0, anchorIndex: 0 },
      });
    }

    return this.getPosition(positionId);
  }

  async insertRosterMember(positionId, userId, orderIndex) {
    const position = await this.getPosition(positionId);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new AppError(`User ID ${userId} tidak valid/nonaktif`, 400, 'VALIDATION_ERROR');
    }

    const existing = await prisma.positionRoster.findUnique({
      where: { positionId_userId: { positionId, userId } },
    });
    if (existing) {
      throw new AppError('User sudah ada di roster posisi ini', 409, 'VALIDATION_ERROR');
    }

    const rosters = position.rosters;
    const total = rosters.length;
    const insertAt = orderIndex === undefined || orderIndex === null
      ? total
      : Math.max(0, Math.min(orderIndex, total));

    await prisma.$transaction(
      async (tx) => {
      for (let i = total - 1; i >= insertAt; i--) {
        await tx.positionRoster.update({
          where: { id: rosters[i].id },
          data: { orderIndex: i + 1 },
        });
      }
      await tx.positionRoster.create({
        data: { positionId, userId, orderIndex: insertAt },
      });
      await tx.rotationState.upsert({
        where: { positionId },
        update: {
          currentStartIndex: 0,
          lastGeneratedWeekStart: null,
          anchorWeekStart: null,
          anchorIndex: 0,
        },
        create: { positionId, currentStartIndex: 0, anchorIndex: 0 },
      });
    });

    return this.getPosition(positionId);
  }

  async removeRosterMember(positionId, userId) {
    const position = await this.getPosition(positionId);

    const target = await prisma.positionRoster.findUnique({
      where: { positionId_userId: { positionId, userId } },
    });
    if (!target) {
      throw new AppError('User tidak ada di roster posisi ini', 404, 'NOT_FOUND');
    }

    const removedIndex = target.orderIndex;

    await prisma.$transaction(async (tx) => {
      await tx.positionRoster.delete({ where: { id: target.id } });

      const subsequent = await tx.positionRoster.findMany({
        where: { positionId, orderIndex: { gt: removedIndex } },
        orderBy: { orderIndex: 'asc' },
      });
      for (const r of subsequent) {
        await tx.positionRoster.update({
          where: { id: r.id },
          data: { orderIndex: r.orderIndex - 1 },
        });
      }

      await tx.rotationState.upsert({
        where: { positionId },
        update: {
          currentStartIndex: 0,
          lastGeneratedWeekStart: null,
          anchorWeekStart: null,
          anchorIndex: 0,
        },
        create: { positionId, currentStartIndex: 0, anchorIndex: 0 },
      });
    });

    return this.getPosition(positionId);
  }

  // ---------- Schedule Generation ----------

  /**
   * Pembagian Shift 1 / Shift 2 untuk satu minggu — SATU sumber kebenaran,
   * dipakai generateWeek, buildRotationPreview, dan laporan kekurangan staff.
   *
   * Posisi mode "jadwalkan semua yang tidak libur" (Dapur/Kitchen) memakai
   * formasi FLEKSIBEL: jumlah orang per shift mengikuti JUMLAH ANGGOTA ROSTER,
   * bukan angka kapasitas yang diisi admin.
   *
   *   Shift 1 = ceil(n / 2)      Shift 2 = sisanya
   *     2 staff -> 1/1
   *     3 staff -> 2/1
   *     4 staff -> 2/2
   *     5 staff -> 3/2
   *     6 staff -> 3/3
   *
   * Langkah rotasi = jumlah orang di Shift 1, sehingga pergantiannya:
   *   n GENAP -> tukar penuh tiap Senin, tidak ada yang bertahan
   *              n=4 (2/2): {A,B} -> {C,D} -> {A,B} -> ...
   *   n GANJIL -> tepat 1 orang bertahan, sisanya bertukar
   *              n=5 (3/2): {A,B,C} -> {D,E,A} -> {B,C,D} -> {E,A,B} -> ...
   *
   * Posisi biasa (mis. Bar) memakai kapasitas yang diatur admin.
   */
  _shiftSplit(position, total) {
    if (!total) return { s1Count: 0, s2Count: 0, step: 1 };

    if (position.scheduleAllWorking) {
      const s1Count = Math.ceil(total / 2);
      return { s1Count, s2Count: total - s1Count, step: s1Count };
    }

    const capacity = Math.max(1, Number(position.shift1Capacity) || 1);
    const s1Count = Math.max(1, Math.min(capacity, total));
    return { s1Count, s2Count: total - s1Count, step: capacity };
  }

  /** Langkah geser rotasi per minggu (lihat _shiftSplit). */
  _rotationStep(position, total) {
    return this._shiftSplit(position, total).step;
  }

  /**
   * Titik acuan rotasi: (anchorWeekStart, anchorIndex) = minggu anchor memakai
   * startIndex sebesar anchorIndex. Minggu lain dihitung dari JARAK MINGGU-nya,
   * bukan dari berapa kali tombol Generate ditekan:
   *
   *   idx(monday) = (anchorIndex + jarakMinggu(anchor, monday) * step) % totalRoster
   *
   * Konsekuensi yang diinginkan: generate ulang minggu/bulan yang sama
   * menghasilkan jadwal IDENTIK (idempoten), dan generate satu bulan tidak
   * menggeser minggu yang sudah benar di bulan sebelahnya.
   *
   * Bila anchor belum tersimpan (posisi baru, atau roster baru diubah yang
   * me-reset anchor), anchor diambil dari state lama agar jadwal yang SUDAH
   * tergenerate tidak berubah: state lama menyimpan
   * `currentStartIndex` = index untuk minggu BERIKUTNYA, sehingga index minggu
   * `lastGeneratedWeekStart` = currentStartIndex - step.
   */
  _resolveAnchor(position, monday, rosterLength, step) {
    const state = position.rotationState || {};
    if (state.anchorWeekStart) {
      return {
        anchorWeekStart: getMonday(state.anchorWeekStart),
        anchorIndex: mod(Number(state.anchorIndex) || 0, rosterLength || 1),
      };
    }
    if (state.lastGeneratedWeekStart) {
      return {
        anchorWeekStart: getMonday(state.lastGeneratedWeekStart),
        anchorIndex: mod((Number(state.currentStartIndex) || 0) - step, rosterLength || 1),
      };
    }
    return {
      anchorWeekStart: getMonday(monday),
      anchorIndex: mod(Number(state.currentStartIndex) || 0, rosterLength || 1),
    };
  }

  /** Index rotasi untuk sebuah minggu, dihitung dari anchor (deterministik). */
  _indexFromAnchor(anchor, monday, rosterLength, step) {
    return mod(
      anchor.anchorIndex + weeksBetween(anchor.anchorWeekStart, monday) * step,
      rosterLength || 1,
    );
  }

  /** Index rotasi untuk sebuah minggu (anchor di-resolve otomatis). */
  _indexForWeek(position, monday, rosterLength, step) {
    return this._indexFromAnchor(
      this._resolveAnchor(position, monday, rosterLength, step),
      monday,
      rosterLength,
      step,
    );
  }

  /**
   * Bagi urutan rotasi menjadi Shift 1 / Shift 2 (lihat _shiftSplit untuk
   * aturan jumlah orangnya).
   */
  _splitShifts(rotated, position) {
    const total = rotated.length;
    if (!total) return { shift1Members: [], shift2Members: [] };

    const { s1Count } = this._shiftSplit(position, total);

    return {
      shift1Members: rotated.slice(0, s1Count),
      shift2Members: rotated.slice(s1Count),
    };
  }

  /**
   * Pratinjau rotasi untuk minggu tertentu — dipakai UI supaya admin melihat
   * siapa di Shift 1/2 MINGGU INI, bukan mengira roster = penugasan tetap.
   * Memakai perhitungan yang sama dengan generateWeek.
   */
  buildRotationPreview(position, rosters, weekStart) {
    const total = rosters.length;
    const { s1Count, s2Count, step } = this._shiftSplit(position, total);
    if (!total) {
      return {
        weekStart: toISO(getMonday(weekStart)),
        step,
        startIndex: 0,
        shift1Count: 0,
        shift2Count: 0,
        rosterCount: 0,
        shift1UserIds: [],
        shift2UserIds: [],
      };
    }
    const startIndex = this._indexForWeek(position, weekStart, total, step);
    const rotated = [...rosters.slice(startIndex), ...rosters.slice(0, startIndex)];
    const { shift1Members, shift2Members } = this._splitShifts(rotated, position);
    return {
      weekStart: toISO(getMonday(weekStart)),
      step,
      startIndex,
      rosterCount: total,
      shift1Count: s1Count,
      shift2Count: s2Count,
      shift1UserIds: shift1Members.map((r) => r.userId),
      shift2UserIds: shift2Members.map((r) => r.userId),
    };
  }

  async generateWeek(positionId, weekStart, options = {}) {
    const position = await this.getPosition(positionId);

    const roster = position.rosters;
    if (roster.length === 0) {
      throw new AppError(
        `Roster posisi "${position.name}" masih kosong. Isi roster terlebih dahulu.`,
        400,
        'VALIDATION_ERROR',
      );
    }

    let monday;
    if (weekStart) {
      monday = getMonday(weekStart);
    } else {
      const state = position.rotationState;
      if (state && state.lastGeneratedWeekStart) {
        monday = addDays(getMonday(state.lastGeneratedWeekStart), 7);
      } else {
        monday = getMonday(new Date());
      }
    }

    const state = position.rotationState || { currentStartIndex: 0 };
    const totalRoster = roster.length;
    const step = this._rotationStep(position, totalRoster);
    const anchor = this._resolveAnchor(position, monday, totalRoster, step);
    const startIndex = this._indexFromAnchor(anchor, monday, totalRoster, step);

    const shift1 = await prisma.shift.findFirst({ where: { name: 'Shift 1' } });
    const shift2 = await prisma.shift.findFirst({ where: { name: 'Shift 2' } });

    if (!shift1 || !shift2) {
      throw new AppError('Data Shift 1 dan Shift 2 belum ada di database', 500, 'INTERNAL_ERROR');
    }

    // Rotasi berdasarkan POSISI DI URUTAN ROTASI (orderIndex, circular), bukan
    // berdasarkan `roster.shiftNumber` yang tersimpan.
    //
    // PENTING: index rotasi dihitung dari TANGGAL minggu itu (`_indexFromAnchor`),
    // bukan disimpan lalu dimajukan tiap kali fungsi ini dipanggil. Karena itu
    // generate ulang untuk minggu yang sama menghasilkan jadwal yang SAMA
    // (idempoten), dan generate satu bulan tidak menukar minggu di bulan lain.
    const idx = startIndex % roster.length;
    const rotated = [...roster.slice(idx), ...roster.slice(0, idx)];

    const { shift1Members, shift2Members } = this._splitShifts(rotated, position);

    const assignments = [
      ...shift1Members.map(({ userId }) => ({ userId, shiftNumber: 1, shiftId: shift1.id })),
      ...shift2Members.map(({ userId }) => ({ userId, shiftNumber: 2, shiftId: shift2.id })),
    ];

    // Dedupe by userId (a user should only be assigned once per week).
    const uniqueAssignments = [];
    const seenUserIds = new Set();
    for (const a of assignments) {
      if (!seenUserIds.has(a.userId)) {
        seenUserIds.add(a.userId);
        uniqueAssignments.push(a);
      }
    }

    const mondayISO = toISO(monday);

    await prisma.weeklySchedule.deleteMany({
      where: { positionId, weekStart: monday },
    });

    if (uniqueAssignments.length) {
      await prisma.weeklySchedule.createMany({
        data: uniqueAssignments.map((a) => ({
          positionId,
          weekStart: monday,
          userId: a.userId,
          shiftNumber: a.shiftNumber,
          isGenerated: true,
        })),
      });
    }
    const assignedUserIds = new Set(assignments.map((a) => a.userId));
    const allRosterIds = roster.map((r) => r.userId);

    // Build all (userId, date) pairs for the 7-day week in one pass.
    const weekDates = Array.from({ length: 7 }, (_, day) => addDays(monday, day));

    // Ambil aturan libur dari SEMUA sumber (ManualOffDay "Atur Hari Libur",
    // Leave/cuti APPROVED, OffDayRequest APPROVED, User.offDay mingguan,
    // PublicHoliday) SEBELUM menulis jadwal — agar generate selalu menghormati
    // libur yang sudah diatur admin.
    const offMap = await this.getOffDayUserIds(positionId, weekDates);
    const isOffOn = (userId, dateObj) => offMap.get(userId)?.has(toISO(dateObj)) === true;

    const pairs = [];
    for (const dateObj of weekDates) {
      for (const a of assignments) {
        const off = isOffOn(a.userId, dateObj);
        pairs.push({ userId: a.userId, date: dateObj, shiftId: off ? null : a.shiftId, isOffDay: off });
      }
      for (const userId of allRosterIds) {
        if (assignedUserIds.has(userId)) continue;
        pairs.push({ userId, date: dateObj, shiftId: null, isOffDay: true });
      }
    }

    if (pairs.length) {
      const KITCHEN_NAMES = new Set(['Kitchen', 'Dapur', 'kitchen', 'dapur']);
      const department = KITCHEN_NAMES.has(position.name) ? 'KITCHEN' : 'BAR';

      // Fetch existing manual-override rows for the week to preserve them.
      const existingRows = await prisma.userSchedule.findMany({
        where: {
          OR: pairs.map((p) => ({ userId: p.userId, date: p.date })),
        },
        select: { userId: true, date: true, isManualOverride: true },
      });
      const overrideSet = new Set(
        existingRows
          .filter((r) => r.isManualOverride)
          .map((r) => `${r.userId}_${r.date.toISOString()}`),
      );

      // Hapus baris auto minggu ini: (a) milik anggota roster saat ini, dan
      // (b) baris SISA yang masih berlabel department posisi ini padahal user-nya
      // sudah tidak ada di roster lagi.
      //
      // (b) penting: kalau roster mengecil (mis. Bar dari 6 orang jadi 2 karena
      // Wulan/Juli/Nhelam/Indy pindah ke Dapur), baris lama mereka TIDAK ikut
      // terhapus oleh (a) karena (a) hanya menyentuh user di roster saat ini.
      // Akibatnya kalender menampilkan mereka di kolom Bar dengan shift lama
      // padahal weekly_schedule sudah menempatkan mereka di Dapur.
      //
      // (b) hanya dijalankan bila TIDAK ada posisi aktif lain dengan department
      // sama (mis. Dapur & Kitchen sama-sama KITCHEN); kalau ada, penghapusan
      // selebar department bisa menghapus jadwal posisi lain.
      const otherActiveSameDept = await prisma.position.count({
        where: {
          isActive: true,
          id: { not: positionId },
          name: department === 'KITCHEN'
            ? { in: [...KITCHEN_NAMES] }
            : { notIn: [...KITCHEN_NAMES] },
        },
      });

      await prisma.userSchedule.deleteMany({
        where: {
          isManualOverride: false,
          date: { in: weekDates },
          OR: [
            ...pairs.map((p) => ({ userId: p.userId, date: p.date })),
            ...(otherActiveSameDept === 0 ? [{ temporaryDepartment: department }] : []),
          ],
        },
      });

      // ---- Rotasi jobdesk harian (ANTRIAN TETAP) ----
      // Staff diurutkan menurut `queueIndex` yang TETAP (lihat KitchenJobdeskState).
      // Kehadiran orang lain tidak mengubah urutan ini; paket jobdesk dirotasi
      // per hari, jadi: (1) tidak ada staff yang jobdesknya sama terus,
      // (2) semua jobdesk kebagian bergilir, (3) staff yang off tidak menggeser
      // posisi antrian orang lain secara permanen.
      const jobdeskObjs = position.jobdesks || [];
      const jobdeskList = jobdeskObjs.map((j) => j.name);
      const jobdeskByKey = new Map(); // `${userId}_${dateISO}` -> jobdeskName (bisa "A + B" jika rangkap)
      if (jobdeskList.length) {
        const isKitchenPos = KITCHEN_NAMES.has(position.name);
        const stateMap = isKitchenPos
          ? await this._getOrSeedKitchenStates(positionId, allRosterIds)
          : new Map();
        const rank = new Map(allRosterIds.map((uid, i) => [uid, i]));

        weekDates.forEach((dateObj, dayIdx) => {
          const dateISO = toISO(dateObj);
          // Staff yang bekerja hari ini (tidak libur).
          const working = assignments
            .filter((a) => !isOffOn(a.userId, dateObj))
            .map((a) => a.userId);
          if (!working.length) return;

          const assign = isKitchenPos
            ? this._assignKitchenByQueue(jobdeskList, working, stateMap, rank, dayOffsetEpoch(dateObj))
            : this.assignKitchenStations(jobdeskList, this._sortKitchenByQueue(working, new Map(), rank), dayIdx);

          working.forEach((uid) => {
            const entry = assign.get(uid);
            const jobs = Array.isArray(entry) ? entry : entry?.jobs || [];
            if (jobs.length) jobdeskByKey.set(`${uid}_${dateISO}`, jobs.join(' + '));
          });
        });
      }

      // ---- Catat log keputusan jobdesk Kitchen (untuk laporan bulanan) ----
      // rotationVersion = 2 menandai data hasil antrian tetap. Data lama
      // (sebelum migrasi, dari kolom kitchenStation) ber-versi 1, sehingga
      // laporan bisa memisahkan keduanya.
      if (KITCHEN_NAMES.has(position.name) && jobdeskList.length) {
        const logDateFrom = pairs.length
          ? pairs.reduce((min, p) => (p.date < min ? p.date : min), pairs[0].date)
          : null;
        const logDateTo = pairs.length
          ? pairs.reduce((max, p) => (p.date > max ? p.date : max), pairs[0].date)
          : null;

        const logs = [];
        for (const p of pairs) {
          const dateISO = toISO(p.date);
          const station = jobdeskByKey.get(`${p.userId}_${dateISO}`);
          if (!station) continue; // hari libur / tidak dapat jobdesk → tidak dicatat
          logs.push({
            date: p.date,
            userId: p.userId,
            roleCode: station
              .split(' + ')
              .map((name) => this._kitchenRoleOf(name))
              .filter(Boolean)
              .join('+'),
            packagesAssigned: station,
            workingCount: assignments.filter((a) => !isOffOn(a.userId, p.date)).length,
            rotationVersion: 2,
          });
        }

        if (logs.length && logDateFrom && logDateTo) {
          // Hapus dulu log periode ini supaya generateWeek bersifat IDEMPOTEN:
          // menjalankan ulang minggu yang sama menimpa, bukan menggandakan.
          // Log lama (rotationVersion=1, pra-antrian) tidak tersentuh karena
          // tanggalnya di luar rentang yang digenerate.
          await prisma.kitchenJobdeskLog.deleteMany({
            where: { date: { gte: logDateFrom, lte: logDateTo } },
          });
          await prisma.kitchenJobdeskLog.createMany({ data: logs });
        }
      }

      // Recreate all rows for the week, skipping manual overrides (single bulk create).
      const toCreate = pairs
        .filter((p) => !overrideSet.has(`${p.userId}_${p.date.toISOString()}`))
        .map((p) => ({
          userId: p.userId,
          date: p.date,
          shiftId: p.shiftId,
          isOffDay: p.isOffDay,
          kitchenStation: jobdeskByKey.get(`${p.userId}_${toISO(p.date)}`) || null,
          temporaryDepartment: department,
          isManualOverride: false,
        }));

      if (toCreate.length) {
        await prisma.userSchedule.createMany({ data: toCreate });
      }
    }

    // Simpan titik acuan + minggu terakhir yang digenerate.
    //
    // CATATAN SEMANTIK: mulai sekarang `currentStartIndex` berarti index rotasi
    // untuk `lastGeneratedWeekStart` (dulu: index untuk minggu BERIKUTNYA).
    // `anchorWeekStart`/`anchorIndex` adalah acuan tetap sehingga index tiap
    // minggu bisa dihitung ulang dari tanggalnya (lihat _resolveAnchor).
    await prisma.rotationState.upsert({
      where: { positionId },
      update: {
        currentStartIndex: startIndex,
        lastGeneratedWeekStart: monday,
        anchorWeekStart: anchor.anchorWeekStart,
        anchorIndex: anchor.anchorIndex,
      },
      create: {
        positionId,
        currentStartIndex: startIndex,
        lastGeneratedWeekStart: monday,
        anchorWeekStart: anchor.anchorWeekStart,
        anchorIndex: anchor.anchorIndex,
      },
    });

    if (options.skipGetSchedule) {
      return { positionId, weekStart: mondayISO };
    }
    return this.getSchedule(positionId, mondayISO);
  }

  /**
   * Deteksi peran jobdesk Kitchen dari namanya.
   * Nama di DB bisa "Main Cook", "Support Cook", "Checker / Stock",
   * "Runner / Area", "Helper / Floating", "Plating", dst.
   * @returns {String|null} MAIN | SUPPORT | CHECKER | RUNNER | HELPER | PLATING | DISHWASHER | null
   */
  _kitchenRoleOf(name) {
    const n = String(name || '').toLowerCase();
    if (/plating/.test(n)) return 'PLATING';
    if (/dishwash|cuci|sanitation/.test(n)) return 'DISHWASHER';
    if (/main\s*cook|head\s*cook|kepala/.test(n)) return 'MAIN';
    if (/support|snack/.test(n)) return 'SUPPORT';
    if (/checker|stock|stok/.test(n)) return 'CHECKER';
    if (/runner|area/.test(n)) return 'RUNNER';
    if (/helper|floating/.test(n)) return 'HELPER';
    return null;
  }

  /**
   * Aturan (disepakati September 2026):
   *   5 staff : Main Cook | Support Cook | Checker(+Plating+Dishwasher) | Runner | Helper
   *   4 staff : Main Cook | Support Cook | Checker(+Plating+Dishwasher) | Runner+Helper
   *   3 staff : Main Cook | Support(+Checker+Plating+Dishwasher) | Runner+Helper
   *   2 staff : Main Cook+Support Cook | Checker(+Plating+Dishwasher)+Runner+Helper
   *
   * Dishwasher (cuci alat) BUKAN jobdesk tersendiri di DB — ia tugas tambahan
   * yang selalu menempel ke Checker, sama seperti Plating. Alasan: Checker
   * bebannya paling ringan dan posisinya paling dekat ke Main Cook.
   * Runner+Helper TIDAK menampung cuci alat (harus tampil bersih untuk server).
   *
   * Jobdesk "Plating"/"Dishwasher" (bila ada di DB) selalu menempel ke Checker —
   * Checker tidak pernah dipecah ke dua orang. Jobdesk yang tidak dikenali tetap
   * dapat paket sendiri di akhir supaya jobdesk kustom tidak hilang.
   *
   * @param {String[]} jobdeskList - nama jobdesk posisi (urut orderIndex)
   * @param {Number} nStaff - jumlah staff yang masuk kerja hari itu
   * @returns {String[][]} daftar paket; tiap paket berisi nama jobdesk
   */
  buildKitchenPackages(jobdeskList, nStaff) {
    const plans = {
      1: [['MAIN', 'SUPPORT', 'CHECKER', 'RUNNER', 'HELPER']],
      2: [['MAIN', 'SUPPORT'], ['CHECKER', 'RUNNER', 'HELPER']],
      3: [['MAIN'], ['SUPPORT', 'CHECKER'], ['RUNNER', 'HELPER']],
      4: [['MAIN'], ['SUPPORT'], ['CHECKER'], ['RUNNER', 'HELPER']],
      5: [['MAIN'], ['SUPPORT'], ['CHECKER'], ['RUNNER'], ['HELPER']],
    };

    const byRole = { MAIN: [], SUPPORT: [], CHECKER: [], RUNNER: [], HELPER: [] };
    const extras = [];
    for (const name of jobdeskList) {
      const role = this._kitchenRoleOf(name);
      if (role === 'PLATING' || role === 'DISHWASHER') byRole.CHECKER.push(name);
      else if (role) byRole[role].push(name);
      else extras.push(name);
    }

    // Lebih dari 5 staff → pakai formasi 5 orang, sisanya ikut paket paling ringan.
    const plan = plans[Math.max(1, Math.min(5, nStaff))];

    const packs = plan
      .map((roles) => roles.flatMap((r) => byRole[r]))
      .filter((pack) => pack.length > 0);

    // Jobdesk tak dikenal → paket sendiri (dianggap tugas ringan, ditaruh di akhir)
    extras.forEach((name) => packs.push([name]));

    // Bila jobdesk kustom membuat paket lebih banyak dari staff, gabung dari belakang.
    while (packs.length > nStaff && packs.length > 1) {
      const last = packs.pop();
      packs[packs.length - 1] = packs[packs.length - 1].concat(last);
    }

    return packs;
  }

  /**
   * Tugaskan paket jobdesk ke staff yang bekerja hari itu, berputar tiap hari
   * (offset dayIdx) supaya tidak ada yang pegang jobdesk sama terus.
   *
   * @param {String[]} jobdeskList
   * @param {Number[]} working - userId staff yang masuk, sudah urut roster
   * @param {Number} dayIdx - offset rotasi harian
   * @returns {Map<Number, String[]>} userId -> daftar nama jobdesk
   */
  assignKitchenStations(jobdeskList, working, dayIdx) {
    const assign = new Map();
    const nStaff = working.length;
    working.forEach((uid) => assign.set(uid, []));
    if (!nStaff || !jobdeskList.length) return assign;

    const packs = this.buildKitchenPackages(jobdeskList, nStaff);
    if (!packs.length) return assign;

    const addTo = (uid, names) => {
      names.forEach((name) => {
        if (!assign.get(uid).includes(name)) assign.get(uid).push(name);
      });
    };

    packs.forEach((pack, k) => {
      addTo(working[(dayIdx + k) % nStaff], pack);
    });

    // Staff lebih banyak dari paket → ikut paket paling ringan (Helper/Floating)
    if (nStaff > packs.length) {
      const lightest = packs[packs.length - 1];
      for (let k = packs.length; k < nStaff; k++) {
        addTo(working[(dayIdx + k) % nStaff], lightest);
      }
    }

    return assign;
  }

  /**
   * Distribusi ulang Jobdesk Kitchen untuk tanggal-tanggal yang ditentukan
   * Memastikan SEMUA staff yang MASUK KERJA (isOffDay === false) mendapat jobdesk adil.
   */
  async distributeKitchenJobdesksForDates(dateObjs) {
    if (!Array.isArray(dateObjs) || !dateObjs.length) return;

    try {
      // Ambil roster beserta order_index agar urutan konsisten dengan generateWeek
      const positions = await prisma.position.findMany({
        where: {
          OR: [{ name: 'Kitchen' }, { name: 'Dapur' }],
          isActive: true,
        },
        include: {
          jobdesks: { orderBy: { orderIndex: 'asc' } },
          rosters: { select: { userId: true, orderIndex: true }, orderBy: { orderIndex: 'asc' } },
        },
      });

      if (!positions.length) return;

      for (const position of positions) {
        const jobdeskObjs = position.jobdesks || [];
        if (!jobdeskObjs.length) continue;
        const jobdeskList = jobdeskObjs.map((j) => j.name);

        // Map userId -> order_index roster (untuk sort konsisten)
        const rosterOrder = new Map(position.rosters.map((r) => [r.userId, r.orderIndex]));
        const rosterUserIds = position.rosters.map((r) => r.userId);

        // Antrian tetap Kitchen (queueIndex) — sama seperti yang dipakai generateWeek.
        const stateMap = await this._getOrSeedKitchenStates(position.id, rosterUserIds);

        for (const rawDate of dateObjs) {
          const dateObj = new Date(rawDate);
          if (isNaN(dateObj.getTime())) continue;
          dateObj.setUTCHours(0, 0, 0, 0);

          const userSchedules = await prisma.userSchedule.findMany({
            where: {
              date: dateObj,
              OR: [
                { userId: { in: rosterUserIds } },
                { temporaryDepartment: 'KITCHEN' },
              ],
            },
            select: { id: true, userId: true, isOffDay: true, isManualOverride: true, temporaryDepartment: true },
          });

          // Jangan overwrite manual override
          const manualOverrideIds = new Set(
            userSchedules.filter((s) => s.isManualOverride).map((s) => s.userId)
          );

          const off = userSchedules.filter((s) => s.isOffDay).map((s) => s.userId);
          if (off.length) {
            await prisma.userSchedule.updateMany({
              where: { date: dateObj, userId: { in: off }, isManualOverride: false },
              data: { kitchenStation: null },
            });
          }

          // Staff aktif di kitchen hari ini:
          // - tidak libur
          // - tidak manual override (jobdesk sudah dikunci manual)
          // - temporaryDepartment null (masih di kitchen) ATAU 'KITCHEN' (dipindah ke kitchen)
          // Staff roster kitchen yang temporaryDepartment-nya ke dept lain (BAR, dll) SKIP
          const KITCHEN_DEPTS = new Set(['KITCHEN', 'Dapur', null, undefined]);
          const working = userSchedules
            .filter((s) =>
              !s.isOffDay &&
              !manualOverrideIds.has(s.userId) &&
              KITCHEN_DEPTS.has(s.temporaryDepartment)
            )
            .map((s) => s.userId);

          if (!working.length) continue;

          // Rotasi harian memakai indeks hari sejak epoch — SAMA dengan
          // generateWeek, supaya kedua jalur menghasilkan jobdesk identik
          // untuk tanggal yang sama.
          const assign = this._assignKitchenByQueue(
            jobdeskList,
            working,
            stateMap,
            rosterOrder,
            dayOffsetEpoch(dateObj)
          );

          // Tulis ke DB
          for (const uid of working) {
            const entry = assign.get(uid);
            const jobs = Array.isArray(entry) ? entry : entry?.jobs || [];
            const stationStr = jobs.length ? jobs.join(' + ') : null;
            await prisma.userSchedule.updateMany({
              where: { date: dateObj, userId: uid, isManualOverride: false },
              data: { kitchenStation: stationStr },
            });
          }
        }
      }
    } catch (err) {
      console.error('[rotationService] Gagal redistribusi jobdesk kitchen:', err?.message);
    }
  }

  /**
   * Laporan bulanan jobdesk Kitchen dari KitchenJobdeskLog.
   *
   * Log ditulis SAAT rotasi dijalankan dan TIDAK dihitung ulang saat dibaca,
   * sehingga laporan tetap sah walau formula rotasi berubah di kemudian hari.
   *
   * `rotationVersion` dipisah di laporan:
   *   1 = pra-antrian  (histori lama / hasil rekonstruksi algoritma lama)
   *   2 = antrian tetap (queueIndex)
   *
   * @param {String} month - format YYYY-MM
   * @param {Object} [options]
   * @param {Number} [options.positionId] - batasi ke satu posisi Kitchen
   * @returns {Object} laporan siap kirim
   */
  async getKitchenJobdeskMonthlyReport(month, options = {}) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(month ?? '').trim());
    if (!match) {
      throw new AppError('Format bulan tidak valid. Gunakan YYYY-MM.', 400, 'VALIDATION_ERROR');
    }
    const year = Number(match[1]);
    const mon = Number(match[2]);
    if (mon < 1 || mon > 12) {
      throw new AppError('Bulan harus antara 01 dan 12.', 400, 'VALIDATION_ERROR');
    }

    const KITCHEN_NAMES = ['Kitchen', 'Dapur', 'kitchen', 'dapur'];
    const positions = await prisma.position.findMany({
      where: {
        name: { in: KITCHEN_NAMES },
        ...(options.positionId ? { id: options.positionId } : {}),
      },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
    const positionIds = positions.map((p) => p.id);

    const from = new Date(Date.UTC(year, mon - 1, 1));
    const to = new Date(Date.UTC(year, mon, 0));
    const daysInMonth = to.getUTCDate();
    const monthDates = Array.from({ length: daysInMonth }, (_, i) => addDays(from, i));

    // positionId diminta tetapi tidak ada posisi Kitchen yang cocok → laporan kosong.
    // Catatan: KitchenJobdeskLog TIDAK menyimpan position_id (kuncinya date+userId),
    // jadi bila ada beberapa posisi Kitchen, log-nya tidak bisa dipecah per posisi —
    // `positionId` hanya memvalidasi bahwa posisi yang diminta memang Kitchen.
    if (options.positionId && !positions.length) {
      return {
        month: `${year}-${String(mon).padStart(2, '0')}`,
        range: { from: toISO(from), to: toISO(to), daysInMonth },
        positions: [],
        summary: {
          totalEntries: 0,
          daysInMonth,
          daysWithData: 0,
          daysWithoutData: daysInMonth,
          distinctStaff: 0,
          byVersion: { 1: { entries: 0, staff: 0, daysWithData: 0 }, 2: { entries: 0, staff: 0, daysWithData: 0 } },
        },
        staff: [],
        daily: monthDates.map((d) => ({ date: toISO(d), hasData: false, workingCount: 0, entryCount: 0, entries: [] })),
      };
    }

    const logs = await prisma.kitchenJobdeskLog.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: [{ date: 'asc' }, { userId: 'asc' }],
      include: { user: { select: { id: true, fullName: true, username: true, department: true } } },
    });

    const logsByDate = new Map();
    for (const l of logs) {
      const key = toISO(l.date);
      if (!logsByDate.has(key)) logsByDate.set(key, []);
      logsByDate.get(key).push(l);
    }

    // Roster Kitchen → staff yang tetap muncul di laporan walau 0 hari kerja.
    const rosters = positionIds.length
      ? await prisma.positionRoster.findMany({
          where: { positionId: { in: positionIds } },
          orderBy: { orderIndex: 'asc' },
          include: { user: { select: { id: true, fullName: true, username: true, department: true } } },
        })
      : [];

    const ROLE_KEYS = ['MAIN', 'SUPPORT', 'CHECKER', 'RUNNER', 'HELPER', 'PLATING', 'DISHWASHER'];
    const perUser = new Map();
    const ensureUser = (id, info) => {
      if (!perUser.has(id)) {
        perUser.set(id, {
          userId: id,
          fullName: info?.fullName || `User #${id}`,
          username: info?.username || null,
          department: info?.department || null,
          daysWorked: 0,
          byVersion: { 1: 0, 2: 0 },
          roleCounts: ROLE_KEYS.reduce((acc, r) => ({ ...acc, [r]: 0 }), {}),
          jobdeskCounts: {},
          firstDate: null,
          lastDate: null,
        });
      }
      return perUser.get(id);
    };
    for (const r of rosters) ensureUser(r.userId, r.user);

    const daily = [];
    for (const d of monthDates) {
      const dateISO = toISO(d);
      const dayLogs = logsByDate.get(dateISO) || [];
      const entries = [];
      let workingCount = 0;

      for (const l of dayLogs) {
        const u = ensureUser(l.userId, l.user);
        u.daysWorked += 1;
        u.byVersion[l.rotationVersion] = (u.byVersion[l.rotationVersion] || 0) + 1;
        for (const code of String(l.roleCode || '').split('+').filter(Boolean)) {
          u.roleCounts[code] = (u.roleCounts[code] || 0) + 1;
        }
        for (const name of String(l.packagesAssigned || '').split(' + ').filter(Boolean)) {
          u.jobdeskCounts[name] = (u.jobdeskCounts[name] || 0) + 1;
        }
        if (!u.firstDate || dateISO < u.firstDate) u.firstDate = dateISO;
        if (!u.lastDate || dateISO > u.lastDate) u.lastDate = dateISO;
        workingCount = Math.max(workingCount, l.workingCount || 0);

        entries.push({
          userId: l.userId,
          fullName: u.fullName,
          roleCode: l.roleCode,
          packagesAssigned: l.packagesAssigned,
          rotationVersion: l.rotationVersion,
          workingCount: l.workingCount,
        });
      }

      daily.push({
        date: dateISO,
        hasData: dayLogs.length > 0,
        workingCount,
        entryCount: entries.length,
        entries,
      });
    }

    const staff = [...perUser.values()].sort(
      (a, b) => b.daysWorked - a.daysWorked || String(a.fullName).localeCompare(String(b.fullName)),
    );

    const versionSummary = (version) => {
      const rows = logs.filter((l) => l.rotationVersion === version);
      return {
        entries: rows.length,
        staff: new Set(rows.map((l) => l.userId)).size,
        daysWithData: new Set(rows.map((l) => toISO(l.date))).size,
      };
    };

    const daysWithData = daily.filter((x) => x.hasData).length;

    return {
      month: `${year}-${String(mon).padStart(2, '0')}`,
      range: { from: toISO(from), to: toISO(to), daysInMonth },
      positions,
      summary: {
        totalEntries: logs.length,
        daysInMonth,
        daysWithData,
        daysWithoutData: daysInMonth - daysWithData,
        distinctStaff: perUser.size,
        byVersion: { 1: versionSummary(1), 2: versionSummary(2) },
      },
      staff,
      daily,
    };
  }

  async getSchedule(positionId, weekStart) {
    const position = await this.getPosition(positionId);
    const monday = getMonday(weekStart || new Date());
    const mondayISO = toISO(monday);

    const schedules = await prisma.weeklySchedule.findMany({
      where: { positionId, weekStart: monday },
      orderBy: [{ shiftNumber: 'asc' }, { userId: 'asc' }],
    });

    const weekDates = Array.from({ length: 7 }, (_, d) => addDays(monday, d));

    // Sertakan backup user untuk posisi ini meskipun dia tidak ada di
    // weeklySchedule (mis. dari posisi lain / tidak masuk roster minggu ini),
    // supaya jobdesk yang dia cover tetap bisa ditampilkan di Jadwal Lengkap.
    const backupRowsForPos = await prisma.backupAssignment.findMany({
      where: { date: { in: weekDates }, absentPositionId: positionId },
      select: { date: true, absentUserId: true, backupUserId: true },
    });
    const backupUserIds = [...new Set(backupRowsForPos.map((b) => b.backupUserId).filter(Boolean))];

    const userIds = [...new Set([...schedules.map((s) => s.userId), ...backupUserIds])];
    // Ambil SEMUA user (tanpa filter isActive) agar jadwal lama yang masih
    // mereferensikan user nonaktif tetap menampilkan namanya, bukan "User #id".
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true, username: true, department: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    // Fetch shifts to map shiftId -> shiftNumber
    const allShifts = await prisma.shift.findMany({ select: { id: true, name: true } });
    allShifts.sort((a, b) => a.id - b.id);
    const shiftIdToNumber = new Map();
    allShifts.forEach((sh, idx) => {
      const match = sh.name?.match(/\d+/);
      const num = match ? parseInt(match[0], 10) : (idx + 1);
      shiftIdToNumber.set(sh.id, num);
    });

    // Ambil penugasan jobdesk harian (UserSchedule.kitchenStation) untuk
    // minggu ini agar frontend bisa menampilkan jobdesk tiap staff per hari.
    const userSchedRows = userIds.length > 0
      ? await prisma.userSchedule.findMany({
          where: { userId: { in: userIds }, date: { in: weekDates } },
          select: { userId: true, date: true, kitchenStation: true, isOffDay: true, isManualOverride: true, shiftId: true, temporaryDepartment: true },
        })
      : [];
    // Map: userId -> { dateISO -> jobdeskName }
    const jobdeskMap = new Map();
    const overrideMap = new Map();
    for (const r of userSchedRows) {
      const iso = toISO(r.date);
      if (!jobdeskMap.has(r.userId)) jobdeskMap.set(r.userId, {});
      jobdeskMap.get(r.userId)[iso] = r.kitchenStation || null;

      if (!overrideMap.has(r.userId)) overrideMap.set(r.userId, {});
      overrideMap.get(r.userId)[iso] = {
        shiftId: r.shiftId,
        shiftNumber: r.shiftId ? (shiftIdToNumber.get(r.shiftId) || null) : null,
        isOffDay: r.isOffDay,
        isManualOverride: r.isManualOverride,
        kitchenStation: r.kitchenStation,
        temporaryDepartment: r.temporaryDepartment,
      };
    }

    // Fallback untuk backup user: jika dia tidak punya jobdesk sendiri hari itu
    // (mis. backup dibuat sebelum fitur penempelan jobdesk), pakai jobdesk milik
    // staff yang absen yang dia cover — karena itulah stasiun yang dia kerjakan.
    const backupRows = backupRowsForPos;
    const backupAbsentIds = [...new Set(backupRows.map((b) => b.absentUserId))];
    if (backupAbsentIds.length) {
      const absentSchedRows = await prisma.userSchedule.findMany({
        where: { userId: { in: backupAbsentIds }, date: { in: weekDates } },
        select: { userId: true, date: true, kitchenStation: true },
      });
      const absentJobdesk = new Map(); // `${userId}_${dateISO}` -> jobdeskName
      for (const r of absentSchedRows) {
        absentJobdesk.set(`${r.userId}_${toISO(r.date)}`, r.kitchenStation || null);
      }
      const absentStationsByUser = new Map(); // userId -> [{ iso, station }]
      for (const r of absentSchedRows) {
        if (!r.kitchenStation) continue;
        if (!absentStationsByUser.has(r.userId)) absentStationsByUser.set(r.userId, []);
        absentStationsByUser.get(r.userId).push({ iso: toISO(r.date), station: r.kitchenStation });
      }
      for (const list of absentStationsByUser.values()) {
        list.sort((x, y) => x.iso.localeCompare(y.iso));
      }
      // Infer jobdesk absent user dari hari kerja TERDEKAT di minggu itu —
      // pada hari liburnya kitchenStation null, sama seperti _resolveBackupJobdesk.
      const inferStation = (userId, iso) => {
        const list = absentStationsByUser.get(userId);
        if (!list || !list.length) return null;
        let best = null;
        let bestDiff = Infinity;
        for (const item of list) {
          const diff = Math.abs(new Date(`${item.iso}T00:00:00Z`) - new Date(`${iso}T00:00:00Z`)) / 86400000;
          if (diff < bestDiff) { bestDiff = diff; best = item.station; }
        }
        return best;
      };
      for (const b of backupRows) {
        const iso = toISO(b.date);
        const covered = absentJobdesk.get(`${b.absentUserId}_${iso}`) || inferStation(b.absentUserId, iso);
        if (!covered) continue;
        if (!jobdeskMap.has(b.backupUserId)) jobdeskMap.set(b.backupUserId, {});
        const existing = jobdeskMap.get(b.backupUserId)[iso];
        if (!existing) jobdeskMap.get(b.backupUserId)[iso] = covered;
      }
    }

    // Pastikan backup user (yang mungkin tidak ada di weeklySchedule posisi ini)
    // tetap masuk ke daftar schedules agar frontend menemukan jobdesksByDate-nya
    // untuk merender badge jobdesk pada baris "🔁 Backup".
    const existingUserIds = new Set(schedules.map((s) => s.userId));
    const backupOnlyRows = backupUserIds
      .filter((uid) => !existingUserIds.has(uid))
      .map((uid) => ({ userId: uid, positionId, weekStart: monday, shiftNumber: null, isBackupOnly: true }));
    const allSchedules = [...schedules, ...backupOnlyRows];

    // Ambil swap APPROVED yang melibatkan user di posisi ini pada minggu ini
    const swapRows = userIds.length > 0
      ? await prisma.shiftSwap.findMany({
          where: {
            status: 'APPROVED',
            date: { in: weekDates },
            OR: [
              { requesterId: { in: userIds } },
              { targetUserId: { in: userIds } },
            ],
          },
          include: {
            requester: { select: { id: true, fullName: true } },
            target: { select: { id: true, fullName: true } },
          },
        })
      : [];

    // Build swapsByDate per userId: { 'YYYY-MM-DD': { withUserName } }
    const swapsByDateMap = new Map(); // userId -> { dateISO -> swapInfo }
    for (const swap of swapRows) {
      const dateISO = toISO(swap.date);
      // Requester: tukar dengan target
      if (userIds.includes(swap.requesterId)) {
        if (!swapsByDateMap.has(swap.requesterId)) swapsByDateMap.set(swap.requesterId, {});
        swapsByDateMap.get(swap.requesterId)[dateISO] = {
          withUserId: swap.targetUserId,
          withUserName: swap.target?.fullName || `User #${swap.targetUserId}`,
        };
      }
      // Target: tukar dengan requester
      if (userIds.includes(swap.targetUserId)) {
        if (!swapsByDateMap.has(swap.targetUserId)) swapsByDateMap.set(swap.targetUserId, {});
        swapsByDateMap.get(swap.targetUserId)[dateISO] = {
          withUserId: swap.requesterId,
          withUserName: swap.requester?.fullName || `User #${swap.requesterId}`,
        };
      }
    }

    const enriched = allSchedules.map((s) => {
      const u = userMap.get(s.userId) || null;
      return {
        ...s,
        user: u
          ? { ...u, fullName: u.fullName || u.username || `User ${s.userId}` }
          : { id: s.userId, fullName: `User ${s.userId}`, username: null, department: null },
        // jobdesk per hari: { 'YYYY-MM-DD': 'Main Cook', ... }
        jobdesksByDate: jobdeskMap.get(s.userId) || {},
        // userSchedules detail per hari: { 'YYYY-MM-DD': { shiftId, isOffDay, kitchenStation, temporaryDepartment } }
        userSchedulesByDate: overrideMap.get(s.userId) || {},
        // swap per hari: { 'YYYY-MM-DD': { withUserName, originalShiftNumber, swappedShiftNumber } }
        swapsByDate: swapsByDateMap.get(s.userId) || {},
      };
    });

    return {
      position,
      weekStart: mondayISO,
      schedules: enriched,
    };
  }

  async listSchedules(positionId, startWeekStr, endWeekStr) {
    const start = startWeekStr ? getMonday(startWeekStr) : getMonday(addDays(new Date(), -28));
    const end = endWeekStr ? getMonday(endWeekStr) : getMonday(addDays(new Date(), 42));

    const schedules = await prisma.weeklySchedule.findMany({
      where: {
        positionId,
        weekStart: { gte: start, lte: end },
      },
      orderBy: [{ weekStart: 'asc' }, { shiftNumber: 'asc' }, { userId: 'asc' }],
    });

    const userIds = [...new Set(schedules.map((s) => s.userId))];
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true, username: true, department: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return schedules.map((s) => {
      const u = userMap.get(s.userId) || null;
      return {
        ...s,
        user: u
          ? { ...u, fullName: u.fullName || u.username || `User ${s.userId}` }
          : { id: s.userId, fullName: `User ${s.userId}`, username: null, department: null },
        weekStart: toISO(s.weekStart),
      };
    });
  }

  /**
   * Build a per-date schedule for a single employee over a date range.
   * Uses the new rotation scheme (weeklySchedule.shiftNumber) instead of the
   * legacy UserSchedule.shiftId. Off-day is the union of: Leave (APPROVED),
   * OffDayRequest (APPROVED offDate), User.offDay (weekly), PublicHoliday,
   * and ManualOffDay.
   * Returns [{ date, shiftNumber, positionName, isOffDay }] sorted by date.
   */
  async getMySchedule(userId, fromStr, toStr) {
    const from = new Date(`${fromStr}T00:00:00Z`);
    const to = new Date(`${toStr}T00:00:00Z`);

    // Build the list of dates in range
    const dates = [];
    const cursor = new Date(from);
    while (cursor <= to) {
      dates.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    const dateISOs = dates.map((d) => toISO(d));

    // Weekly schedules covering the range (weekStart .. weekStart+7)
    // Lower bound: weekStart >= from - 6 days, so a week starting just before
    // `from` that still covers days within the range is not excluded.
    const rangeStart = addDays(from, -6);
    const schedules = await prisma.weeklySchedule.findMany({
      where: {
        userId,
        weekStart: { gte: rangeStart, lte: to },
      },
      include: { position: { select: { id: true, name: true } } },
    });

    // Map date -> schedule entry
    const scheduleByDate = new Map();
    for (const s of schedules) {
      const ws = new Date(s.weekStart);
      for (let i = 0; i < 7; i++) {
        const day = new Date(ws);
        day.setUTCDate(day.getUTCDate() + i);
        const iso = toISO(day);
        if (iso >= fromStr && iso <= toStr) {
          scheduleByDate.set(iso, s);
        }
      }
    }

    // Off-day sources
    const offSet = new Set();
    const mark = (iso) => offSet.add(iso);

    // 1. Leave APPROVED
    const leaves = await prisma.leave.findMany({
      where: { userId, status: 'APPROVED', startDate: { lte: to }, endDate: { gte: from } },
      select: { startDate: true, endDate: true },
    });
    for (const l of leaves) {
      for (const d of dates) {
        const iso = toISO(d);
        if (iso >= toISO(l.startDate) && iso <= toISO(l.endDate)) mark(iso);
      }
    }

    // 2. OffDayRequest APPROVED — swap-aware:
    //    - Swap (targetUserId ada): pemohon LIBUR di workDate (dia ambil libur
    //      target), target LIBUR di offDate (dia ambil libur pemohon).
    //    - Legacy (targetUserId null): pemohon libur di offDate biasa.
    const offRequests = await prisma.offDayRequest.findMany({
      where: {
        status: 'APPROVED',
        OR: [
          { userId, offDate: { gte: from, lte: to } },
          { userId, workDate: { gte: from, lte: to } },
          { targetUserId: userId, offDate: { gte: from, lte: to } },
        ],
      },
      select: { userId: true, targetUserId: true, offDate: true, workDate: true },
    });
    for (const r of offRequests) {
      const offISO = toISO(r.offDate);
      const workISO = toISO(r.workDate);
      if (r.targetUserId == null) {
        // Legacy: permintaan libur biasa tanpa swap
        if (dateISOs.includes(offISO)) mark(offISO);
        continue;
      }
      // Swap: pemohon libur di workDate, target libur di offDate
      if (r.userId === userId && dateISOs.includes(workISO)) mark(workISO);
      if (r.targetUserId === userId && dateISOs.includes(offISO)) mark(offISO);
    }

    // 3. User.offDay (recurring weekly day-off index 0=Sun..6=Sat)
    // offDay=0 (Sunday) is now valid — Sunday can be a day off.
    // We only skip users whose offDay is null/undefined (not explicitly set).
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { offDay: true },
    });
    for (const d of dates) {
      const dow = d.getUTCDay();
      // Mark off if offDay is explicitly set (0-6) and matches this day
      if (user && user.offDay !== null && user.offDay !== undefined && user.offDay === dow) {
        mark(toISO(d));
      }
    }

    // 4. PublicHoliday
    const holidays = await prisma.publicHoliday.findMany({
      where: { date: { gte: from, lte: to } },
      select: { date: true },
    });
    for (const h of holidays) mark(toISO(h.date));

    // 5. ManualOffDay
    const manualOffDays = await prisma.manualOffDay.findMany({
      where: { userId, date: { gte: from, lte: to } },
      select: { date: true },
    });
    for (const m of manualOffDays) mark(toISO(m.date));

    // 6. Backup assignments — if this user is acting as backup on a date,
    //    override the displayed position with the backup position.
    const backupAssignments = await prisma.backupAssignment.findMany({
      where: {
        backupUserId: userId,
        date: { gte: from, lte: to },
      },
      select: { date: true, absentPositionId: true, shiftNumber: true },
    });

    // Resolve position names for backup assignments
    const backupPositionIds = [...new Set(backupAssignments.map(b => b.absentPositionId))];
    const backupPositions = backupPositionIds.length > 0
      ? await prisma.position.findMany({
          where: { id: { in: backupPositionIds } },
          select: { id: true, name: true },
        })
      : [];
    const backupPosMap = new Map(backupPositions.map(p => [p.id, p.name]));

    // Map date ISO -> backup position info
    const backupByDate = new Map();
    for (const b of backupAssignments) {
      backupByDate.set(toISO(b.date), {
        positionName: backupPosMap.get(b.absentPositionId) || null,
        positionId: b.absentPositionId,
        // Shift yang dibackup = shift masuk backup user hari itu
        shiftNumber: b.shiftNumber || 1,
        fallbackJobdesk: null,
      });
    }

    // Fallback jobdesk untuk backup user: jika UserSchedule tidak punya
    // kitchenStation di tanggal tersebut, ambil jobdesk yang sedang di-cover
    // di posisi backup hari itu (via getSchedule), agar hari backup tidak
    // tampak seperti kosong/tidak ada jadwal.
    const backupFallbackDates = [...backupByDate.keys()];
    if (backupFallbackDates.length > 0) {
      try {
        const fallbackResults = await Promise.all(
          backupFallbackDates.map(async (iso) => {
            const info = backupByDate.get(iso);
            if (!info.positionId) return null;
            const full = await this.getSchedule(info.positionId, iso);
            if (!full || !Array.isArray(full.schedules)) return null;
            const covered = full.schedules
              .map((s) => (s.jobdesksByDate && s.jobdesksByDate[iso]) || null)
              .filter(Boolean);
            return covered.length ? { iso, covered: covered.join(' + ') } : null;
          })
        );
        for (const r of fallbackResults) {
          if (r) backupByDate.get(r.iso).fallbackJobdesk = r.covered;
        }
      } catch (err) {
        console.warn('[rotation] Gagal mengambil fallback jobdesk backup:', err?.message);
      }
    }

    // Daily jobdesk (UserSchedule.kitchenStation) for this user in range
    // Also include shiftId to detect swap overrides
    const jobdeskRows = await prisma.userSchedule.findMany({
      where: { userId, date: { gte: from, lte: to } },
      select: { date: true, kitchenStation: true, shiftId: true, isOffDay: true, isManualOverride: true, temporaryDepartment: true },
    });
    const jobdeskByDate = new Map(jobdeskRows.map(r => [toISO(r.date), r.kitchenStation || null]));
    // Map date -> actual shiftId from UserSchedule (reflects swap overrides)
    const userSchedShiftByDate = new Map(jobdeskRows.map(r => [toISO(r.date), { shiftId: r.shiftId, isOffDay: r.isOffDay, isManualOverride: r.isManualOverride, temporaryDepartment: r.temporaryDepartment || null }]));

    // Jika UserSchedule.isManualOverride=true dan isOffDay=false (mis. KOMPENSASI SAKIT),
    // paksa hapus dari offSet agar hari tersebut tidak dianggap libur meskipun
    // ManualOffDay atau sumber libur lain masih ada di DB.
    for (const [iso, us] of userSchedShiftByDate) {
      if (us.isManualOverride && !us.isOffDay) {
        offSet.delete(iso);
      }
    }

    // Ambil semua shift dari DB untuk mapping shiftId -> shiftNumber (1=Pagi, 2=Siang)
    const allShifts = await prisma.shift.findMany({ select: { id: true, name: true } });
    // Shift 1 = shift dengan startTime paling awal, atau nama mengandung "1"/"Pagi"
    // Sort by id ascending: shift id 1 = Pagi (shift 1), id 2 = Siang (shift 2)
    allShifts.sort((a, b) => a.id - b.id);
    const shiftIdToNumber = new Map();
    allShifts.forEach((sh, idx) => {
      const match = sh.name?.match(/\d+/);
      const num = match ? parseInt(match[0], 10) : (idx + 1);
      shiftIdToNumber.set(sh.id, num);
    });

    // 7. ShiftSwap APPROVED yang melibatkan user ini dalam rentang tanggal
    const swapRows = await prisma.shiftSwap.findMany({
      where: {
        status: 'APPROVED',
        date: { gte: from, lte: to },
        OR: [{ requesterId: userId }, { targetUserId: userId }],
      },
      include: {
        requester: { select: { id: true, fullName: true } },
        target: { select: { id: true, fullName: true } },
      },
    });

    // Build swapByDate: dateISO -> { withUserName }
    // shiftNumber diambil dari UserSchedule yang sudah diupdate saat approve
    const swapByDate = new Map();
    for (const swap of swapRows) {
      const iso = toISO(swap.date);
      const withUserName = swap.requesterId === userId
        ? (swap.target?.fullName || `User #${swap.targetUserId}`)
        : (swap.requester?.fullName || `User #${swap.requesterId}`);
      swapByDate.set(iso, { withUserName });
    }

    // Build final list
    return dateISOs.map((iso) => {
      const s = scheduleByDate.get(iso);
      const backup = backupByDate.get(iso);
      const swapInfo = swapByDate.get(iso) || null;
      const originalPositionName = s && s.position ? s.position.name : null;
      const userSched = userSchedShiftByDate.get(iso) || null;

      // Shift aktual: userSched.shiftId (override tukar shift) →
      // weeklySchedule.shiftNumber → backup.shiftNumber. Backup diletakkan
      // TERAKHIR agar jadwal di sisi user MENGIKUTI jadwal backup yang
      // tertampil di halaman Jadwal Lengkap admin (posisi + shift yang
      // dicover), bukan shift lama di UserSchedule.
      let effectiveShift = s ? s.shiftNumber : null;
      if (userSched && userSched.shiftId) {
        const fromUserSched = shiftIdToNumber.get(userSched.shiftId) || null;
        if (fromUserSched) effectiveShift = fromUserSched;
      }
      if (backup) effectiveShift = backup.shiftNumber;

      return {
        date: iso,
        shiftNumber: effectiveShift,
        positionName: backup ? backup.positionName : originalPositionName,
        positionId: backup ? backup.positionId : (s ? s.positionId : null),
        jobdesk: jobdeskByDate.get(iso) || (backup ? (backup.fallbackJobdesk || null) : null),
        temporaryDepartment: userSched ? userSched.temporaryDepartment : null,
        // UserSchedule is source of truth — already reflects swap/override/regen.
        // offSet (ManualOffDay, Leave, OffDayRequest, PublicHoliday, User.offDay)
        // only used as fallback when no UserSchedule row exists.
        isOffDay: (userSched
          ? userSched.isOffDay
          : (offSet.has(iso))) && !backup,
        isBackup: !!backup,
        originalPositionName: backup ? originalPositionName : null,
        // Original roster shift, kept for display so staff sees the change
        originalShiftNumber: backup && s ? s.shiftNumber : null,
        // Swap info: null jika tidak ada swap APPROVED di tanggal ini
        swap: swapInfo,
      };
    });
  }

  /**
   * Gather all "off-day" sources for a position's roster over a set of dates.
   * Returns a Map<userId, Set<dateISO>> where the user is considered OFF.
   * Sources: Leave (APPROVED), OffDayRequest (APPROVED offDate), User.offDay (weekly),
   * and PublicHoliday (date).
   */
  async getOffDayUserIds(positionId, dates) {
    const roster = await prisma.positionRoster.findMany({
      where: { positionId },
      select: { userId: true },
    });
    const rosterUserIds = roster.map((r) => r.userId);
    if (rosterUserIds.length === 0 || dates.length === 0) return new Map();

    const dateISOs = dates.map((d) => toISO(d));
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];

    const offMap = new Map();
    const mark = (userId, dateISO) => {
      if (!offMap.has(userId)) offMap.set(userId, new Set());
      offMap.get(userId).add(dateISO);
    };

    // 1. Leave (cuti/sakit) APPROVED overlapping date range
    const leaves = await prisma.leave.findMany({
      where: {
        userId: { in: rosterUserIds },
        status: 'APPROVED',
        startDate: { lte: maxDate },
        endDate: { gte: minDate },
      },
      select: { userId: true, startDate: true, endDate: true },
    });
    for (const l of leaves) {
      for (const d of dates) {
        const iso = toISO(d);
        const start = toISO(l.startDate);
        const end = toISO(l.endDate);
        if (iso >= start && iso <= end) mark(l.userId, iso);
      }
    }

    // 2. OffDayRequest APPROVED — swap-aware:
    //    - Swap (targetUserId ada): pemohon LIBUR di workDate (dia ambil libur
    //      target), target LIBUR di offDate (dia ambil libur pemohon).
    //    - Legacy (targetUserId null): pemohon libur di offDate biasa.
    const offRequests = await prisma.offDayRequest.findMany({
      where: {
        status: 'APPROVED',
        AND: [
          {
            OR: [
              { userId: { in: rosterUserIds } },
              { targetUserId: { in: rosterUserIds } },
            ],
          },
          {
            OR: [
              { offDate: { in: dates } },
              { workDate: { in: dates } },
            ],
          },
        ],
      },
      select: { userId: true, targetUserId: true, offDate: true, workDate: true },
    });
    for (const r of offRequests) {
      const offISO = toISO(r.offDate);
      const workISO = toISO(r.workDate);
      if (r.targetUserId == null) {
        // Legacy: permintaan libur biasa tanpa swap
        if (dateISOs.includes(offISO)) mark(r.userId, offISO);
        continue;
      }
      // Swap: pemohon libur di workDate, target libur di offDate
      if (rosterUserIds.includes(r.userId) && dateISOs.includes(workISO)) {
        mark(r.userId, workISO);
      }
      if (r.targetUserId && rosterUserIds.includes(r.targetUserId) && dateISOs.includes(offISO)) {
        mark(r.targetUserId, offISO);
      }
    }

    // 3. User.offDay (recurring weekly day-off index: 0=Sun..6=Sat)
    // NOTE: offDay=0 (Sunday) is now valid — Sunday can be assigned as a day off.
    // We only skip users whose offDay is null/undefined (DB default not explicitly set).
    const users = await prisma.user.findMany({
      where: { id: { in: rosterUserIds } },
      select: { id: true, offDay: true },
    });
    const userOffDayMap = new Map(users.map((u) => [u.id, u.offDay]));
    for (const d of dates) {
      const dow = d.getUTCDay();
      for (const uid of rosterUserIds) {
        const userOffDay = userOffDayMap.get(uid);
        // Mark off only if offDay is explicitly set to a valid work day (1-6 = Mon-Sat).
        // Sunday (0) is a normal work day per business rules, and legacy rows use 0 as
        // "unset", so 0 must never be treated as an off day here.
        if (userOffDay !== null && userOffDay !== undefined && userOffDay >= 1 && userOffDay <= 6 && userOffDay === dow) {
          mark(uid, toISO(d));
        }
      }
    }

    // 4. PublicHoliday — everyone off on holiday dates
    const holidays = await prisma.publicHoliday.findMany({
      where: { date: { in: dates } },
      select: { date: true },
    });
    const holidayDates = new Set(holidays.map((h) => toISO(h.date)));
    for (const uid of rosterUserIds) {
      for (const iso of holidayDates) mark(uid, iso);
    }

    // 5. ManualOffDay — admin-assigned off days (THIS IS THE KEY MISSING SOURCE)
    const manualOffDays = await prisma.manualOffDay.findMany({
      where: {
        userId: { in: rosterUserIds },
        date: { gte: minDate, lte: maxDate },
      },
      select: { userId: true, date: true },
    });
    for (const m of manualOffDays) {
      const iso = toISO(m.date);
      if (dateISOs.includes(iso)) mark(m.userId, iso);
    }

    // 6. UserSchedule overrides (manual cell edits take highest priority)
    const scheduleOverrides = await prisma.userSchedule.findMany({
      where: {
        userId: { in: rosterUserIds },
        date: { gte: minDate, lte: maxDate },
      },
      select: { userId: true, date: true, isOffDay: true, isManualOverride: true },
    });
    for (const s of scheduleOverrides) {
      const iso = toISO(s.date);
      if (!dateISOs.includes(iso)) continue;
      if (s.isOffDay) {
        mark(s.userId, iso);
      } else if (s.isManualOverride) {
        offMap.get(s.userId)?.delete(iso);
      }
    }

    return offMap;
  }

  /**
   * Ambil union SEMUA sumber libur (Leave, OffDayRequest, User.offDay,
   * PublicHoliday, ManualOffDay) untuk SEMUA user yang ada di roster posisi
   * manapun, pada rentang tanggal tertentu. Dipakai oleh Jadwal Lengkap agar
   * tampilan konsisten dengan logika generate.
   * Returns: [{ userId, date: 'YYYY-MM-DD' }]
   */
  async getAllOffDayEntries(fromDate, toDate) {
    // Kumpulkan semua userId yang pernah ada di roster posisi manapun
    const rosterEntries = await prisma.positionRoster.findMany({
      select: { userId: true },
      distinct: ['userId'],
    });
    const userIds = rosterEntries.map((r) => r.userId);
    if (userIds.length === 0) return [];

    // Bangun daftar tanggal dalam rentang
    const dates = [];
    const cursor = new Date(fromDate);
    while (cursor <= toDate) {
      dates.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    if (dates.length === 0) return [];

    const dateISOs = dates.map((d) => toISO(d));
    const offSet = new Set(); // `${userId}_${dateISO}`
    const mark = (userId, dateISO) => offSet.add(`${userId}_${dateISO}`);

    // 1. Leave (cuti/sakit) APPROVED
    const leaves = await prisma.leave.findMany({
      where: { userId: { in: userIds }, status: 'APPROVED', startDate: { lte: toDate }, endDate: { gte: fromDate } },
      select: { userId: true, startDate: true, endDate: true },
    });
    for (const l of leaves) {
      const start = toISO(l.startDate), end = toISO(l.endDate);
      for (const iso of dateISOs) if (iso >= start && iso <= end) mark(l.userId, iso);
    }

    // 2. OffDayRequest APPROVED — libur pada offDate
    const offRequests = await prisma.offDayRequest.findMany({
      where: { userId: { in: userIds }, status: 'APPROVED', offDate: { gte: fromDate, lte: toDate } },
      select: { userId: true, offDate: true },
    });
    for (const r of offRequests) mark(r.userId, toISO(r.offDate));

    // 3. User.offDay (hari libur mingguan)
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, offDay: true } });
    const userOffDayMap = new Map(users.map((u) => [u.id, u.offDay]));
    for (const d of dates) {
      const dow = d.getUTCDay();
      for (const uid of userIds) {
        const userOffDay = userOffDayMap.get(uid);
        if (userOffDay === dow) mark(uid, toISO(d));
      }
    }

    // 4. PublicHoliday — semua orang libur
    const holidays = await prisma.publicHoliday.findMany({ where: { date: { gte: fromDate, lte: toDate } }, select: { date: true } });
    const holidayDates = new Set(holidays.map((h) => toISO(h.date)));
    for (const uid of userIds) for (const iso of holidayDates) mark(uid, iso);

    // 5. ManualOffDay
    const manualOffDays = await prisma.manualOffDay.findMany({
      where: { userId: { in: userIds }, date: { gte: fromDate, lte: toDate } },
      select: { userId: true, date: true },
    });
    for (const m of manualOffDays) mark(m.userId, toISO(m.date));

    // 6. UserSchedule overrides (manual cell edits take highest priority)
    const scheduleOverrides = await prisma.userSchedule.findMany({
      where: { userId: { in: userIds }, date: { gte: fromDate, lte: toDate } },
      select: { userId: true, date: true, isOffDay: true, isManualOverride: true },
    });
    for (const s of scheduleOverrides) {
      const iso = toISO(s.date);
      if (s.isOffDay) {
        mark(s.userId, iso);
      } else if (s.isManualOverride) {
        offSet.delete(`${s.userId}_${iso}`);
      }
    }

    return [...offSet].map((key) => {
      const [userId, date] = key.split('_');
      return { userId: parseInt(userId), date };
    });
  }

  /**
   * Generate a full month's schedule by looping the weekly generator for each
   * Monday in the month, continuing the rotation state from the previous week.
   * Afterwards, detect understaffed day/shift caused by off-day sources and
   * flag them (no auto-redistribution).
   */
  async generateMonth(positionId, monthISO) {
    // monthISO: 'YYYY-MM'
    const match = /^(\d{4})-(\d{2})$/.exec(monthISO);
    if (!match) throw new AppError('Format bulan harus YYYY-MM', 400, 'VALIDATION_ERROR');

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;

    // Collect all Mondays whose week OVERLAPS with this month.
    // Start from the Monday of the week containing the 1st of the month,
    // and include all Mondays until the week that contains the last day of the month.
    const mondays = [];
    const firstDayOfMonth = new Date(Date.UTC(year, month, 1));
    const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)); // last day
    let cursor = getMonday(firstDayOfMonth); // Monday of the week containing day 1
    while (cursor <= lastDayOfMonth) {
      mondays.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }

    const position = await this.getPosition(positionId);
    // Penuhi-perbandingkan dengan pembagian yang BENAR-BENAR ditulis generateWeek
    // (posisi fleksibel memakai jumlah roster, bukan kolom kapasitas).
    const { s1Count: shift1Capacity, s2Count: shift2Capacity } = this._shiftSplit(
      position,
      position.rosters.length,
    );

    const generatedWeeks = [];
    const understaffed = [];

    for (const monday of mondays) {
      await this.generateWeek(positionId, monday, { skipGetSchedule: true });

      // Off-day check for this week's 7 days
      const weekDates = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setUTCDate(d.getUTCDate() + i);
        weekDates.push(d);
      }
      const offMap = await this.getOffDayUserIds(positionId, weekDates);

      // Load generated weekly schedules to detect understaffing
      const schedules = await prisma.weeklySchedule.findMany({
        where: { positionId, weekStart: monday },
        orderBy: [{ shiftNumber: 'asc' }, { userId: 'asc' }],
      });

      for (const date of weekDates) {
        const iso = toISO(date);
        // Only flag understaffing for dates actually within the requested month
        if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month) continue;
        const offUserIds = new Set();
        for (const [uid, set] of offMap.entries()) {
          if (set.has(iso)) offUserIds.add(uid);
        }

        const shift1Users = schedules.filter((s) => s.shiftNumber === 1).map((s) => s.userId);
        const shift2Users = schedules.filter((s) => s.shiftNumber === 2).map((s) => s.userId);

        // Remove off users from each shift, count remaining
        const shift1Active = shift1Users.filter((u) => !offUserIds.has(u));
        const shift2Active = shift2Users.filter((u) => !offUserIds.has(u));

        if (shift1Active.length < shift1Capacity) {
          understaffed.push({
            date: iso,
            shiftNumber: 1,
            needed: shift1Capacity,
            available: shift1Active.length,
            missing: shift1Capacity - shift1Active.length,
            offUsers: shift1Users.filter((u) => offUserIds.has(u)),
          });
        }
        if (shift2Active.length < shift2Capacity) {
          understaffed.push({
            date: iso,
            shiftNumber: 2,
            needed: shift2Capacity,
            available: shift2Active.length,
            missing: shift2Capacity - shift2Active.length,
            offUsers: shift2Users.filter((u) => offUserIds.has(u)),
          });
        }
      }

      generatedWeeks.push(toISO(monday));
    }

    return {
      month: monthISO,
      generatedWeeks,
      understaffed,
    };
  }

  /**
   * Get the full monthly schedule for a position, flattened per date.
   * Reads WeeklySchedule (per week) and expands to Mon–Sat days,
   * then overlays any per-date manual overrides stored in UserSchedule.
   * Returns [{ date, userId, shiftNumber, isOffDay, isManualOverride, user }]
   * sorted by date then shift.
   */
  async getMonthSchedule(positionId, monthISO) {
    const match = /^(\d{4})-(\d{2})$/.exec(monthISO);
    if (!match) throw new AppError('Format bulan harus YYYY-MM', 400, 'VALIDATION_ERROR');
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;

    const mondays = [];
    const firstDayOfMonth = new Date(Date.UTC(year, month, 1));
    const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0));
    let cursor = getMonday(firstDayOfMonth);
    while (cursor <= lastDayOfMonth) {
      mondays.push(new Date(cursor));
      cursor = addDays(cursor, 7);
    }

    const startWeek = mondays[0];
    const endWeek = mondays[mondays.length - 1];
    const position = await prisma.position.findUnique({
      where: { id: positionId },
      include: { rosters: true },
    });
    if (!position) throw new AppError('Posisi tidak ditemukan', 404, 'NOT_FOUND');

    const weekly = await prisma.weeklySchedule.findMany({
      where: {
        positionId,
        weekStart: { gte: startWeek, lte: endWeek },
      },
    });

    const rosterUserIds = position.rosters.map((r) => r.userId);
    const users = rosterUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: rosterUserIds } },
          select: { id: true, fullName: true, username: true, department: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const overrides = await prisma.userSchedule.findMany({
      where: {
        userId: { in: rosterUserIds },
        isManualOverride: true,
        date: { gte: firstDayOfMonth, lte: lastDayOfMonth },
      },
    });
    const overrideByUserDate = new Map(
      overrides.map((o) => [`${o.userId}|${toISO(o.date)}`, o]),
    );

    const result = [];
    for (const monday of mondays) {
      for (let i = 0; i < 7; i++) {
        const day = addDays(monday, i);
        const dateISO = toISO(day);
        if (day.getUTCMonth() !== month) continue;

        const weekMap = new Map();
        for (const w of weekly) {
          if (toISO(w.weekStart) === toISO(monday)) {
            weekMap.set(w.userId, w.shiftNumber);
          }
        }

        for (const userId of rosterUserIds) {
          const override = overrideByUserDate.get(`${userId}|${dateISO}`);
          let shiftNumber = null;
          let isOffDay = false;
          let isManualOverride = false;

          if (override) {
            isManualOverride = true;
            if (override.isOffDay) {
              isOffDay = true;
              shiftNumber = null;
            } else if (override.shiftId) {
              shiftNumber = override.shiftId === 1 ? 1 : 2;
              isOffDay = false;
            }
          } else if (weekMap.has(userId)) {
            shiftNumber = weekMap.get(userId);
            isOffDay = false;
          }

          result.push({
            date: dateISO,
            userId,
            shiftNumber,
            isOffDay,
            isManualOverride,
            user: userMap.get(userId) || null,
          });
        }
      }
    }

    result.sort((a, b) =>
      a.date === b.date
        ? (a.shiftNumber || 0) - (b.shiftNumber || 0)
        : a.date.localeCompare(b.date),
    );
    return result;
  }

  /**
   * Override (or assign) a single user's shift on a specific date.
   * shiftNumber: 1 or 2; or null/0 for OFF.
   */
  async setScheduleAssignment(positionId, { date, userId, shiftNumber }) {
    const position = await prisma.position.findUnique({
      where: { id: positionId },
      include: { rosters: true },
    });
    if (!position) throw new AppError('Posisi tidak ditemukan', 404, 'NOT_FOUND');
    if (!position.rosters.some((r) => r.userId === userId)) {
      throw new AppError('User tidak ada di roster posisi ini', 400, 'VALIDATION_ERROR');
    }

    const dateObj = toDateOnly(date);
    const dateISO = toISO(dateObj);

    const isOff = !shiftNumber || shiftNumber === 0;
    const shiftId = isOff ? null : shiftNumber;

    // Nama posisi di DB adalah "Dapur" (bukan "Kitchen") — pakai daftar yang sama
    // dengan generateWeek, kalau tidak staff Dapur akan ditandai temporaryDepartment
    // 'BAR' dan dilewati oleh distribusi jobdesk kitchen.
    const KITCHEN_NAMES = new Set(['Kitchen', 'Dapur', 'kitchen', 'dapur']);
    const department = KITCHEN_NAMES.has(position.name) ? 'KITCHEN' : 'BAR';

    await prisma.userSchedule.upsert({
      where: { userId_date: { userId, date: dateObj } },
      update: {
        shiftId,
        isOffDay: isOff,
        isManualOverride: true,
        temporaryDepartment: department,
      },
      create: {
        userId,
        date: dateObj,
        shiftId,
        isOffDay: isOff,
        isManualOverride: true,
        temporaryDepartment: department,
      },
    });

    return { date: dateISO, userId, shiftNumber: isOff ? null : shiftNumber, isOffDay: isOff };
  }

  /**
   * Remove a manual override for a user on a specific date.
   */
  async removeScheduleAssignment(positionId, { date, userId }) {
    const dateObj = toDateOnly(date);
    const existing = await prisma.userSchedule.findUnique({
      where: { userId_date: { userId, date: dateObj } },
    });
    if (existing && existing.isManualOverride) {
      await prisma.userSchedule.delete({
        where: { userId_date: { userId, date: dateObj } },
      });
    }
    return { date: toISO(dateObj), userId, removed: !!existing?.isManualOverride };
  }

  /**
   * Sinkronkan UserSchedule setelah admin mengubah ManualOffDay.
   * Panel libur hanya menulis ManualOffDay; tanpa sinkronisasi ini baris
   * UserSchedule lama (isOffDay=true) tetap tercoret di jadwal dan memicu
   * backup yang tidak perlu. Method ini hitung ulang status libur dari semua
   * sumber lalu selaraskan UserSchedule + batalkan backup usang.
   * @param {Array<{userId:number|string, date:Date|string}>} pairs
   */
  async syncSchedulesForUserDates(pairs) {
    if (!Array.isArray(pairs) || pairs.length === 0) return 0;

    const shifts = await prisma.shift.findMany({ select: { id: true, name: true } });
    shifts.sort((a, b) => a.id - b.id);
    const shiftIdByNumber = new Map(shifts.map((sh, idx) => [idx + 1, sh.id]));

    let synced = 0;
    for (const p of pairs) {
      try {
        const uid = parseInt(p.userId);
        if (!uid || !p.date) continue;
        const dateObj = p.date instanceof Date
          ? new Date(Date.UTC(p.date.getUTCFullYear(), p.date.getUTCMonth(), p.date.getUTCDate()))
          : new Date(`${String(p.date).slice(0, 10)}T00:00:00Z`);
        const iso = toISO(dateObj);

        // ---- Union status libur dari semua sumber (tanpa UserSchedule) ----
        let isOff = false;

        // 1) Leave APPROVED
        const leave = await prisma.leave.findFirst({
          where: { userId: uid, status: 'APPROVED', startDate: { lte: dateObj }, endDate: { gte: dateObj } },
          select: { id: true },
        });
        if (leave) isOff = true;

        // 2) OffDayRequest APPROVED (swap-aware)
        if (!isOff) {
          const reqs = await prisma.offDayRequest.findMany({
            where: {
              status: 'APPROVED',
              OR: [
                { userId: uid, offDate: dateObj },
                { userId: uid, workDate: dateObj },
                { targetUserId: uid, offDate: dateObj },
              ],
            },
            select: { userId: true, targetUserId: true, offDate: true, workDate: true },
          });
          for (const r of reqs) {
            if (r.targetUserId == null) {
              if (toISO(r.offDate) === iso) { isOff = true; break; }
              continue;
            }
            if (r.userId === uid && toISO(r.workDate) === iso) { isOff = true; break; }
            if (r.targetUserId === uid && toISO(r.offDate) === iso) { isOff = true; break; }
          }
        }

        // 3) User.offDay mingguan (1-6 valid; 0 = tidak diset, hari kerja)
        if (!isOff) {
          const u = await prisma.user.findUnique({ where: { id: uid }, select: { offDay: true } });
          const off = u?.offDay;
          if (off !== null && off !== undefined && off >= 1 && off <= 6 && off === dateObj.getUTCDay()) isOff = true;
        }

        // 4) PublicHoliday
        if (!isOff) {
          const h = await prisma.publicHoliday.findUnique({ where: { date: dateObj } });
          if (h) isOff = true;
        }

        // 5) ManualOffDay (sumber yang baru saja diubah admin)
        if (!isOff) {
          const m = await prisma.manualOffDay.findUnique({
            where: { userId_date: { userId: uid, date: dateObj } },
          });
          if (m) isOff = true;
        }

        const existing = await prisma.userSchedule.findUnique({
          where: { userId_date: { userId: uid, date: dateObj } },
        });

        if (isOff) {
          // Tandai libur + bersihkan shift & jobdesk
          await prisma.userSchedule.upsert({
            where: { userId_date: { userId: uid, date: dateObj } },
            update: { isOffDay: true, shiftId: null, kitchenStation: null, isManualOverride: true },
            create: { userId: uid, date: dateObj, isOffDay: true, isManualOverride: true },
          });
        } else {
          // Tidak libur lagi: selaraskan ke jadwal kerja.
          // Pertahankan isManualOverride jika record sudah di-set manual
          // (mis. kompensasi sakit) agar override tidak tertimpa balik ke false.
          const keepOverride = existing?.isManualOverride === true;
          const data = { isOffDay: false, isManualOverride: keepOverride };
          let station = existing?.kitchenStation || null;
          if (!station && (!existing || existing.isOffDay)) {
            station = await this._inferNearestStation(uid, dateObj);
          }
          if (station) data.kitchenStation = station;
          if (!existing || !existing.shiftId || existing.isOffDay) {
            const ws = await prisma.weeklySchedule.findFirst({
              where: { userId: uid, weekStart: getMonday(dateObj) },
              select: { shiftNumber: true },
            });
            if (ws && shiftIdByNumber.has(ws.shiftNumber)) data.shiftId = shiftIdByNumber.get(ws.shiftNumber);
          }
          await prisma.userSchedule.upsert({
            where: { userId_date: { userId: uid, date: dateObj } },
            update: data,
            create: { userId: uid, date: dateObj, ...data },
          });

          // Batalkan backup usang bila libur user dicabut
          await this._cancelStaleBackup(uid, dateObj);
        }
        synced += 1;
      } catch (err) {
        console.warn(`[rotation] Gagal sinkron UserSchedule ${p.userId} @ ${p.date}:`, err?.message);
      }
    }
    return synced;
  }

  /**
   * Batalkan BackupAssignment yang sudah tidak relevan karena libur
   * absentUser dicabut: kembalikan jadwal backupUser ke normal.
   */
  async _cancelStaleBackup(absentUserId, dateObj) {
    const ba = await prisma.backupAssignment.findUnique({
      where: { date_absentUserId: { date: dateObj, absentUserId } },
    });
    if (!ba) return;

    try {
      // Kembalikan baris UserSchedule backup user: bersihkan isOffDay override
      // yang dipasang saat backup diset (_removeFromKitchenSchedule).
      await prisma.userSchedule.updateMany({
        where: { userId: ba.backupUserId, date: dateObj, isManualOverride: true },
        data: { isOffDay: false, isManualOverride: false, kitchenStation: null },
      });

      // Pastikan WeeklySchedule backup user minggu itu masih ada (dicabut saat
      // backup ditetapkan via _removeFromKitchenSchedule).
      const roster = await prisma.positionRoster.findFirst({
        where: { userId: ba.backupUserId },
        select: { positionId: true, shiftNumber: true },
      });
      if (roster) {
        const monday = getMonday(dateObj);
        const exists = await prisma.weeklySchedule.findUnique({
          where: {
            positionId_weekStart_userId: {
              positionId: roster.positionId,
              weekStart: monday,
              userId: ba.backupUserId,
            },
          },
        }).catch(() => null);
        if (!exists) {
          await prisma.weeklySchedule.create({
            data: {
              positionId: roster.positionId,
              weekStart: monday,
              userId: ba.backupUserId,
              shiftNumber: roster.shiftNumber || 1,
              isGenerated: true,
            },
          }).catch(() => {});
        }
      }

      await prisma.backupAssignment.delete({ where: { id: ba.id } });
      console.log(`[rotation] Backup usang dibatalkan: backupUser=${ba.backupUserId} absentUser=${absentUserId} date=${ba.date}`);
    } catch (err) {
      console.warn('[rotation] Gagal batalkan backup usang:', err?.message);
    }
  }

  /**
   * Infer kitchenStation user dari hari kerja terdekat ±1 minggu.
   * Dipakai saat baris UserSchedule lama kosong (sebelumnya hari libur).
   */
  async _inferNearestStation(userId, dateObj) {
    try {
      const weekStart = getMonday(dateObj);
      const from = addDays(weekStart, -7);
      const to = addDays(weekStart, 13);
      const rows = await prisma.userSchedule.findMany({
        where: { userId, date: { gte: from, lte: to }, isOffDay: false, kitchenStation: { not: null } },
        select: { date: true, kitchenStation: true },
      });
      if (!rows.length) return null;
      rows.sort((a, b) => Math.abs(a.date - dateObj) - Math.abs(b.date - dateObj));
      return rows[0].kitchenStation || null;
    } catch (err) {
      console.warn('[rotation] Gagal infer station:', err?.message);
      return null;
    }
  }
  /**
   * ---- ANTRIAN TETAP (fixed queue) untuk jobdesk Kitchen ----
   *
   * Menggantikan rotasi berbasis "offset hari ke-epoch": pada mode lama, siapa
   * dapat jobdesk apa ditentukan oleh (hariKeEpoch + indeksStaff) % jumlahPaket,
   * sehingga bila komposisi staff berubah (ada yang off/masuk), SEMUA orang
   * bergeser — jobdesk seseorang berubah hanya karena orang lain tidak masuk.
   *
   * Mode baru: setiap staff punya `queueIndex` TETAP yang tidak berubah oleh
   * kehadiran orang lain. Tiap hari, staff yang bekerja diurutkan berdasarkan
   * queueIndex, lalu paket jobdesk dibagikan mengikuti urutan itu. Supaya
   * adil, posisi paket untuk "orang ke-i dalam hari itu" digeser menurut
   * penghitung hari yang HANYA maju saat jumlah staff yang bekerja = jumlah
   * paket penuh (mis. 4). Dengan begitu:
   *   - urutan antar-staff selalu sama (antrian tetap),
   *   - yang jadi "orang pertama" (Main Cook) tetap bergilir dari hari ke hari,
   *   - saat ada yang off, posisi antrian orang lain TIDAK bergeser permanen.
   */

  /** Jumlah paket penuh (mode staff lengkap) untuk Kitchen. */
  _kitchenFullTeamSize() {
    return 4;
  }

  /** Urutan prioritas paket jobdesk (indeks 0 paling diutamakan). */
  _kitchenPriorityOrder() {
    return module.exports.KITCHEN_PRIORITY_ORDER || [
      'MAIN',
      'SUPPORT',
      'CHECKER',
      'RUNNER',
      'HELPER',
    ];
  }

  /**
   * Urutkan staff Kitchen menurut antrian tetap (`queueIndex`), lalu `orderIndex`
   * roster sebagai cadangan, lalu userId agar hasilnya pasti deterministik.
   */
  _sortKitchenByQueue(userIds, stateMap, rosterOrderMap = new Map()) {
    return [...userIds].sort((a, b) => {
      const qa = stateMap.get(a)?.queueIndex;
      const qb = stateMap.get(b)?.queueIndex;
      const va = Number.isFinite(qa) ? qa : Number.MAX_SAFE_INTEGER;
      const vb = Number.isFinite(qb) ? qb : Number.MAX_SAFE_INTEGER;
      if (va !== vb) return va - vb;
      const ra = rosterOrderMap.get(a) ?? Number.MAX_SAFE_INTEGER;
      const rb = rosterOrderMap.get(b) ?? Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return a - b;
    });
  }

  /** Ringkas paket jobdesk (array nama jobdesk) jadi kode peran, mis. "RUNNER+HELPER". */
  _kitchenPackagesAssigned(pack) {
    return (pack || [])
      .map((name) => this._kitchenRoleOf(name))
      .filter(Boolean)
      .join('+');
  }

  /**
   * Ambil state antrian untuk sekumpulan staff Kitchen.
   * Staff yang belum punya baris state dibuatkan otomatis (queueIndex mengikuti
   * urutan roster) supaya sistem tetap jalan walau seed belum dijalankan.
   */
  async _getOrSeedKitchenStates(positionId, rosterUserIds) {
    const rows = await prisma.kitchenJobdeskState.findMany({
      where: { positionId },
      select: { id: true, userId: true, queueIndex: true, effectiveFrom: true },
    });

    const stateMap = new Map(rows.map((r) => [r.userId, r]));
    const missing = rosterUserIds.filter((uid) => !stateMap.has(uid));

    if (!missing.length) return stateMap;

    // queueIndex untuk staff baru: lanjutkan dari yang tertinggi yang sudah ada.
    let nextIndex = rows.reduce((max, r) => Math.max(max, Number(r.queueIndex) || 0), -1) + 1;
    const today = toDateOnly(new Date());

    for (const uid of missing) {
      try {
        const created = await prisma.kitchenJobdeskState.create({
          data: { positionId, userId: uid, queueIndex: nextIndex, effectiveFrom: today },
          select: { id: true, userId: true, queueIndex: true, effectiveFrom: true },
        });
        stateMap.set(uid, created);
        nextIndex += 1;
      } catch (err) {
        // Balapan antar-request: baris sudah dibuat pihak lain, baca ulang.
        const existing = await prisma.kitchenJobdeskState.findFirst({
          where: { positionId, userId: uid },
          select: { id: true, userId: true, queueIndex: true, effectiveFrom: true },
        });
        if (existing) stateMap.set(uid, existing);
        else console.warn('[rotation] Gagal seed state jobdesk Kitchen:', err?.message);
      }
    }
    return stateMap;
  }

  /**
   * Bobot "seberapa berat" sebuah paket, untuk perataan jangka panjang.
   * Diambil dari jumlah jobdesk inti di dalamnya; paket gabungan (mis.
   * "Runner+Helper") pasti lebih berat daripada paket tunggal (mis. "Main Cook").
   */
  _kitchenPackageWeight(pack) {
    return (pack || []).filter((name) => this._kitchenRoleOf(name)).length || 1;
  }

  /**
   * Hitung, untuk tiap staff, total bobot jobdesk yang SUDAH pernah dipegang,
   * dari log historis. Berguna untuk audit keseimbangan beban jangka panjang.
   *
   * Catatan: KitchenJobdeskLog tidak menyimpan positionId (log dikunci per
   * user+tanggal), jadi beban dihitung untuk semua posisi Kitchen.
   *
   * @param {Number[]} userIds
   * @param {Date|null} since - hanya hitung log sejak tanggal ini
   * @returns {Map} userId -> bobot kumulatif
   */
  async _kitchenLoadFromLogs(userIds, since = null) {
    const load = new Map(userIds.map((u) => [u, 0]));
    if (!userIds.length) return load;

    try {
      const where = { userId: { in: userIds } };
      if (since) where.date = { gte: toDateOnly(since) };

      const logs = await prisma.kitchenJobdeskLog.findMany({
        where,
        select: { userId: true, packagesAssigned: true },
      });
      for (const log of logs) {
        const weight = String(log.packagesAssigned || '')
          .split('+')
          .filter(Boolean).length;
        load.set(log.userId, (load.get(log.userId) || 0) + weight);
      }
    } catch (err) {
      console.warn('[rotation] Gagal baca beban jobdesk dari log:', err?.message);
    }
    return load;
  }

  /**
   * Tentukan siapa dapat jobdesk apa untuk satu hari, memakai antrian tetap.
   *
   * Aturan:
   *   1. Staff diurutkan menurut `queueIndex` (permanent) — kehadiran orang lain
   *      TIDAK mengubah urutan ini.
   *   2. Paket yang tersedia hari itu diurutkan menurut KITCHEN_PRIORITY_ORDER.
   *   3. Paket dibagikan ke staff, tetapi urutan penerimaannya dirotasi tiap hari
   *      (`dayOffset`) sehingga yang paling diutamakan bergilir — bukan selalu
   *      orang yang sama.
   *   4. Antar-staff, urutan penerimaan dirotasi menurut beban historis
   *      (`loadMap`) supaya akumulasi jobdesk berat merata dalam jangka panjang.
   *
   * @param {String[]} jobdeskList - nama jobdesk posisi (urut orderIndex)
   * @param {Number[]} workingUserIds - staff yang MASUK KERJA hari itu
   * @param {Map} stateMap - userId -> { queueIndex }
   * @param {Map} rosterOrderMap - userId -> orderIndex roster (cadangan urutan)
   * @param {Number} dayOffset - penghitung rotasi harian (mis. indeks hari)
   * @param {Map} loadMap - userId -> bobot historis (opsional)
   * @returns {Map} userId -> { jobs: String[], roleCode: String }
   */
  _assignKitchenByQueue(
    jobdeskList,
    workingUserIds,
    stateMap,
    rosterOrderMap = new Map(),
    dayOffset = 0,
    loadMap = new Map()
  ) {
    const result = new Map();
    if (!workingUserIds.length) return result;

    const ordered = this._sortKitchenByQueue(workingUserIds, stateMap, rosterOrderMap);
    const packages = this.buildKitchenPackages(jobdeskList, ordered.length);

    if (!packages.length) return result;
    if (packages.length === 1) {
      ordered.forEach((uid) =>
        result.set(uid, {
          jobs: packages[0],
          roleCode: this._kitchenPackagesAssigned(packages[0]),
        })
      );
      return result;
    }
    return this._spreadKitchenPackages(ordered, packages, dayOffset, result);
  }

  /**
   * Bagikan paket jobdesk ke staff (dipisah agar mudah diuji & dibaca).
   *
   * Prinsip (penting, jangan diubah tanpa uji):
   *   - ROTASI ditentukan MURNI oleh antrian tetap + hari. Staff ke-i dalam
   *     antrian selalu menerima paket ke-(i + hari) dari daftar paket yang
   *     dirotasi. Jadi rotasi TIDAK PERNAH bisa dibekukan oleh faktor lain.
   *   - Paket diurutkan menurut KITCHEN_PRIORITY_ORDER supaya slot 0 selalu
   *     berarti "jobdesk paling utama" — dipakai untuk pelaporan, bukan untuk
   *     menentukan siapa dapat apa.
   */
  _spreadKitchenPackages(ordered, packages, dayOffset, result) {
    const n = ordered.length;
    const m = packages.length;
    const wOf = (pack) => this._kitchenPackageWeight(pack);

    // 1. Rotasi paket per hari: paket digeser agar slot 0 bukan selalu paket
    //    yang sama → yang memegang jobdesk utama bergilir tiap hari.
    const shift = ((dayOffset % m) + m) % m;
    const rotated = [...packages.slice(shift), ...packages.slice(0, shift)];

    // 2. Urutkan paket yang sudah dirotasi menurut KITCHEN_PRIORITY_ORDER
    //    supaya penamaan slot konsisten (slot 0 = jobdesk paling utama).
    const priority = this._kitchenPriorityOrder();
    const rankOf = (pack) => {
      const first = (pack || []).map((x) => this._kitchenRoleOf(x)).find(Boolean);
      const idx = priority.indexOf(first);
      return idx === -1 ? priority.length : idx;
    };
    const slotPacks = [...rotated].sort((x, y) => rankOf(x) - rankOf(y));

    // 3. Susun urutan staff penerima. Basis: antrian tetap (rotasi pasti jalan).
    //    Perataan beban HANYA menggeser urutan di antara staff yang bebannya
    //    berbeda, dan hanya untuk paket yang bobotnya sama — tidak pernah
    //    mengubah giliran paket utama.
    const rot = ((dayOffset % n) + n) % n;
    const queueOrder = [...ordered.slice(rot), ...ordered.slice(0, rot)];

    // Rotasi paket per-slot untuk staff: staff ke-k menerima slotPacks ke-k,
    // lalu slot dirotasi per hari agar tidak macet.
    const nPack = slotPacks.length;

    // Staff tambahan (bila staff > paket) ditempelkan ke paket terbesar.
    const extras = queueOrder.slice(nPack);

    queueOrder.slice(0, nPack).forEach((uid, k) => {
      const pack = slotPacks[k] || [];
      result.set(uid, { jobs: pack, roleCode: this._kitchenPackagesAssigned(pack) });
    });

    if (!extras.length) return result;

    // Cari paket terberat untuk dibagi dengan staff berlebih.
    let hostIdx = 0;
    for (let k = 1; k < nPack; k++) {
      if (wOf(slotPacks[k]) > wOf(slotPacks[hostIdx])) hostIdx = k;
    }
    const hostUid = queueOrder[hostIdx];
    const hostEntry = result.get(hostUid);
    if (!hostEntry) return result;

    const jobs = hostEntry.jobs;
    const groups = Math.min(extras.length + 1, Math.max(jobs.length, 2));
    const per = Math.max(1, Math.ceil(jobs.length / groups));

    hostEntry.jobs = jobs.slice(0, per);
    hostEntry.roleCode = this._kitchenPackagesAssigned(hostEntry.jobs);

    extras.forEach((uid, i) => {
      const slice = jobs.slice(per * (i + 1), per * (i + 2));
      result.set(uid, {
        jobs: slice,
        roleCode: this._kitchenPackagesAssigned(slice),
      });
    });

    return result;
  }
}

module.exports = new RotationService();

/**
 * Urutan prioritas jobdesk Kitchen — dipakai untuk menentukan staff mana
 * yang mendapat paket jobdesk tertentu saat jumlah staff terbatas.
 *
 * Diurutkan dari yang paling menentukan (paling awal). Semakin kecil indeksnya,
 * semakin diutamakan saat paket jobdesk dialokasikan ke staf menurut antrian.
 * Ini konstanta kode, BUKAN data DB: mengubahnya harus lewat perubahan kode
 * yang ter-review, bukan edit baris tabel.
 */
module.exports.KITCHEN_PRIORITY_ORDER = [
  'MAIN',
  'SUPPORT',
  'CHECKER',
  'RUNNER',
  'HELPER',
];