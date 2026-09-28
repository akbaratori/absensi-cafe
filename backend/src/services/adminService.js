const { ErrorCodes } = require('../utils/AppError');
const userRepository = require('../repositories/userRepository');
const configRepository = require('../repositories/configRepository');
const authService = require('./authService');
const prisma = require('../utils/database');
const { configCache } = require('../utils/cache');
const auditService = require('./auditService');

class AdminService {
  /**
   * Create new user
   */
  async createUser(data) {
    // Check if username already exists
    const existingUser = await userRepository.findByUsername(data.username);

    if (existingUser) {
      throw ErrorCodes.USER_ERRORS.DUPLICATE_USERNAME;
    }

    // Sanitize optional fields
    const email = data.email === '' ? null : data.email;
    const employeeId = data.employeeId === '' ? null : data.employeeId;

    // Check if email already exists (if provided)
    if (email) {
      const userWithEmail = await prisma.user.findFirst({
        where: { email },
      });

      if (userWithEmail) {
        throw ErrorCodes.USER_ERRORS.DUPLICATE_EMAIL;
      }
    }

    // Hash password
    const passwordHash = await authService.hashPassword(data.password);

    // Create user
    const user = await userRepository.create({
      username: data.username,
      passwordHash,
      fullName: data.fullName,
      email,
      role: data.role || 'EMPLOYEE',
      shiftId: data.shiftId,
      hourlyRate: data.hourlyRate,
      employeeId,
    });

    // Audit trail
    await auditService.logUserChange(null, 'CREATE', user.id, { username: data.username, fullName: data.fullName, role: data.role });

    return user;
  }

  /**
   * Update user
   */
  async updateUser(id, data, adminId = null) {
    // Check if user exists
    const user = await userRepository.findById(id);

    if (!user) {
      throw ErrorCodes.USER_ERRORS.USER_NOT_FOUND;
    }

    // Prevent deactivating an ADMIN account (keeps at least one active admin).
    if (
      data.isActive === false &&
      (user.role === 'ADMIN' || (data.role && typeof data.role === 'string' && data.role.toUpperCase() === 'ADMIN'))
    ) {
      throw new Error('Akun admin tidak dapat dinonaktifkan. Gunakan akun admin lain atau hubungi developer.');
    }

    // Prevent changing an ADMIN user's role to a non-admin role (keeps at least one admin).
    if (
      user.role === 'ADMIN' &&
      data.role &&
      typeof data.role === 'string' &&
      data.role.toUpperCase() !== 'ADMIN'
    ) {
      throw new Error('Role akun admin tidak dapat diubah menjadi non-admin.');
    }

    // Check if username is taken by ANOTHER user (exclude current user)
    if (data.username) {
      const existingUser = await prisma.user.findFirst({
        where: {
          username: data.username,
          id: { not: id }, // Exclude current user being edited
        },
      });
      if (existingUser) {
        throw ErrorCodes.USER_ERRORS.DUPLICATE_USERNAME;
      }
    }

    // Sanitize email
    const email = data.email === '' ? null : data.email;

    // Check if email is taken by ANOTHER user (exclude current user)
    if (email) {
      const userWithEmail = await prisma.user.findFirst({
        where: {
          email,
          id: { not: id }, // Exclude current user being edited
        },
      });
      if (userWithEmail) {
        throw ErrorCodes.USER_ERRORS.DUPLICATE_EMAIL;
      }
    }

    // Sanitize employeeId
    const employeeId = data.employeeId === '' ? null : data.employeeId;
    const updateData = { ...data };
    if (data.employeeId !== undefined) {
      updateData.employeeId = employeeId;
    }
    if (email !== undefined) {
      updateData.email = email;
    }

    // Handle password update if provided
    if (data.password) {
      updateData.passwordHash = await authService.hashPassword(data.password);
      delete updateData.password;
    }

    // Update user
    try {
      const updatedUser = await userRepository.update(id, updateData);

      // Audit trail
      await auditService.logUserChange(adminId, 'UPDATE', id, {
        before: { fullName: user.fullName, role: user.role, shiftId: user.shiftId, isActive: user.isActive },
        after: updateData,
      });

      return updatedUser;
    } catch (error) {
      if (error.code === 'P2002') {
        const target = error.meta?.target;
        if (target?.includes('username')) throw ErrorCodes.USER_ERRORS.DUPLICATE_USERNAME;
        if (target?.includes('email')) throw ErrorCodes.USER_ERRORS.DUPLICATE_EMAIL;
        if (target?.includes('employeeId') || target === 'users_employee_id_key') throw ErrorCodes.USER_ERRORS.DUPLICATE_EMPLOYEE_ID;
      }
      throw error;
    }
  }

  /**
   * Delete user (Hard Delete)
   */
  async deleteUser(id, adminId = null) {
    const user = await userRepository.findById(id);

    if (!user) {
      throw ErrorCodes.USER_ERRORS.USER_NOT_FOUND;
    }

    // Prevent deleting the main admin/yourself if needed?
    // For now, let's implement hard delete
    await userRepository.delete(id);

    // Audit trail
    await auditService.logUserChange(adminId, 'DELETE', id, {
      deletedUser: { username: user.username, fullName: user.fullName, role: user.role },
    });

    return true;
  }

  /**
   * Hapus BANYAK pengguna sekaligus (hard delete).
   *
   * Dipakai tombol "Hapus terpilih" di halaman Users. Aturan pengamanannya
   * sama dengan hapus satuan, ditambah penjagaan khusus aksi massal:
   *  - akun sendiri tidak boleh ikut terhapus (admin bisa mengunci dirinya);
   *  - sisa minimal satu akun ADMIN wajib ada, dihitung setelah dikurangi
   *    daftar yang akan dihapus (bukan sekadar "ada admin lain di daftar");
   *  - id yang sudah tidak ada di DB dilewati tanpa error (bukan kegagalan).
   *
   * Eksekusinya dua tahap: coba SATU perintah `deleteMany` dulu. Kalau ada satu
   * saja user yang masih ditahan foreign key (mis. `backup_assignments`, yang
   * tidak punya onDelete Cascade), seluruh perintah gagal; pada percobaan kedua
   * tiap user dihapus sendiri-sendiri supaya sisanya tetap terhapus dan yang
   * gagal dilaporkan per user ke UI.
   */
  async bulkDeleteUsers(ids = [], adminId = null) {
    const uniqueIds = [...new Set(ids.map((id) => parseInt(id, 10)).filter(Number.isInteger))];

    if (uniqueIds.length === 0) {
      throw ErrorCodes.USER_ERRORS.NO_USERS_SELECTED;
    }

    if (adminId && uniqueIds.includes(parseInt(adminId, 10))) {
      throw ErrorCodes.USER_ERRORS.CANNOT_DELETE_SELF;
    }

    const users = await userRepository.findManyByIds(uniqueIds);

    // Yang benar-benar dihapus = id yang masih ada di DB. Id yang tidak ketemu
    // (mis. sudah dihapus di tab lain) dilaporkan sebagai skipped, bukan error —
    // admin tidak perlu memikirkan data yang sudah hilang.
    const foundIds = users.map((u) => u.id);
    const targets = uniqueIds.filter((id) => foundIds.includes(id));
    const skippedIds = uniqueIds.filter((id) => !foundIds.includes(id));

    const adminTargets = targets.filter((id) => users.find((u) => u.id === id)?.role === 'ADMIN');

    if (adminTargets.length > 0) {
      const totalAdmins = await userRepository.countByRole('ADMIN');
      if (totalAdmins - adminTargets.length < 1) {
        throw ErrorCodes.USER_ERRORS.CANNOT_DELETE_LAST_ADMIN;
      }
    }

    const deleted = [];
    const failed = [];

    // Tahap 1: satu perintah untuk semua. Dilewati kalau tidak ada target nyata
    // (semua id sudah hilang) supaya tidak mengirim DELETE kosong ke DB.
    if (targets.length > 0) {
      try {
        await userRepository.deleteManyByIds(targets);
        targets.forEach((id) => {
          const user = users.find((u) => u.id === id);
          deleted.push({ id, username: user?.username, fullName: user?.fullName });
        });
      } catch (bulkError) {
        // Tahap 2: ada yang ditahan FK — hapus satu per satu supaya sisanya jalan.
        for (const id of targets) {
          const user = users.find((u) => u.id === id);
          try {
            await userRepository.delete(id);
            deleted.push({ id, username: user?.username, fullName: user?.fullName });
          } catch (err) {
            failed.push({
              id,
              username: user?.username,
              fullName: user?.fullName,
              reason: err.code === 'P2003'
                ? 'Masih dipakai data lain (mis. riwayat backup) sehingga tidak dapat dihapus'
                : err.message,
            });
          }
        }

        if (deleted.length === 0) {
          // Semua gagal: jangan menelan errornya, admin harus tahu penyebabnya.
          throw bulkError;
        }
      }
    }

    if (deleted.length > 0) {
      await auditService.logUserChange(adminId, 'BULK_DELETE', deleted.map((u) => u.id).join(','), {
        deletedCount: deleted.length,
        deletedUsers: deleted,
        requestedCount: uniqueIds.length,
      });
    }

    return {
      requestedCount: uniqueIds.length,
      deletedCount: deleted.length,
      deleted,
      skippedIds,
      failed,
    };
  }

  /**
   * Get system configuration
   */
  async getConfig() {
    // Try cache first
    const cacheKey = 'system:config';
    const cached = configCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const configs = await configRepository.getAll();

    // Return with defaults for missing keys
    const result = {
      workStartTime: configs.workStartTime || '08:00',
      workEndTime: configs.workEndTime || '17:00',
      lateGraceMinutes: parseInt(configs.lateGraceMinutes || '15', 10),
      autoClockoutHours: parseInt(configs.autoClockoutHours || '10', 10),
      cafeLatitude: configs.cafeLatitude || '-5.1687398658898145',
      cafeLongitude: configs.cafeLongitude || '119.4584722877303',
      radiusMeters: parseInt(configs.radiusMeters || '100', 10),
    };

    // Cache the result
    configCache.set(cacheKey, result);

    return result;
  }

  /**
   * Update system configuration
   */
  async updateConfig(updates, adminId = null) {
    // Get current config before update for audit
    const beforeConfig = await this.getConfig();

    const configMap = {};

    if (updates.workStartTime) configMap.workStartTime = updates.workStartTime;
    if (updates.workEndTime) configMap.workEndTime = updates.workEndTime;
    if (updates.lateGraceMinutes !== undefined) configMap.lateGraceMinutes = updates.lateGraceMinutes.toString();
    if (updates.autoClockoutHours !== undefined) configMap.autoClockoutHours = updates.autoClockoutHours.toString();

    // Location settings
    if (updates.cafeLatitude !== undefined) configMap.cafeLatitude = updates.cafeLatitude.toString();
    if (updates.cafeLongitude !== undefined) configMap.cafeLongitude = updates.cafeLongitude.toString();
    if (updates.radiusMeters !== undefined) configMap.radiusMeters = updates.radiusMeters.toString();

    await configRepository.setMany(configMap);

    // Invalidate cache
    configCache.delete('system:config');

    const afterConfig = await this.getConfig();

    // Audit trail
    await auditService.logConfigChange(adminId, { before: beforeConfig, after: afterConfig });

    return afterConfig;
  }
}

module.exports = new AdminService();
