const { ErrorCodes } = require('../utils/AppError');
const userRepository = require('../repositories/userRepository');
const configRepository = require('../repositories/configRepository');
const authService = require('./authService');
const prisma = require('../utils/database');
const { configCache } = require('../utils/cache');

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

    return user;
  }

  /**
   * Update user
   */
  async updateUser(id, data) {
    // Check if user exists
    const user = await userRepository.findById(id);

    if (!user) {
      throw ErrorCodes.USER_ERRORS.USER_NOT_FOUND;
    }

    // Check if username is being changed and if it's already taken
    if (data.username && data.username !== user.username) {
      const existingUser = await userRepository.findByUsername(data.username);
      if (existingUser) {
        throw ErrorCodes.USER_ERRORS.DUPLICATE_USERNAME;
      }
    }

    // Sanitize email
    const email = data.email === '' ? null : data.email;

    // Check if email is being changed and if it's already taken
    if (email !== undefined && email !== user.email) {
      if (email) {
        const userWithEmail = await prisma.user.findFirst({
          where: { email },
        });

        if (userWithEmail) {
          throw ErrorCodes.USER_ERRORS.DUPLICATE_EMAIL;
        }
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
      return updatedUser;
    } catch (error) {
      if (error.code === 'P2002' && (error.meta?.target === 'users_employee_id_key' || error.meta?.target?.includes('employeeId'))) {
        throw ErrorCodes.USER_ERRORS.DUPLICATE_EMPLOYEE_ID;
      }
      throw error;
    }
  }

  /**
   * Delete user (Hard Delete)
   */
  async deleteUser(id) {
    const user = await userRepository.findById(id);

    if (!user) {
      throw ErrorCodes.USER_ERRORS.USER_NOT_FOUND;
    }

    // Prevent deleting the main admin/yourself if needed?
    // For now, let's implement hard delete
    await userRepository.delete(id);

    return true;
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
  async updateConfig(updates) {
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

    return await this.getConfig();
  }
}

module.exports = new AdminService();
