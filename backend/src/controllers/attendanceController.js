const attendanceService = require('../services/attendanceService');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../utils/response');
const { sendPushToUser } = require('../services/pushService');
const { sendAttendanceReport } = require('../services/whatsappService');
const prisma = require('../utils/database');

class AttendanceController {
  /**
   * Clock in
   * POST /api/v1/attendance/clock-in
   */
  clockIn = asyncHandler(async (req, res) => {
    const { location, notes } = req.body;
    const userId = req.user.id;
    // With memoryStorage, files are in memory (buffer) not saved to disk.
    // Convert to base64 data URI for storage in DB (Vercel-compatible, no disk writes).
    const photo = req.file
      ? `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
      : null;

    const result = await attendanceService.clockIn({
      userId,
      location,
      photo,
      notes
    });

    // Fire-and-forget push notification (non-blocking)
    if (result.noScheduleWarning) {
      sendPushToUser(
        `Absensi masuk kamu sudah tercatat pada ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}.`,
        { url: '/attendance' }
      ).catch(console.error);
    }

    return successResponse(res, 201, result, 'Clocked in successfully');
  });

  /**
   * Clock out
   * POST /api/v1/attendance/clock-out
   */
  clockOut = asyncHandler(async (req, res) => {
    const { location, notes } = req.body;
    const userId = req.user.id;
    const photo = req.file
      ? `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
      : null;

    const result = await attendanceService.clockOut({
      userId,
      location,
      photo,
      notes
    });

    return successResponse(res, 200, result, 'Clocked out successfully');
  });

  /**
   * Get attendance history
   * GET /api/v1/attendance
   */
  getAll = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { startDate, endDate, page, limit } = req.query;

    const result = await attendanceService.getAll({
      userId,
      startDate,
      endDate,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10
    });

    return successResponse(res, 200, result);
  });

  /**
   * Get attendance history
   * GET /api/v1/attendance/history
   */
  getHistory = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { startDate, endDate, page, limit } = req.query;

    const result = await attendanceService.getAll({
      userId,
      startDate,
      endDate,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10
    });

    return successResponse(res, 200, result);
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
   * Get monthly summary
   * GET /api/v1/attendance/monthly-summary
   */
  getMonthlySummary = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { month } = req.query; // YYYY-MM format

    const result = await attendanceService.getMonthlySummary(userId, month);

    return successResponse(res, 200, result);
  });

  /**
   * Get monthly report
   * GET /api/v1/attendance/report/monthly
   */
  getMonthlyReport = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { month } = req.query; // YYYY-MM format

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