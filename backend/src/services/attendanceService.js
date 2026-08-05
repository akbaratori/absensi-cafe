const { ErrorCodes } = require('../utils/AppError');
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
   * Get all attendance (placeholder for remaining methods)
   */
  async getAll(options) {
      return await attendanceRepository.list(options);
  }
}

module.exports = new AttendanceService();