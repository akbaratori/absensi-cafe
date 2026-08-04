const prisma = require('../utils/database');

class OvertimeRepository {
  /**
   * Create overtime request
   */
  async create(data) {
    return await prisma.overtime.create({
      data: {
        userId: data.userId,
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
        durationHours: data.durationHours,
        reason: data.reason || null,
        status: data.status || 'PENDING',
        notes: data.notes || null,
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
   * Find overtime by ID
   */
  async findById(id) {
    return await prisma.overtime.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            employeeId: true,
            department: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
          },
        },
      },
    });
  }

  /**
   * List overtime requests with filters
   */
  async findAll(options = {}) {
    const {
      userId,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = options;

    const where = {};

    if (userId) where.userId = parseInt(userId);
    if (status) where.status = status;

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(`${startDate}T00:00:00+08:00`);
      if (endDate) where.date.lte = new Date(`${endDate}T23:59:59+08:00`);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [records, total] = await Promise.all([
      prisma.overtime.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              fullName: true,
              employeeId: true,
              department: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              username: true,
              fullName: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: parseInt(limit),
      }),
      prisma.overtime.count({ where }),
    ]);

    return {
      records,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    };
  }

  /**
   * Get overtime history for a user
   */
  async getUserHistory(userId, options = {}) {
    const { page = 1, limit = 20, status } = options;

    const where = { userId: parseInt(userId) };
    if (status) where.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [records, total] = await Promise.all([
      prisma.overtime.findMany({
        where,
        include: {
          approvedBy: {
            select: {
              id: true,
              username: true,
              fullName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.overtime.count({ where }),
    ]);

    return {
      records,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    };
  }

  /**
   * Update overtime request (status, notes, approver)
   */
  async update(id, data) {
    return await prisma.overtime.update({
      where: { id },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.approvedById !== undefined && { approvedById: data.approvedById }),
        ...(data.approvedAt !== undefined && { approvedAt: data.approvedAt }),
        ...(data.startTime && { startTime: data.startTime }),
        ...(data.endTime && { endTime: data.endTime }),
        ...(data.durationHours !== undefined && { durationHours: data.durationHours }),
        ...(data.reason !== undefined && { reason: data.reason }),
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
        approvedBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
          },
        },
      },
    });
  }

  /**
   * Delete overtime request
   */
  async delete(id) {
    return await prisma.overtime.delete({
      where: { id },
    });
  }

  /**
   * Check for overlapping overtime requests
   */
  async findOverlapping(userId, startTime, endTime, excludeId = null) {
    return await prisma.overtime.findFirst({
      where: {
        userId,
        status: { in: ['PENDING', 'APPROVED'] },
        ...(excludeId && { id: { not: excludeId } }),
        OR: [
          {
            startTime: { lte: endTime },
            endTime: { gte: startTime },
          },
        ],
      },
    });
  }

  /**
   * Get overtime summary for a user in a month
   */
  async getMonthlySummary(userId, month) {
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

    const result = await prisma.overtime.aggregate({
      where: {
        userId: parseInt(userId),
        status: 'APPROVED',
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        durationHours: true,
      },
      _count: true,
    });

    return {
      totalHours: result._sum.durationHours || 0,
      totalRequests: result._count,
    };
  }
}

module.exports = new OvertimeRepository();