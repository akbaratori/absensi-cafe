const { ErrorCodes, AppError } = require('../utils/AppError');
const attendanceRepository = require('../repositories/attendanceRepository');
const prisma = require('../utils/database');
const { getAttendanceConfig, calculateAttendanceStatus, calculateTotalHours, formatLocation, getTodayStart, getTodayEnd, formatStatus, parseStatus, calculateDistance } = require('../utils/attendanceHelpers');
const swapService = require('./swapService');
const offDayService = require('./offDayService');
const auditService = require('./auditService');
const scheduleService = require('./scheduleService');

class AttendanceService {
  /**
   * Clock in user
   */
  async clockIn(userId, location, notes, photo, ipAddress) {
    const today = new Date();
    const todayMidnightWITA = getTodayStart(today);
    const todayEndWITA = getTodayEnd(today);
    const existingRecord = await attendanceRepository.findTodayByUserId(userId);

    if (existingRecord) {
      throw ErrorCodes.ATTENDANCE_ERRORS.ALREADY_CHECKED_IN;
    }

    const config = await getAttendanceConfig(userId);
    const status = calculateAttendanceStatus(today, config);
    const lateMinutes = status === 'LATE' ? 15 : 0; // Simplified logic

    const todaySchedule = await scheduleService.getTodaySchedule(userId);
    const shiftInfo = `[Shift: ${config.workStartTime}-${config.workEndTime}]`;
    let finalNotes = notes ? `${notes} ${shiftInfo}` : shiftInfo;

    let noScheduleWarning = null;
    if (!todaySchedule) {
      noScheduleWarning = '⚠️ Tidak ada jadwal untuk hari ini. Clock-in tetap dicatat menggunakan shift default.';
      finalNotes = `${finalNotes} | [NoSchedule]`;
    }

    const record = await attendanceRepository.create({
      userId,
      date: todayMidnightWITA,
      clockIn: new Date(),
      clockInLocation: formatLocation(location),
      clockInPhoto: photo,
      clockInIp: ipAddress,
      status,
      lateMinutes,
      notes: finalNotes,
    });

    return { ...record, noScheduleWarning };
  }

  /**
   * Clock out user
   */
  async clockOut(userId, location, photo, ipAddress) {
    const existingRecord = await attendanceRepository.findTodayByUserId(userId);
    if (!existingRecord) {
      throw ErrorCodes.ATTENDANCE_ERRORS.NOT_CHECKED_IN;
    }
    if (existingRecord.clockOut) {
      throw ErrorCodes.ATTENDANCE_ERRORS.ALREADY_CHECKED_OUT;
    }

    const record = await attendanceRepository.update(existingRecord.id, {
      clockOut: new Date(),
      clockOutLocation: formatLocation(location),
      clockOutPhoto: photo,
      clockOutIp: ipAddress,
    });

    return record;
  }

  /**
   * Get today's attendance for user
   */
  async getToday(userId) {
    const record = await attendanceRepository.findTodayByUserId(userId);
    const todaySchedule = await scheduleService.getTodaySchedule(userId);

    const response = {
      id: record?.id || null,
      userId,
      date: new Date().toLocaleDateString('en-CA'),
      clockIn: record?.clockIn || null,
      clockOut: record?.clockOut || null,
      status: record ? formatStatus(record.status) : null,
      shift: record ? record.user.shift : null,
      canClockIn: !record,
      canClockOut: record && !record.clockOut,
      totalHours: record ? calculateTotalHours(record.clockIn, record.clockOut) : 0,
      isOffDay: todaySchedule
        ? todaySchedule.isOffDay
        : await offDayService.isOffDay(userId, new Date()),
      schedule: todaySchedule ? todaySchedule.shift : record?.user.shift,
    };

    return response;
  }

  /**
   * Get monthly summary for a user
   * @param {string} userId
   * @param {string} month - YYYY-MM format
   */
  async getMonthlySummary(userId, month) {
    const now = new Date();
    const [y, m] = (month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
      .split('-')
      .map(Number);
    const start = getTodayStart(new Date(y, m - 1, 1));
    const end = getTodayEnd(new Date(y, m, 0));

    const result = await attendanceRepository.list({
      userId,
      startDate: start.toISOString(),
      endDate: end.toISOString()
    });

    const rows = Array.isArray(result) ? result : result && result.data ? result.data : [];
    let totalMinutes = 0;
    const statusCounts = {};
    for (const record of rows) {
      if (record.clockIn && record.clockOut) {
        totalMinutes += Math.max(0, (new Date(record.clockOut) - new Date(record.clockIn)) / 60000);
      }
      const status = record.status || 'UNKNOWN';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }

    return {
      month: `${y}-${String(m).padStart(2, '0')}`,
      totalDays: rows.length,
      totalHours: Math.round((totalMinutes / 60) * 100) / 100,
      statusCounts,
      records: rows
    };
  }

  /**
   * Get monthly report (alias of getMonthlySummary)
   */
  async getMonthlyReport(payload) {
    return this.getMonthlySummary(payload && payload.userId, payload && payload.month);
  }

  /**
   * Get single attendance record by id
   */
  async getById(id, userId, role) {
    const record = await attendanceRepository.findById(id);
    if (!record) {
      throw new AppError('Attendance record not found', 404, 'ATTENDANCE_NOT_FOUND');
    }
    if (role !== 'ADMIN' && role !== 'OWNER' && record.userId !== userId) {
      throw new AppError("You don't have permission to view this attendance record", 403, 'FORBIDDEN');
    }
    return record;
  }

  /**
   * Get all attendance (placeholder for remaining methods)
   */
  async getAll(options) {
      return await attendanceRepository.list(options);
  }
}

module.exports = new AttendanceService();
