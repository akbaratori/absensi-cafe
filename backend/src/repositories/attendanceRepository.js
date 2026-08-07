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
        lateMinutes: data.lateMinutes || 0,
        notes: data.notes || null,
      },
    });
  }

  /**
   * Find today's attendance for user
   */
  async findTodayByUserId(userId) {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    return await prisma.attendance.findFirst({
      where: {
        userId,
        date: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            shift: true,
            shiftId: true,
          },
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
        ...(data.clockOut && { clockOut: data.clockOut }),
        ...(data.clockOutLocation && { clockOutLocation: data.clockOutLocation }),
        ...(data.clockOutPhoto && { clockOutPhoto: data.clockOutPhoto }),
        ...(data.clockOutIp && { clockOutIp: data.clockOutIp }),
        ...(data.status && { status: data.status }),
      },
    });
  }

  /**
   * Find a single attendance record by id
   */
  async findById(id) {
    return await prisma.attendance.findUnique({
      where: { id },
      include: { user: true },
    });
  }

  /**
   * List attendance records with pagination/filters
   * options: { userId, startDate, endDate, status, page, limit }
   */
  async list(options = {}) {
    const {
      userId,
      startDate,
      endDate,
      status,
      page = 1,
      limit = 20,
    } = options;

    const where = {};
    if (userId) where.userId = userId;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        where.date.gte = s;
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        where.date.lte = e;
      }
    }

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);

    const [records, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        include: {
          user: {
            select: { id: true, fullName: true, shift: true, shiftId: true },
          },
        },
        orderBy: { date: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.attendance.count({ where }),
    ]);

    return { records, total };
  }
}

module.exports = new AttendanceRepository();
