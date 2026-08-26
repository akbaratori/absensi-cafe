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
      result.push({
        ...p,
        rosters,
        rotationState,
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
    const rosters = await prisma.positionRoster.findMany({
      where: { positionId },
      orderBy: { orderIndex: 'asc' },
      include: { user: { select: { id: true, fullName: true } } },
    });
    const rotationState = await prisma.rotationState.findFirst({
      where: { positionId },
    });
    return { ...position, rosters, rotationState };
  }

  async createPosition({ name, shift1Capacity, shift2Capacity }) {
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

  async updatePosition(positionId, { name, shift1Capacity, shift2Capacity, isActive }) {
    const position = await prisma.position.findUnique({ where: { id: positionId } });
    if (!position) {
      throw new AppError(`Posisi dengan ID ${positionId} tidak ditemukan`, 404, 'NOT_FOUND');
    }

    const data = {};
    if (name !== undefined) data.name = name;
    if (shift1Capacity !== undefined) data.shift1Capacity = shift1Capacity;
    if (shift2Capacity !== undefined) data.shift2Capacity = shift2Capacity;
    if (isActive !== undefined) data.isActive = isActive;

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
    const shift1Members = rotated.slice(0, position.shift1Capacity);
    const shift2Members = rotated.slice(position.shift1Capacity);

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
    const pairs = [];
    for (const dateObj of weekDates) {
      for (const a of assignments) {
        pairs.push({ userId: a.userId, date: dateObj, shiftId: a.shiftId, isOffDay: false });
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

      // Recreate all rows for the week, skipping manual overrides (single bulk create).
      const toCreate = pairs
        .filter((p) => !overrideSet.has(`${p.userId}_${p.date.toISOString()}`))
        .map((p) => ({
          userId: p.userId,
          date: p.date,
          shiftId: p.shiftId,
          isOffDay: p.isOffDay,
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

    const userIds = schedules.map((s) => s.userId);
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true, username: true, department: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const enriched = schedules.map((s) => ({
      ...s,
      user: userMap.get(s.userId) || null,
    }));

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

    return schedules.map((s) => ({
      ...s,
      user: userMap.get(s.userId) || null,
      weekStart: toISO(s.weekStart),
    }));
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
      select: { date: true, absentPositionId: true },
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
      });
    }

    // Build final list
    return dateISOs.map((iso) => {
      const s = scheduleByDate.get(iso);
      const backup = backupByDate.get(iso);
      const originalPositionName = s && s.position ? s.position.name : null;
      return {
        date: iso,
        shiftNumber: s ? s.shiftNumber : null,
        // If user is acting as backup today, show the backup position instead
        positionName: backup ? backup.positionName : originalPositionName,
        positionId: backup ? backup.positionId : (s ? s.positionId : null),
        isOffDay: offSet.has(iso),
        isBackup: !!backup,
        originalPositionName: backup ? originalPositionName : null,
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
        // Mark off if offDay is explicitly set (0-6) and matches this day
        if (userOffDay !== null && userOffDay !== undefined && userOffDay === dow) {
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
}

module.exports = new RotationService();