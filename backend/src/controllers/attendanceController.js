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
    // With memoryStorage, files are in memory (buffer) not saved to disk
    const photo = req.file ? `selfie-${Date.now()}.${req.file.originalname.split('.').pop()}` : null;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const result = await attendanceService.clockIn(userId, location, notes, photo, ipAddress);

    // Fire-and-forget push notification (non-blocking)
    sendPushToUser(
      userId,
      '✅ Absensi Masuk Berhasil',
      `Absensi masuk kamu sudah tercatat pada ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}.`,
      { url: '/attendance' }
    ).catch(() => { });

    // Fire-and-forget WhatsApp report (non-blocking)
    // Check if WA reporting is enabled via config
    try {
      // Ambil config grup WA dari systemConfig (jika diset via admin)
      const waConfig = await prisma.systemConfig.findMany({
        where: { key: { in: ['waGroupTarget', 'waToken', 'waSendOnClockIn'] } }
      });
      const waCfg = Object.fromEntries(waConfig.map(c => [c.key, c.value]));

      // Ambil info shift pegawai
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true, employeeId: true, shift: { select: { name: true, startTime: true } } }
      });

      // Cek apakah fitur WA aktif (default: aktif jika token ada)
      const waEnabled = waCfg.waSendOnClockIn !== 'false';

      if (waEnabled) {
        // Override token jika diset via admin config
        if (waCfg.waToken) process.env.FONNTE_TOKEN = waCfg.waToken;
        const target = waCfg.waGroupTarget || process.env.WA_GROUP_TARGET;

        sendAttendanceReport({
          employeeName: user?.fullName || req.user.fullName || 'Pegawai',
          employeeId: user?.employeeId || '',
          clockInTime: result.clockIn || new Date(),
          shiftName: user?.shift?.name || '',
          shiftStart: user?.shift?.startTime || '',
          status: result.status || 'PRESENT',
          notes: notes || '',
        }, target).catch((err) => console.error('[WhatsApp] Error:', err));
      }
    } catch (waErr) {
      console.error('[WhatsApp] Config fetch error:', waErr.message);
    }

    return successResponse(res, 201, result, 'Clocked in successfully');
  });

  /**
   * Clock out
   * POST /api/v1/attendance/clock-out
   */
  clockOut = asyncHandler(async (req, res) => {
    const { location } = req.body;
    const userId = req.user.id;
    // With memoryStorage, files are in memory (buffer) not saved to disk
    const photo = req.file ? `selfie-${Date.now()}.${req.file.originalname.split('.').pop()}` : null;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const result = await attendanceService.clockOut(userId, location, photo, ipAddress);

    // Fire-and-forget push notification (non-blocking)
    sendPushToUser(
      userId,
      '🏁 Absensi Pulang Berhasil',
      `Absensi pulang tercatat. Total jam kerja: ${result.totalHours} jam.`,
      { url: '/attendance' }
    ).catch(() => { });

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
