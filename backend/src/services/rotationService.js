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

  async generateWeek(positionId, weekStart) {
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

    // Gunakan shiftNumber yang tersimpan pada tiap anggota roster (manual assignment).
    // Rotate roster sehingga startIndex di depan, lalu kelompokkan per shiftNumber.
    const rotated = [...roster.slice(startIndex % roster.length), ...roster.slice(0, startIndex % roster.length)];
    const shift1UserIds = rotated.filter((r) => (r.shiftNumber || 1) === 1).map((r) => r.userId);
    const shift2UserIds = rotated.filter((r) => (r.shiftNumber || 1) === 2).map((r) => r.userId);

    const assignments = [
      ...shift1UserIds.map((userId) => ({ userId, shiftNumber: 1, shiftId: shift1.id })),
      ...shift2UserIds.map((userId) => ({ userId, shiftNumber: 2, shiftId: shift2.id })),
    ];

    const mondayISO = toISO(monday);

    await prisma.weeklySchedule.deleteMany({
      where: { positionId, weekStart: monday },
    });

    for (const a of assignments) {
      await prisma.weeklySchedule.create({
        data: {
          positionId,
          weekStart: monday,
          userId: a.userId,
          shiftNumber: a.shiftNumber,
          isGenerated: true,
        },
      });
    }
    const assignedUserIds = new Set(assignments.map((a) => a.userId));
    const allRosterIds = roster.map((r) => r.userId);

    for (let day = 0; day < 7; day++) {
      const dateObj = addDays(monday, day);

      for (const a of assignments) {
        const existing = await prisma.userSchedule.findFirst({
          where: { userId: a.userId, date: dateObj },
        });

        if (existing && existing.isManualOverride) {
          continue;
        }

        const data = {
          userId: a.userId,
          date: dateObj,
          shiftId: a.shiftId,
          isOffDay: false,
          temporaryDepartment: position.name === 'Kitchen' ? 'KITCHEN' : 'BAR',
          isManualOverride: false,
        };

        if (existing) {
          await prisma.userSchedule.update({ where: { id: existing.id }, data });
        } else {
          await prisma.userSchedule.create({ data });
        }
      }

      for (const userId of allRosterIds) {
        if (assignedUserIds.has(userId)) continue;
        const existing = await prisma.userSchedule.findFirst({
          where: { userId, date: dateObj },
        });
        if (existing && existing.isManualOverride) continue;

        const data = {
          userId,
          date: dateObj,
          shiftId: null,
          isOffDay: true,
          temporaryDepartment: position.name === 'Kitchen' ? 'KITCHEN' : 'BAR',
          isManualOverride: false,
        };

        if (existing) {
          await prisma.userSchedule.update({ where: { id: existing.id }, data });
        } else {
          await prisma.userSchedule.create({ data });
        }
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
    const users = await prisma.user.findMany({
      where: { id: { in: rosterUserIds } },
      select: { id: true, offDay: true },
    });
    const userOffDayMap = new Map(users.map((u) => [u.id, u.offDay]));
    for (const d of dates) {
      const dow = d.getUTCDay();
      for (const uid of rosterUserIds) {
        if (userOffDayMap.get(uid) === dow) mark(uid, toISO(d));
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

    // Collect all Mondays belonging to this month
    const mondays = [];
    let cursor = new Date(Date.UTC(year, month, 1));
    while (cursor.getUTCDay() !== 1) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    while (cursor.getUTCMonth() === month) {
      mondays.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }

    const position = await this.getPosition(positionId);
    const shift1Capacity = position.shift1Capacity || 1;
    const shift2Capacity = position.shift2Capacity || 1;

    const generatedWeeks = [];
    const understaffed = [];

    for (const monday of mondays) {
      await this.generateWeek(positionId, monday);

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