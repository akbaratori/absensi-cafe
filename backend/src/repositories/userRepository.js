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
        shiftId: true,
        shift: {
          select: { id: true, name: true, startTime: true, endTime: true },
        },
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
        shiftId: true,
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
        shiftId: true,
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
        ...(data.role !== undefined && { role: data.role }),
        ...(data.shiftId !== undefined && { shiftId: data.shiftId === null || data.shiftId === '' ? null : !isNaN(parseInt(data.shiftId)) ? parseInt(data.shiftId) : null }),
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
   * Ambil banyak user dalam SATU query (dipakai aksi massal).
   *
   * Dipisah dari `list()` karena aksi massal butuh lookup berdasarkan daftar id
   * tanpa pagination — kalau memakai `findById()` berulang, 100 pengguna berarti
   * 100 query ke DB remote dan request-nya bisa menyentuh batas waktu function.
   */
  async findManyByIds(ids) {
    if (!ids || ids.length === 0) return [];

    return await prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        department: true,
        isActive: true,
      },
    });
  }

  /**
   * Hapus banyak user sekaligus dengan SATU perintah (fast path).
   *
   * Hanya boleh dipakai kalau tidak ada satu pun user di daftar yang ditahan FK
   * — satu saja yang ditahan membuat seluruh perintah gagal (MySQL mem-rollback
   * satu statement DELETE secara utuh). Cascade untuk attendance/leave/schedule/
   * notifikasi/subscription/roster sudah `onDelete: Cascade` di schema, jadi DB
   * yang membersihkannya.
   */
  async deleteManyByIds(ids) {
    if (!ids || ids.length === 0) return { count: 0 };

    return await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  /**
   * Hitung user aktif per role — dipakai untuk menjaga minimal satu ADMIN.
   */
  async countByRole(role) {
    return await prisma.user.count({ where: { role } });
  }

  /**
   * List users with pagination and filters
   */
  async list(options = {}) {
    const { page, limit, role, status, search } = options;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where = {
      ...(role && { role }),
      ...(status === 'active' ? { isActive: true } : status === 'inactive' ? { isActive: false } : {}),
      ...(search && {
        OR: [
          { username: { contains: search } },
          { fullName: { contains: search } },
          { email: { contains: search } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limitNum,
        select: {
          id: true,
          username: true,
          fullName: true,
          email: true,
          role: true,
          employeeId: true,
          shiftId: true,
          shift: {
            select: { id: true, name: true, startTime: true, endTime: true },
          },
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
        page: pageNum,
        limit: limitNum,
        totalRecords: total,
        totalPages: Math.ceil(total / limitNum),
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
