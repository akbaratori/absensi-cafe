const attendanceService = require('../services/attendanceService');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../utils/response');

class AttendanceController {
  /**
   * Clock in
   * POST /api/v1/attendance/clock-in
   */
  clockIn = asyncHandler(async (req, res) => {
    const { location, notes } = req.body;
    const userId = req.user.id;
    const photo = req.file ? req.file.path.replace(/\\/g, '/') : null;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const result = await attendanceService.clockIn(userId, location, notes, photo, ipAddress);

    return successResponse(res, 201, result, 'Clocked in successfully');
  });

  /**
   * Clock out
   * POST /api/v1/attendance/clock-out
   */
  clockOut = asyncHandler(async (req, res) => {
    const { location } = req.body;
    const userId = req.user.id;
    const photo = req.file ? req.file.path.replace(/\\/g, '/') : null;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const result = await attendanceService.clockOut(userId, location, photo, ipAddress);

    return successResponse(
      res,
      200,
      result,
      `Clocked out successfully. Total hours: ${result.totalHours}`
    );
  });

  /**
   * Get today's attendance
   * GET /api/v1/attendance/today
   */
  getToday = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const result = await attendanceService.getToday(userId);

    return successResponse(res, 200, result);
  });

  /**
   * Get attendance history
   * GET /api/v1/attendance/history
   */
  getHistory = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const result = await attendanceService.getHistory(userId, req.query);

    return successResponse(res, 200, result);
  });

  /**
   * Get monthly summary for dashboard
   * GET /api/v1/attendance/monthly-summary
   */
  getMonthlySummary = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const month = req.query.month || new Date().toISOString().slice(0, 7); // YYYY-MM format

    const result = await attendanceService.getMonthlyReport({ userId, month });

    return successResponse(res, 200, result);
  });

  /**
   * Get specific attendance record
   * GET /api/v1/attendance/:id
   */
  getById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const role = req.user.role;

    const result = await attendanceService.getById(id, userId, role);

    return successResponse(res, 200, result);
  });
}

module.exports = new AttendanceController();
