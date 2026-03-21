const prisma = require('../utils/database');

class AttendanceRepository {
  /**
   * Create attendance record
   */
  async create(data) {
    return await prisma.attendance.create({
      data: {
        userId: data.userId,
        date: data.date,
        clockIn: data.clockIn,
        clockOut: data.clockOut || null,
        clockInLocation: data.clockInLocation || null,
        clockOutLocation: data.clockOutLocation || null,
        clockInPhoto: data.clockInPhoto || null,
        clockInIp: data.clockInIp || null,
        status: data.status,
        notes: data.notes || null,
      },
    });
  }

  /**
   * Find user by ID
   */
  async findUserById(id) {
    return await prisma.user.findUnique({
      where: { id },
      include: {
        shift: true
      }
    });
  }

  /**
   * Find attendance by ID
   */
  async findById(id) {
    return await prisma.attendance.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            employeeId: true,
          },
        },
      },
    });
  }

  /**
   * Find today's attendance for user (using WITA UTC+8 timezone)
   */
  async findTodayByUserId(userId) {
    // Hitung "hari ini" berdasarkan WITA (UTC+8), bukan UTC lokal server
    const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;
    const nowWITA = new Date(Date.now() + WITA_OFFSET_MS);
    const dateStr = nowWITA.toISOString().slice(0, 10); // "YYYY-MM-DD" in WITA

    const todayStartUTC = new Date(`${dateStr}T00:00:00+08:00`);
    const todayEndUTC   = new Date(`${dateStr}T23:59:59+08:00`);

    return await prisma.attendance.findFirst({
      where: {
        userId,
        date: {
          gte: todayStartUTC,
          lte: todayEndUTC,
        },
      },
      include: {
        user: true,
      },
    });
  }

  /**
   * Find attendance by user and date
   */
  async findByUserIdAndDate(userId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    return await prisma.attendance.findFirst({
      where: {
        userId,
        date: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
    });
  }

  /**
   * Update attendance record
   */
  async update(id, data) {
    return await prisma.attendance.update({
      where: { id },
      data: {
        ...(data.clockIn !== undefined && { clockIn: data.clockIn }),
        ...(data.clockOut !== undefined && { clockOut: data.clockOut }),
        ...(data.clockInLocation !== undefined && { clockInLocation: data.clockInLocation }),
        ...(data.clockOutLocation !== undefined && { clockOutLocation: data.clockOutLocation }),
        ...(data.clockInPhoto !== undefined && { clockInPhoto: data.clockInPhoto }),
        ...(data.clockOutPhoto !== undefined && { clockOutPhoto: data.clockOutPhoto }),
        ...(data.clockInIp !== undefined && { clockInIp: data.clockInIp }),
        ...(data.clockOutIp !== undefined && { clockOutIp: data.clockOutIp }),
        ...(data.status && { status: data.status }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            employeeId: true,
          },
        },
      },
    });
  }

  /**
   * Delete attendance record
   */
  async delete(id) {
    return await prisma.attendance.delete({
      where: { id },
    });
  }

  /**
   * Delete ALL attendance records (for testing/reset)
   */
  async deleteAll() {
    return await prisma.attendance.deleteMany({});
  }

  /**
   * Get user attendance history with pagination
   */
  async getUserHistory(userId, options = {}) {
    const { page = 1, limit = 20, startDate, endDate, status } = options;

    const skip = (page - 1) * limit;

    const where = {
      userId,
      ...(startDate && { date: { gte: new Date(startDate) } }),
      ...(endDate && { date: { lte: new Date(endDate) } }),
      ...(status && { status }),
    };

    const [records, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        select: {
          id: true,
          date: true,
          clockIn: true,
          clockOut: true,
          status: true,
          notes: true,
        },
      }),
      prisma.attendance.count({ where }),
    ]);

    // Calculate summary
    const summary = await prisma.attendance.groupBy({
      by: ['status'],
      where: {
        userId,
        ...(startDate && { date: { gte: new Date(startDate) } }),
        ...(endDate && { date: { lte: new Date(endDate) } }),
      },
      _count: true,
    });

    const summaryMap = {
      totalDays: total,
      presentDays: 0,
      lateDays: 0,
      absentDays: 0,
      halfDays: 0,
    };

    summary.forEach((s) => {
      const key = s.status === 'PRESENT' ? 'presentDays'
        : s.status === 'LATE' ? 'lateDays'
          : s.status === 'ABSENT' ? 'absentDays'
            : 'halfDays';
      summaryMap[key] = s._count;
    });

    return {
      records,
      pagination: {
        page,
        limit,
        totalRecords: total,
        totalPages: Math.ceil(total / limit),
      },
      summary: summaryMap,
    };
  }

  /**
   * Get all attendance records (admin) with filters
   */
  async findAll(options = {}) {
    const { page = 1, limit = 50, date, userId, status, startDate, endDate } = options;

    const skip = (page - 1) * limit;

    const where = {
      ...(userId && { userId }),
      ...(date && !startDate && !endDate && {
        date: {
          gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
          lt: new Date(new Date(date).setHours(24, 0, 0, 0)),
        }
      }),
      ...(startDate && !endDate && { date: { gte: new Date(startDate) } }),
      ...(endDate && !startDate && { date: { lte: new Date(endDate) } }),
      ...(startDate && endDate && {
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      }),
      ...(status && { status }),
    };

    const [records, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              fullName: true,
              employeeId: true,
            },
          },
        },
      }),
      prisma.attendance.count({ where }),
    ]);

    return {
      records,
      pagination: {
        page,
        limit,
        totalRecords: total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get daily attendance summary for all users
   */
  async getDailySummary(date) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    // Get all attendance records for the date
    const records = await prisma.attendance.findMany({
      where: {
        date: {
          gte: targetDate,
          lt: nextDate,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            employeeId: true,
          },
        },
      },
      orderBy: { clockIn: 'asc' },
    });

    // Get total active employees
    const totalEmployees = await prisma.user.count({
      where: { isActive: true },
    });

    // Calculate summary
    const summary = {
      totalEmployees,
      present: 0,
      late: 0,
      absent: 0,
      halfDay: 0,
      notClockedIn: 0,
    };

    records.forEach((record) => {
      if (record.status === 'PRESENT') summary.present++;
      else if (record.status === 'LATE') summary.late++;
      else if (record.status === 'ABSENT') summary.absent++;
      else if (record.status === 'HALF_DAY') summary.halfDay++;
    });

    summary.notClockedIn = totalEmployees - records.length;

    return {
      date: targetDate.toISOString().split('T')[0],
      summary,
      records,
    };
  }

  /**
   * Get monthly attendance report for user
   */
  async getMonthlyReport(userId, month) {
    const [year, monthNum] = month.split('-').map(Number);

    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

    const records = await prisma.attendance.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { date: 'asc' },
    });

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        fullName: true,
        employeeId: true,
        hourlyRate: true,
      },
    });

    // Calculate summary
    let totalHours = 0;
    const summary = {
      totalWorkingDays: 0, // Would need business days config
      presentDays: 0,
      lateDays: 0,
      absentDays: 0,
      halfDays: 0,
      totalHoursWorked: 0,
      averageHoursPerDay: 0,
      estimatedSalary: 0,
    };

    const dailyBreakdown = records.map((record) => {
      if (record.status === 'PRESENT') summary.presentDays++;
      else if (record.status === 'LATE') summary.lateDays++;
      else if (record.status === 'ABSENT') summary.absentDays++;
      else if (record.status === 'HALF_DAY') summary.halfDays++;

      let hours = 0;
      if (record.clockOut) {
        hours = (record.clockOut - record.clockIn) / (1000 * 60 * 60);
        totalHours += hours;
      }

      return {
        date: record.date.toISOString().split('T')[0],
        status: record.status.toLowerCase(),
        clockIn: record.clockIn.toTimeString().slice(0, 5),
        clockOut: record.clockOut ? record.clockOut.toTimeString().slice(0, 5) : null,
        totalHours: Math.round(hours * 100) / 100,
      };
    });

    const workedDays = records.filter((r) => r.clockOut).length || 1;
    summary.totalHoursWorked = Math.round(totalHours * 100) / 100;
    summary.averageHoursPerDay = Math.round((totalHours / workedDays) * 100) / 100;
    summary.totalWorkingDays = records.length;
    summary.estimatedSalary = Math.round(summary.totalHoursWorked * (user.hourlyRate || 0));

    return {
      userId,
      user,
      month,
      summary,
      dailyBreakdown,
    };
  }
}

module.exports = new AttendanceRepository();
