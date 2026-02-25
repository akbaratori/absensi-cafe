const bcrypt = require('bcrypt');
const { ErrorCodes } = require('../utils/AppError');
const userRepository = require('../repositories/userRepository');
const { generateTokens, verifyToken } = require('../utils/jwt');
const config = require('../config');
const prisma = require('../utils/database');

const fs = require('fs');

class AuthService {
  /**
   * Login user
   */
  async login(username, password) {
    fs.appendFileSync('debug.log', `[${new Date().toISOString()}] Login attempt for: ${username}\n`);
    // Find user
    try {
      const user = await userRepository.findByUsernameWithPassword(username);
      fs.appendFileSync('debug.log', `[${new Date().toISOString()}] User found: ${user ? 'YES' : 'NO'}\n`);

      if (!user) {
        throw ErrorCodes.AUTH_ERRORS.INVALID_CREDENTIALS;
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      fs.appendFileSync('debug.log', `[${new Date().toISOString()}] Password valid: ${isPasswordValid}\n`);

      if (!isPasswordValid) {
        throw ErrorCodes.AUTH_ERRORS.INVALID_CREDENTIALS;
      }

      // Check if account is active
      if (!user.isActive) {
        throw ErrorCodes.AUTH_ERRORS.ACCOUNT_INACTIVE;
      }

      // Generate tokens
      const tokens = generateTokens({
        userId: user.id,
        role: user.role,
      });
      fs.appendFileSync('debug.log', `[${new Date().toISOString()}] Tokens generated\n`);

      // Update last login
      await userRepository.updateLastLogin(user.id);
      fs.appendFileSync('debug.log', `[${new Date().toISOString()}] Last login updated\n`);

      // Return user data without password
      const { passwordHash, ...userWithoutPassword } = user;

      return {
        ...tokens,
        expiresIn: config.jwt.accessTokenExpiry,
        user: userWithoutPassword,
      };
    } catch (err) {
      fs.appendFileSync('debug.log', `[${new Date().toISOString()}] Error in login: ${err.message}\n`);
      throw err;
    }
  }

  /**
   * Refresh access token
   */
  async refresh(refreshToken) {
    try {
      // Verify refresh token
      const decoded = verifyToken(refreshToken);

      if (decoded.type !== 'refresh') {
        throw ErrorCodes.AUTH_ERRORS.INVALID_TOKEN;
      }

      // Get user
      const user = await userRepository.findById(decoded.userId);

      if (!user || !user.isActive) {
        throw ErrorCodes.AUTH_ERRORS.INVALID_TOKEN;
      }

      // Generate new tokens
      const tokens = generateTokens({
        userId: user.id,
        role: user.role,
      });

      return tokens;
    } catch (error) {
      throw ErrorCodes.AUTH_ERRORS.INVALID_TOKEN;
    }
  }

  /**
   * Hash password
   */
  async hashPassword(password) {
    return await bcrypt.hash(password, config.bcrypt.saltRounds);
  }

  /**
   * Verify password
   */
  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Get colleagues (other employees)
   */
  async getColleagues(userId) {
    try {
      // Try cache first
      const { userDataCache } = require('../utils/cache');
      const cacheKey = `colleagues:${userId}`;
      const cached = userDataCache.get(cacheKey);

      if (cached) {
        return cached;
      }

      const colleagues = await prisma.user.findMany({
        where: {
          id: { not: userId },
          role: 'EMPLOYEE',
          isActive: true
        },
        select: {
          id: true,
          fullName: true,
          employeeId: true,
          shift: true
        }
      });

      // Cache the result (3 minutes TTL)
      userDataCache.set(cacheKey, colleagues, 180);

      return colleagues;
    } catch (error) {

      console.error('[AuthService] Error fetching colleagues:', error);
      throw error;
    }
  }

  /**
   * Change Password
   */
  async changePassword(userId, oldPassword, newPassword) {
    // 1. Get user
    const user = await userRepository.findByIdWithPassword(userId);
    if (!user) throw ErrorCodes.AUTH_ERRORS.INVALID_CREDENTIALS;

    // 2. Verify old password
    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);

    if (!isMatch) {
      const error = new Error('Password lama salah');
      error.code = 'INVALID_PASSWORD';
      error.statusCode = 400;
      throw error;
    }

    // 3. Hash new password
    const newHash = await this.hashPassword(newPassword);

    // 4. Update user
    await userRepository.update(userId, { passwordHash: newHash });

    return { message: 'Password berhasil diubah' };
  }
}



module.exports = new AuthService();
