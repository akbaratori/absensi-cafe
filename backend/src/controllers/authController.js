const authService = require('../services/authService');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../utils/response');

class AuthController {
  /**
   * Login
   * POST /api/v1/auth/login
   */
  login = asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    const result = await authService.login(username, password);

    return successResponse(res, 200, result);
  });

  /**
   * Refresh token
   * POST /api/v1/auth/refresh
   */
  refresh = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    const result = await authService.refresh(refreshToken);

    return successResponse(res, 200, result);
  });

  /**
   * Logout (client-side token invalidation)
   * POST /api/v1/auth/logout
   */
  logout = asyncHandler(async (req, res) => {
    // In a stateless JWT system, logout is handled client-side
    // by deleting the token. If using refresh tokens in a DB,
    // you would invalidate them here.

    return successResponse(res, 200, null, 'Logged out successfully');
  });

  /**
   * Get current user info
   * GET /api/v1/auth/me
   */
  me = asyncHandler(async (req, res) => {
    // req.user is attached by authenticate middleware
    return successResponse(res, 200, req.user);
  });

  /**
   * Get colleagues
   * GET /api/v1/auth/colleagues
   */
  getColleagues = asyncHandler(async (req, res) => {
    try {
      // Assuming 'users' should be fetched from a service
      const users = await authService.getColleagues(req.user.id); // Example: get colleagues for the current user
      return successResponse(res, 200, { users });
    } catch (error) {
      console.error('Error in getColleagues:', error);
      throw error;
    }
  });

  /**
   * Change Password
   * POST /api/v1/auth/change-password
   */
  changePassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id; // From middleware

    if (!oldPassword || !newPassword) {
      throw new Error('Old and New Password are required');
    }

    await authService.changePassword(userId, oldPassword, newPassword);

    return successResponse(res, 200, null, 'Password berhasil diubah');
  });
}

module.exports = new AuthController();
