const adminService = require('../services/adminService');
const attendanceService = require('../services/attendanceService');
const userRepository = require('../repositories/userRepository');
const prisma = require('../utils/database');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../utils/response');
const { sendPushToAll } = require('../services/pushService');
const auditService = require('../services/auditService');

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

    const result = await adminService.updateUser(parseInt(id), req.body, req.user.id);

    return successResponse(res, 200, result, 'User updated successfully');
  });

  /**
   * Deactivate user
   * DELETE /api/v1/admin/users/:id
   */
  deleteUser = asyncHandler(async (req, res) => {
    const { id } = req.params;

    await adminService.deleteUser(parseInt(id), req.user.id);

    return successResponse(res, 200, null, 'User deleted successfully');
  });

  /**
   * Get next available Employee ID
   * GET /api/v1/admin/users/next-id
   */
  getNextEmployeeId = asyncHandler(async (req, res) => {
    const role = req.query.role || 'EMPLOYEE';
    const prefix = role === 'ADMIN' ? 'ADM' : 'EMP';

    // Find all employee IDs with this prefix
    const users = await prisma.user.findMany({
      where: {
        employeeId: { startsWith: prefix },
      },
      select: { employeeId: true },
      orderBy: { employeeId: 'desc' },
    });

    // Extract numbers and find the max
    let maxNum = 0;
    users.forEach((u) => {
      if (u.employeeId) {
        // Support EMP0001, EMP-0001, EMP001 etc.
        const match = u.employeeId.match(/\d+$/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    });

    const nextNum = maxNum + 1;
    const nextId = `${prefix}${String(nextNum).padStart(4, '0')}`;

    // Also return list of existing IDs for reference
    const existingIds = users.map((u) => u.employeeId).filter(Boolean).sort();

    return successResponse(res, 200, { nextId, existingIds });
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

    const result = await attendanceService.updateAdmin(parseInt(id), req.body, req.user.id);

    return successResponse(res, 200, result, 'Attendance record updated');
  });

  /**
   * Delete attendance record
   * DELETE /api/v1/admin/attendance/:id
   */
  deleteAttendance = asyncHandler(async (req, res) => {
    const { id } = req.params;

    await attendanceService.deleteAttendance(parseInt(id), req.user.id);

    return successResponse(res, 200, null, 'Attendance record deleted successfully');
  });

  /**
   * Delete ALL attendance records (for testing/reset)
   * DELETE /api/v1/admin/attendance/all
   */
  deleteAllAttendance = asyncHandler(async (req, res) => {
    const result = await attendanceService.deleteAllAttendance();

    return successResponse(res, 200, result, `Berhasil menghapus ${result.deleted} data absensi`);
  });

  /**
   * Get daily attendance report
   * GET /api/v1/admin/reports/daily
   */
  getDailyReport = asyncHandler(async (req, res) => {
    const { date } = req.query;
    // Use WITA for default "today" instead of server local time
    const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;
    const nowWITA = new Date(Date.now() + WITA_OFFSET_MS);
    const queryDate = date || nowWITA.toISOString().slice(0, 10);

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
    const result = await adminService.updateConfig(req.body, req.user.id);

    return successResponse(res, 200, result, 'Configuration updated successfully');
  });
  /**
   * Get dashboard statistics
   * GET /api/v1/admin/dashboard-stats
   */
  getDashboardStats = asyncHandler(async (req, res) => {
    // Use WITA (UTC+8) for "Today" to match cafe timezone
    const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;
    const nowWITA = new Date(Date.now() + WITA_OFFSET_MS);
    const today = nowWITA.toISOString().slice(0, 10); // YYYY-MM-DD in WITA

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

  /**
   * Broadcast push notification to all users
   * POST /api/v1/admin/notifications/broadcast
   */
  broadcastNotification = asyncHandler(async (req, res) => {
    const { title, body, data } = req.body;

    if (!title || !body) {
      return res.status(400).json({ success: false, message: 'Title and body are required' });
    }

    // Fire-and-forget push notification (non-blocking)
    sendPushToAll(title, body, data).catch(() => { });

    return successResponse(res, 200, null, 'Push notification broadcasted successfully');
  });
  /**
   * Get audit logs
   * GET /api/v1/admin/audit-logs
   */
  getAuditLogs = asyncHandler(async (req, res) => {
    const filters = req.query; // page, limit, userId, action, entityType, startDate, endDate
    const result = await auditService.getLogs(filters);
    return successResponse(res, 200, result);
  });

  /**
   * Get public holidays
   * GET /api/v1/admin/holidays
   */
  getHolidays = asyncHandler(async (req, res) => {
    const { year } = req.query;
    const where = {};
    if (year) {
      where.date = {
        gte: new Date(`${year}-01-01`),
        lte: new Date(`${year}-12-31`),
      };
    }
    const holidays = await prisma.publicHoliday.findMany({ where, orderBy: { date: 'asc' } });
    return successResponse(res, 200, holidays);
  });

  /**
   * Create public holiday
   * POST /api/v1/admin/holidays
   */
  createHoliday = asyncHandler(async (req, res) => {
    const { date, name, description } = req.body;
    if (!date || !name) {
      return res.status(400).json({ success: false, message: 'Date and name are required' });
    }
    const holiday = await prisma.publicHoliday.create({
      data: { date: new Date(date), name, description: description || null }
    });
    return successResponse(res, 201, holiday, 'Hari libur berhasil ditambahkan');
  });

  /**
   * Delete public holiday
   * DELETE /api/v1/admin/holidays/:id
   */
  deleteHoliday = asyncHandler(async (req, res) => {
    const { id } = req.params;
    await prisma.publicHoliday.delete({ where: { id: parseInt(id) } });
    return successResponse(res, 200, null, 'Hari libur berhasil dihapus');
  });
}

module.exports = new AdminController();
