const prisma = require('../utils/database');

class UserRepository {
  /**
   * Find user by ID
   */
  async findById(id) {
    return await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        role: true,
        shift: true,
        employeeId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
        hourlyRate: true,
        offDay: true,
        department: true,
      },
    });
  }

  /**
   * Find user by ID with password hash
   */
  async findByIdWithPassword(id) {
    return await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        passwordHash: true,
        fullName: true,
        email: true,
        role: true,
        shift: true,
        employeeId: true,
        isActive: true,
      },
    });
  }

  /**
   * Find user by username
   */
  async findByUsername(username) {
    return await prisma.user.findUnique({
      where: { username },
    });
  }

  /**
   * Find user with password hash (for authentication)
   */
  async findByUsernameWithPassword(username) {
    return await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        passwordHash: true,
        fullName: true,
        email: true,
        role: true,
        shift: true,
        employeeId: true,
        isActive: true,
      },
    });
  }

  /**
   * Create new user
   */
  async create(data) {
    return await prisma.user.create({
      data: {
        username: data.username,
        passwordHash: data.passwordHash,
        fullName: data.fullName,
        email: data.email,
        role: data.role || 'EMPLOYEE',
        // shift: data.shift || 'SHIFT_1', // Deprecated
        shiftId: data.shiftId ? parseInt(data.shiftId) : null,
        hourlyRate: data.hourlyRate ? parseInt(data.hourlyRate) : 0,
        employeeId: data.employeeId,
        offDay: data.offDay !== undefined ? parseInt(data.offDay) : 0,
        department: data.department || 'BAR',
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        role: true,
        employeeId: true,
        isActive: true,
        createdAt: true,
        hourlyRate: true,
        offDay: true,
      },
    });
  }

  /**
   * Update user
   */
  async update(id, data) {
    return await prisma.user.update({
      where: { id },
      data: {
        ...(data.username && { username: data.username }),
        ...(data.passwordHash && { passwordHash: data.passwordHash }),
        ...(data.fullName && { fullName: data.fullName }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.role && { role: data.role }),
        ...(data.shiftId && !isNaN(parseInt(data.shiftId)) && { shiftId: parseInt(data.shiftId) }),
        ...(data.hourlyRate !== undefined && !isNaN(parseInt(data.hourlyRate)) && { hourlyRate: parseInt(data.hourlyRate) }),
        ...(data.offDay !== undefined && !isNaN(parseInt(data.offDay)) && { offDay: parseInt(data.offDay) }),
        ...(data.department && { department: data.department }),

        ...(data.employeeId !== undefined && { employeeId: data.employeeId }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        role: true,
        employeeId: true,
        isActive: true,
        updatedAt: true,
        hourlyRate: true,
        offDay: true,
        department: true,
      },
    });
  }

  /**
   * Delete user (HARD DELETE)
   */
  async delete(id) {
    return await prisma.user.delete({
      where: { id },
    });
  }

  /**
   * Soft delete user (deactivate)
   */
  async deactivate(id) {
    return await prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: {
        id: true,
        username: true,
        isActive: true,
      },
    });
  }

  /**
   * List users with pagination and filters
   */
  async list(options = {}) {
    const { page = 1, limit = 20, role, status, search } = options;

    const skip = (page - 1) * limit;

    const where = {
      ...(role && { role }),
      ...(status === 'active' ? { isActive: true } : status === 'inactive' ? { isActive: false } : {}),
      ...(search && {
        OR: [
          { username: { contains: search, mode: 'insensitive' } },
          { fullName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          username: true,
          fullName: true,
          email: true,
          role: true,
          employeeId: true,
          shiftId: true,
          shift: true,
          isActive: true,
          hourlyRate: true,
          createdAt: true,
          lastLoginAt: true,
          offDay: true,
          department: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users,
      pagination: {
        page,
        limit,
        totalRecords: total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(id) {
    await prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }
}

module.exports = new UserRepository();
