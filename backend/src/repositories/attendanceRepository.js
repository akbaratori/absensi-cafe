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
   * List attendance records with pagination/filters (Placeholder)
   */
  async list(options = {}) {
    // Basic implementation for stability
    return await prisma.attendance.findMany({
        take: 20,
        orderBy: { date: 'desc' }
    });
  }
}

module.exports = new AttendanceRepository();
