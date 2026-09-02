const { AppError } = require('../utils/AppError');
const prisma = require('../utils/database');

/**
 * Rotation Service
 * Handles position-based circular shift rotation.
 *
 * Rotation rule: each week, the roster shifts by `shift1Capacity` positions.
 *   startIndex = (currentStartIndex + shift1Capacity) % totalRoster
 *   Shift 1 = roster[startIndex .. startIndex + shift1Capacity - 1]
 *   Shift 2 = the rest, wrapping around.
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

  async getPosition(positionId) {
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
    return { ...position, rosters, rotationState, jobdesks };
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

  async createPosition({ name, shift1Capacity, shift2Capacity, scheduleAllWorking }) {
    if (!name) {
      throw new AppError('Nama posisi wajib diisi', 400, 'VALIDATION_ERROR');
    }
    const existing = await prisma.position.findUnique({ where: { name } });
    if (existing) {
      throw new AppError(`Posisi "${name}" sudah ada`, 409, 'VALIDATION_ERROR');
    }

    const position = await prisma.position.create({
      data: {
        name,
        shift1Capacity: shift1Capacity ?? 2,
        shift2Capacity: shift2Capacity ?? 3,
        scheduleAllWorking: scheduleAllWorking ?? false,
      },
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

    const data = {};
    if (name !== undefined) data.name = name;
    if (shift1Capacity !== undefined) data.shift1Capacity = shift1Capacity;
    if (shift2Capacity !== undefined) data.shift2Capacity = shift2Capacity;
    if (isActive !== undefined) data.isActive = isActive;
    if (scheduleAllWorking !== undefined) data.scheduleAllWorking = scheduleAllWorking;

    await prisma.position.update({ where: { id: positionId }, data });
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
    if (existingState) {
      await prisma.rotationState.update({
        where: { id: existingState.id },
        data: { currentStartIndex: 0, lastGeneratedWeekStart: null },
      });
    } else {
      await prisma.rotationState.create({
        data: { positionId, currentStartIndex: 0 },
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
        update: { currentStartIndex: 0, lastGeneratedWeekStart: null },
        create: { positionId, currentStartIndex: 0 },
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
        update: { currentStartIndex: 0, lastGeneratedWeekStart: null },
        create: { positionId, currentStartIndex: 0 },
      });
    });

    return this.getPosition(positionId);
  }

  // ---------- Schedule Generation ----------

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
    const startIndex = state.currentStartIndex;
    const totalRoster = roster.length;

    const shift1 = await prisma.shift.findFirst({ where: { name: 'Shift 1' } });
    const shift2 = await prisma.shift.findFirst({ where: { name: 'Shift 2' } });

    if (!shift1 || !shift2) {
      throw new AppError('Data Shift 1 dan Shift 2 belum ada di database', 500, 'INTERNAL_ERROR');
    }

    // Rotasi berdasarkan posisi di roster (circular), bukan shiftNumber yang tersimpan.
    // Setiap minggu startIndex maju sebesar shift1Capacity, sehingga orang yang minggu
    // sebelumnya ada di Shift 2 akan berpindah ke Shift 1 dan sebaliknya.
    const idx = startIndex % roster.length;
    const rotated = [...roster.slice(idx), ...roster.slice(0, idx)];

    // Mode "scheduleAllWorking" (posisi Kitchen): jadwalkan SEMUA orang di
    // roster (formasi fleksibel 3-4 orang), kapasitas tidak memotong. Shift 1/2
    // dibagi dari urutan rotasi (setengah-setengah) sehingga tetap adil bergantian.
    // Mode normal: potong sesuai shift1Capacity / shift2Capacity.
    let shift1Members, shift2Members;
    if (position.scheduleAllWorking) {
      const half = Math.ceil(rotated.length / 2);
      shift1Members = rotated.slice(0, half);
      shift2Members = rotated.slice(half);
    } else {
      shift1Members = rotated.slice(0, position.shift1Capacity);
      shift2Members = rotated.slice(position.shift1Capacity);
    }

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
      const department = position.name === 'Kitchen' ? 'KITCHEN' : 'BAR';

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

      // Remove previous auto-generated rows for this week (single bulk delete).
      await prisma.userSchedule.deleteMany({
        where: {
          isManualOverride: false,
          OR: pairs.map((p) => ({ userId: p.userId, date: p.date })),
        },
      });

      // ---- Rotasi jobdesk harian (adil & bergilir) ----
      // Untuk tiap hari, tugaskan jobdesk ke staff yang BEKERJA hari itu secara
      // berputar berdasarkan urutan roster, sehingga: (1) tidak ada staff yang
      // jobdesknya sama terus, (2) semua jobdesk kebagian bergilir, (3) jobdesk
      // yang kosong (saat staff < jumlah jobdesk) juga bergantian adil.
      const jobdeskObjs = position.jobdesks || [];
      const jobdeskList = jobdeskObjs.map((j) => j.name);
      const jobdeskByKey = new Map(); // `${userId}_${dateISO}` -> jobdeskName (bisa "A + B" jika rangkap)
      if (jobdeskList.length) {
        const rank = new Map(allRosterIds.map((uid, i) => [uid, i]));
        weekDates.forEach((dateObj, dayIdx) => {
          const dateISO = toISO(dateObj);
          // Staff yang bekerja hari ini (tidak libur), urut roster.
          const working = assignments
            .filter((a) => !isOffOn(a.userId, dateObj))
            .map((a) => a.userId)
            .sort((x, y) => (rank.get(x) ?? 0) - (rank.get(y) ?? 0));
          if (!working.length) return;

          const nStaff = working.length;
          const nJd = jobdeskList.length;
          const heavyIdx = jobdeskObjs
            .map((j, idx) => (j.isHeavy ? idx : -1))
            .filter((idx) => idx >= 0);
          const isHeavyJd = (jd) => heavyIdx.includes(jd);

          // Pemegang utama tiap jobdesk (rotasi titik awal per hari):
          // jobdesk ke-jd dipegang staff working[(dayIdx + jd) % nStaff].
          // Jika staff >= jobdesk, tiap staff dapat maks 1 jobdesk utama (peta 1-1).
          // Jika staff < jobdesk, beberapa jobdesk utama jatuh ke staff yang sama;
          // kelebihan itu kita perlakukan sebagai "tugas tambahan" agar bisa
          // dialihkan ke staff lain (menjaga jobdesk BERAT tetap eksklusif).
          const assign = new Map(); // uid -> array nama jobdesk
          working.forEach((uid) => assign.set(uid, []));
          const locked = new Set(); // uid pemegang jobdesk BERAT (tidak boleh rangkap)
          const covered = new Set();
          const pending = []; // jobdesk utama yang menumpuk di satu staff (perlu dialihkan)

          const give = (uid, jd) => {
            assign.get(uid).push(jobdeskList[jd]);
            covered.add(jd);
            if (isHeavyJd(jd)) locked.add(uid);
          };

          // 1) Isi jobdesk BERAT dulu ke pemegang utamanya dan kunci orangnya.
          heavyIdx.forEach((jd) => {
            const uid = working[(dayIdx + jd) % nStaff];
            give(uid, jd);
          });

          // 2) Jobdesk non-berat: berikan ke pemegang utamanya bila ia belum
          //    terkunci (bukan pemegang berat). Kalau terkunci, masuk antrian.
          for (let jd = 0; jd < nJd; jd++) {
            if (isHeavyJd(jd)) continue;
            const uid = working[(dayIdx + jd) % nStaff];
            if (locked.has(uid)) { pending.push(jd); continue; }
            give(uid, jd);
          }

          // 3) Alihkan jobdesk yang masih kosong (pending + yang tumpang-tindih)
          //    ke staff yang boleh rangkap (bukan pemegang berat), berputar adil.
          for (let jd = 0; jd < nJd; jd++) if (!covered.has(jd)) pending.push(jd);
          const free = working.filter((uid) => !locked.has(uid));
          pending.forEach((jd, k) => {
            if (covered.has(jd) || !free.length) return;
            // Mulai dari offset bergeser tiap hari agar yang rangkap bergantian.
            const holder = free[(dayIdx + k) % free.length];
            if (!assign.get(holder).includes(jobdeskList[jd])) give(holder, jd);
          });
          // Putaran pengaman: jika masih ada yang kosong, paksa isi ke staff bebas
          // mana pun yang belum memegangnya.
          for (let jd = 0; jd < nJd; jd++) {
            if (covered.has(jd) || !free.length) continue;
            const holder = free.find((uid) => !assign.get(uid).includes(jobdeskList[jd])) || free[0];
            give(holder, jd);
          }

          working.forEach((uid) => {
            const jobs = assign.get(uid) || [];
            if (jobs.length) jobdeskByKey.set(`${uid}_${dateISO}`, jobs.join(' + '));
          });
        });
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

    const nextStartIndex = (startIndex + position.shift1Capacity) % totalRoster;
    await prisma.rotationState.upsert({
      where: { positionId },
      update: {
        currentStartIndex: nextStartIndex,
        lastGeneratedWeekStart: monday,
      },
      create: {
        positionId,
        currentStartIndex: nextStartIndex,
        lastGeneratedWeekStart: monday,
      },
    });

    if (options.skipGetSchedule) {
      return { positionId, weekStart: mondayISO };
    }
    return this.getSchedule(positionId, mondayISO);
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

    // Ambil penugasan jobdesk harian (UserSchedule.kitchenStation) untuk
    // minggu ini agar frontend bisa menampilkan jobdesk tiap staff per hari.
    const userSchedRows = userIds.length > 0
      ? await prisma.userSchedule.findMany({
          where: { userId: { in: userIds }, date: { in: weekDates } },
          select: { userId: true, date: true, kitchenStation: true, isOffDay: true },
        })
      : [];
    // Map: userId -> { dateISO -> jobdeskName }
    const jobdeskMap = new Map();
    for (const r of userSchedRows) {
      const iso = toISO(r.date);
      if (!jobdeskMap.has(r.userId)) jobdeskMap.set(r.userId, {});
      jobdeskMap.get(r.userId)[iso] = r.kitchenStation || null;
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
      for (const b of backupRows) {
        const iso = toISO(b.date);
        const covered = absentJobdesk.get(`${b.absentUserId}_${iso}`);
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

    // 2. OffDayRequest APPROVED
    const offRequests = await prisma.offDayRequest.findMany({
      where: { userId, status: 'APPROVED', offDate: { gte: from, lte: to } },
      select: { offDate: true },
    });
    for (const r of offRequests) mark(toISO(r.offDate));

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
      });
    }

    // Daily jobdesk (UserSchedule.kitchenStation) for this user in range
    // Also include shiftId to detect swap overrides
    const jobdeskRows = await prisma.userSchedule.findMany({
      where: { userId, date: { gte: from, lte: to } },
      select: { date: true, kitchenStation: true, shiftId: true, isOffDay: true },
    });
    const jobdeskByDate = new Map(jobdeskRows.map(r => [toISO(r.date), r.kitchenStation || null]));
    // Map date -> actual shiftId from UserSchedule (reflects swap overrides)
    const userSchedShiftByDate = new Map(jobdeskRows.map(r => [toISO(r.date), { shiftId: r.shiftId, isOffDay: r.isOffDay }]));

    // Ambil semua shift dari DB untuk mapping shiftId -> shiftNumber (1=Pagi, 2=Siang)
    const allShifts = await prisma.shift.findMany({ select: { id: true, name: true } });
    // Shift 1 = shift dengan startTime paling awal, atau nama mengandung "1"/"Pagi"
    // Sort by id ascending: shift id 1 = Pagi (shift 1), id 2 = Siang (shift 2)
    allShifts.sort((a, b) => a.id - b.id);
    const shiftIdToNumber = new Map();
    allShifts.forEach((sh, idx) => shiftIdToNumber.set(sh.id, idx + 1));

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

      // Shift aktual: ambil dari UserSchedule jika ada (mencerminkan swap/override),
      // fallback ke weeklySchedule.shiftNumber, lalu backup
      let effectiveShift = s ? s.shiftNumber : null;
      if (backup) effectiveShift = backup.shiftNumber;
      if (userSched && userSched.shiftId) {
        const fromUserSched = shiftIdToNumber.get(userSched.shiftId) || null;
        if (fromUserSched) effectiveShift = fromUserSched;
      }

      return {
        date: iso,
        shiftNumber: effectiveShift,
        positionName: backup ? backup.positionName : originalPositionName,
        positionId: backup ? backup.positionId : (s ? s.positionId : null),
        jobdesk: jobdeskByDate.get(iso) || null,
        isOffDay: userSched ? userSched.isOffDay : offSet.has(iso),
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

    // 2. OffDayRequest APPROVED — user is OFF on offDate (not workDate)
    const offRequests = await prisma.offDayRequest.findMany({
      where: {
        userId: { in: rosterUserIds },
        status: 'APPROVED',
        offDate: { in: dates },
      },
      select: { userId: true, offDate: true },
    });
    for (const r of offRequests) {
      mark(r.userId, toISO(r.offDate));
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
    const shift1Capacity = position.shift1Capacity || 1;
    const shift2Capacity = position.shift2Capacity || 1;

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

    const department = position.name === 'Kitchen' ? 'KITCHEN' : 'BAR';

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
}

module.exports = new RotationService();