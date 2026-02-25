const adminService = require('../services/adminService');
const attendanceService = require('../services/attendanceService');
const userRepository = require('../repositories/userRepository');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../utils/response');

class AdminController {
  /**
   * List all users
   * GET /api/v1/admin/users
   */
  listUsers = asyncHandler(async (req, res) => {
    const result = await userRepository.list(req.query);

    return successResponse(res, 200, result);
  });

  /**
   * Create new user
   * POST /api/v1/admin/users
   */
  createUser = asyncHandler(async (req, res) => {
    const result = await adminService.createUser(req.body);

    return successResponse(res, 201, result, 'User created successfully');
  });

  /**
   * Get user by ID
   * GET /api/v1/admin/users/:id
   */
  getUserById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await userRepository.findById(parseInt(id));

    if (!user) {
      return successResponse(res, 404, null, 'User not found');
    }

    return successResponse(res, 200, user);
  });

  /**
   * Update user
   * PUT /api/v1/admin/users/:id
   */
  updateUser = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await adminService.updateUser(parseInt(id), req.body);

    return successResponse(res, 200, result, 'User updated successfully');
  });

  /**
   * Deactivate user
   * DELETE /api/v1/admin/users/:id
   */
  deleteUser = asyncHandler(async (req, res) => {
    const { id } = req.params;

    await adminService.deleteUser(parseInt(id));

    return successResponse(res, 200, null, 'User deleted successfully');
  });

  /**
   * Get all attendance records
   * GET /api/v1/admin/attendance
   */
  getAllAttendance = asyncHandler(async (req, res) => {
    const result = await attendanceService.getAll(req.query);

    return successResponse(res, 200, result);
  });

  /**
   * Update attendance record
   * PUT /api/v1/admin/attendance/:id
   */
  updateAttendance = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await attendanceService.updateAdmin(parseInt(id), req.body);

    return successResponse(res, 200, result, 'Attendance record updated');
  });

  /**
   * Delete attendance record
   * DELETE /api/v1/admin/attendance/:id
   */
  deleteAttendance = asyncHandler(async (req, res) => {
    const { id } = req.params;

    await attendanceService.deleteAttendance(parseInt(id));

    return successResponse(res, 200, null, 'Attendance record deleted successfully');
  });

  /**
   * Get daily attendance report
   * GET /api/v1/admin/reports/daily
   */
  getDailyReport = asyncHandler(async (req, res) => {
    const { date } = req.query;
    const queryDate = date || new Date().toLocaleDateString('en-CA');

    const result = await attendanceService.getDailySummary(queryDate);

    return successResponse(res, 200, result);
  });

  /**
   * Get monthly attendance report
   * GET /api/v1/admin/reports/monthly
   */
  getMonthlyReport = asyncHandler(async (req, res) => {
    const result = await attendanceService.getMonthlyReport(req.query);

    return successResponse(res, 200, result);
  });

  /**
   * Export attendance as CSV
   * GET /api/v1/admin/reports/export
   */
  exportReport = asyncHandler(async (req, res) => {
    const result = await attendanceService.exportToCsv(req.query);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);

    return res.send(result.content);
  });

  /**
   * Get system configuration
   * GET /api/v1/admin/config
   */
  getConfig = asyncHandler(async (req, res) => {
    const result = await adminService.getConfig();

    return successResponse(res, 200, result);
  });

  /**
   * Update system configuration
   * PUT /api/v1/admin/config
   */
  updateConfig = asyncHandler(async (req, res) => {
    const result = await adminService.updateConfig(req.body);

    return successResponse(res, 200, result, 'Configuration updated successfully');
  });
  /**
   * Get dashboard statistics
   * GET /api/v1/admin/dashboard-stats
   */
  getDashboardStats = asyncHandler(async (req, res) => {
    // Use local time for "Today" to match user's perspective
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

    // Parallelize queries for performance
    const [attendanceSummary, pendingLeaves] = await Promise.all([
      attendanceService.getDailySummary(today),
      require('../services/leaveService').countPendingLeaves(),
    ]);

    // Get 5 most recent activities (clock-ins)
    // We reuse attendanceService.getAll but with limit 5
    const recentActivity = await attendanceService.getAll({
      page: 1,
      limit: 5,
      date: today,
    });

    return successResponse(res, 200, {
      summary: attendanceSummary.summary,
      pendingLeaves,
      recentActivity: recentActivity.records,
    });
  });
}

module.exports = new AdminController();
