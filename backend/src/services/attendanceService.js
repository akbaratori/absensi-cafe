const { ErrorCodes } = require('../utils/AppError');
const attendanceRepository = require('../repositories/attendanceRepository');
const prisma = require('../utils/database');
const { getAttendanceConfig, calculateAttendanceStatus, calculateTotalHours, formatLocation, getTodayStart, getTodayEnd, formatStatus, parseStatus, calculateDistance } = require('../utils/attendanceHelpers');
const swapService = require('./swapService'); // Import SwapService
const offDayService = require('./offDayService'); // Import OffDayService

const shifts = require('../config/shifts');

class AttendanceService {
  /**
   * Clock in user
   */
  async clockIn(userId, location, notes, photo, ipAddress) {
    // Check if already clocked in today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check for Off Day
    const isOffDay = await offDayService.isOffDay(userId, today);
    if (isOffDay) {
      throw ErrorCodes.ATTENDANCE_ERRORS.OFF_DAY_WORK;
    }

    // Validate Location (Geofencing)
    const config = await getAttendanceConfig(prisma);
    const cafeLocation = {
      latitude: config.cafeLatitude || -6.2088,
      longitude: config.cafeLongitude || 106.8456,
    };
    const maxDistance = config.radiusMeters || 100; // 100 meters

    if (location && location.latitude && location.longitude) {
      const distance = calculateDistance(location, cafeLocation);
      if (distance > maxDistance) {
        const error = ErrorCodes.ATTENDANCE_ERRORS.INVALID_LOCATION;
        error.message = `Terlalu jauh! Jarak: ${Math.round(distance)}m. Maks: ${maxDistance}m.\nLokasi Anda: ${location.latitude}, ${location.longitude}\nLokasi Cafe: ${cafeLocation.latitude}, ${cafeLocation.longitude}`;
        throw error;
      }
    } else {
      // Optional: Reject if no location provided at all
      // throw new Error("Location permission is required to clock in.");
    }

    const existingRecord = await attendanceRepository.findTodayByUserId(userId);

    if (existingRecord) {
      const error = ErrorCodes.ATTENDANCE_ERRORS.ALREADY_CLOCKED_IN;
      error.message = `You have already clocked in today at ${existingRecord.clockIn.toTimeString().slice(0, 5)}`;
      throw error;
    }

    // config is already defined above

    // Get User Shift (Priority: Active Swap > User Schedule > User Default Shift)
    // 1. Check for Active Swap
    const activeSwapShift = await swapService.getActiveSwap(userId, today);

    if (activeSwapShift) {
      config.workStartTime = activeSwapShift.startTime;
      config.workEndTime = activeSwapShift.endTime;
    } else {
      // 2. Check for Dynamic Schedule (UserSchedule)
      const scheduleService = require('./scheduleService'); // Lazy load to avoid circular dependency if any
      const todaySchedule = await scheduleService.getTodaySchedule(userId);

      if (todaySchedule) {
        if (todaySchedule.isOffDay) {
          // Re-check off day here if schedule says so, though we checked earlier. 
          // It's safer to rely on scheduleService for truth source.
          throw ErrorCodes.ATTENDANCE_ERRORS.OFF_DAY_WORK;
        }

        if (todaySchedule.shift) {
          config.workStartTime = todaySchedule.shift.startTime;
          config.workEndTime = todaySchedule.shift.endTime;
        }
      } else {
        // 3. Fallback to User Default Shift
        const user = await attendanceRepository.findUserById(userId);
        const userShift = user?.shift;

        if (userShift) {
          config.workStartTime = userShift.startTime;
          config.workEndTime = userShift.endTime;
        }
      }
    }

    // Create attendance record
    const clockInTime = new Date();
    const status = calculateAttendanceStatus(clockInTime, config);

    const record = await attendanceRepository.create({
      userId,
      date: clockInTime,
      clockIn: clockInTime,
      clockInLocation: formatLocation(location),
      clockInPhoto: photo, // Store photo path
      clockInIp: ipAddress, // Store IP
      status,
      notes,
    });

    return record;
  }

  /**
   * Clock out user
   */
  async clockOut(userId, location, photo, ipAddress) {
    // Find today's record
    const existingRecord = await attendanceRepository.findTodayByUserId(userId);

    if (!existingRecord) {
      throw ErrorCodes.ATTENDANCE_ERRORS.NOT_CLOCKED_IN;
    }

    if (existingRecord.clockOut) {
      const error = ErrorCodes.ATTENDANCE_ERRORS.ALREADY_CLOCKED_OUT;
      error.message = `You have already clocked out today at ${existingRecord.clockOut.toTimeString().slice(0, 5)}`;
      throw error;
    }

    // Update record with clock out time
    const clockOutTime = new Date();
    const totalHours = calculateTotalHours(existingRecord.clockIn, clockOutTime);

    const updatedRecord = await attendanceRepository.update(existingRecord.id, {
      clockOut: clockOutTime,
      clockOutLocation: formatLocation(location),
      clockOutPhoto: photo, // Store photo path
      clockOutIp: ipAddress, // Store IP
    });

    return {
      ...updatedRecord,
      totalHours,
    };
  }

  /**
   * Get today's attendance for user
   */
  async getToday(userId) {
    const record = await attendanceRepository.findTodayByUserId(userId);

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
      // Check dynamic schedule for off day status
      isOffDay: await (async () => {
        const scheduleService = require('./scheduleService');
        const todaySchedule = await scheduleService.getTodaySchedule(userId);
        if (todaySchedule) return todaySchedule.isOffDay;
        // Fallback to static setting
        return await offDayService.isOffDay(userId, new Date());
      })(),
      // Add shift info if available
      schedule: await (async () => {
        const scheduleService = require('./scheduleService');
        const todaySchedule = await scheduleService.getTodaySchedule(userId);
        return todaySchedule ? todaySchedule.shift : record?.user.shift;
      })()
    };

    return response;
  }

  /**
   * Get attendance history for user
   */
  async getHistory(userId, options) {
    const result = await attendanceRepository.getUserHistory(userId, options);

    // Format records for API response
    const formattedRecords = result.records.map((record) => ({
      id: record.id,
      date: record.date.toISOString().split('T')[0],
      clockIn: record.clockIn.toISOString(),
      clockOut: record.clockOut ? record.clockOut.toISOString() : null,
      status: formatStatus(record.status),
      totalHours: record.clockOut
        ? calculateTotalHours(record.clockIn, record.clockOut)
        : null,
    }));

    return {
      records: formattedRecords,
      pagination: result.pagination,
      summary: result.summary,
    };
  }

  /**
   * Get specific attendance record
   */
  async getById(id, requestingUserId, requestingUserRole) {
    const record = await attendanceRepository.findById(id);

    if (!record) {
      throw ErrorCodes.ATTENDANCE_ERRORS.ATTENDANCE_NOT_FOUND;
    }

    // Employees can only see their own records
    if (requestingUserRole === 'EMPLOYEE' && record.userId !== requestingUserId) {
      throw ErrorCodes.AUTH_ERRORS.FORBIDDEN;
    }

    // Format for API response
    return {
      id: record.id,
      userId: record.userId,
      user: record.user,
      date: record.date.toISOString().split('T')[0],
      clockIn: record.clockIn.toISOString(),
      clockOut: record.clockOut ? record.clockOut.toISOString() : null,
      clockInLocation: record.clockInLocation,
      clockOutLocation: record.clockOutLocation,
      status: formatStatus(record.status),
      notes: record.notes,
      totalHours: record.clockOut
        ? calculateTotalHours(record.clockIn, record.clockOut)
        : null,
    };
  }

  /**
   * Admin: Update attendance record
   */
  async updateAdmin(id, updates) {
    const record = await attendanceRepository.findById(id);

    if (!record) {
      throw ErrorCodes.ATTENDANCE_ERRORS.ATTENDANCE_NOT_FOUND;
    }

    // Validate updates
    if (updates.clockIn && updates.clockOut && updates.clockOut < updates.clockIn) {
      // Cross-midnight check would go here
      const clockInDate = updates.clockIn.toISOString().split('T')[0];
      const clockOutDate = updates.clockOut.toISOString().split('T')[0];

      // Allow cross-midnight if dates are different
      if (clockInDate === clockOutDate) {
        const error = new Error('Clock-out time must be after clock-in time');
        error.statusCode = 400;
        error.code = 'VALIDATION_ERROR';
        error.isOperational = true;
        throw error;
      }
    }

    // Parse status to DB enum if provided
    const status = updates.status ? parseStatus(updates.status) : undefined;

    const updatedRecord = await attendanceRepository.update(id, {
      ...updates,
      ...(status && { status }),
    });

    return {
      id: updatedRecord.id,
      userId: updatedRecord.userId,
      date: updatedRecord.date.toISOString().split('T')[0],
      clockIn: updatedRecord.clockIn.toISOString(),
      clockOut: updatedRecord.clockOut ? updatedRecord.clockOut.toISOString() : null,
      status: formatStatus(updatedRecord.status),
      notes: updatedRecord.notes,
    };
  }

  /**
   * Admin: Get all attendance records with filters
   */
  async getAll(options) {
    const result = await attendanceRepository.findAll(options);

    // Format records
    const formattedRecords = result.records.map((record) => ({
      id: record.id,
      user: record.user,
      date: record.date.toISOString().split('T')[0],
      clockIn: record.clockIn.toISOString(),
      clockOut: record.clockOut ? record.clockOut.toISOString() : null,
      clockInPhoto: record.clockInPhoto,
      clockOutPhoto: record.clockOutPhoto,
      status: formatStatus(record.status),
      totalHours: record.clockOut
        ? calculateTotalHours(record.clockIn, record.clockOut)
        : null,
    }));

    return {
      records: formattedRecords,
      pagination: result.pagination,
    };
  }

  /**
   * Admin: Get daily summary
   */
  async getDailySummary(date) {
    const queryDate = date || new Date().toLocaleDateString('en-CA');

    const result = await attendanceRepository.getDailySummary(queryDate);

    // Format summary
    const formattedSummary = {
      totalEmployees: result.summary.totalEmployees,
      present: result.summary.present,
      late: result.summary.late,
      absent: result.summary.absent,
      halfDay: result.summary.halfDay,
      notClockedIn: result.summary.notClockedIn,
    };

    // Format records
    const formattedRecords = result.records.map((record) => ({
      user: record.user,
      date: result.date, // Add date from summary result to each record
      clockIn: record.clockIn.toISOString(),
      clockOut: record.clockOut ? record.clockOut.toISOString() : null,
      status: formatStatus(record.status),
      totalHours: record.clockOut
        ? calculateTotalHours(record.clockIn, record.clockOut)
        : null,
    }));

    return {
      date: result.date,
      summary: formattedSummary,
      records: formattedRecords,
    };
  }

  /**
   * Admin: Get monthly report
   */
  async getMonthlyReport(options) {
    const { userId, month } = options;

    // If no userId, return monthly summary for all users (like daily report but for month)
    if (!userId) {
      const [year, monthNum] = month.split('-').map(Number);
      const startDate = new Date(year, monthNum - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(year, monthNum, 0).toISOString().split('T')[0];

      const result = await this.getAll({
        startDate,
        endDate,
        limit: 1000,
      });

      // Transform to match report format
      return {
        month,
        summary: {
          totalWorkingDays: result.records.length,
          // Group other stats if needed
        },
        records: result.records, // Use records array which includes user info
        dailyBreakdown: [] // Empty because we use records for admin view
      };
    }

    const report = await attendanceRepository.getMonthlyReport(userId, month);

    return report;
  }

  /**
   * Export attendance data as CSV
   */
  async exportToCsv(options) {
    const { startDate, endDate } = options;

    const result = await attendanceRepository.findAll({
      ...options,
      limit: 10000, // Higher limit for export
    });

    // Build CSV
    const headers = ['Date', 'Employee ID', 'Full Name', 'Clock In', 'Clock Out', 'Status', 'Total Hours', 'Location Map', 'Photo Evidence'];

    const rows = result.records.map((record) => {
      let mapLink = '';
      if (record.clockInLocation) {
        const [lat, lng] = record.clockInLocation.split(', ');
        mapLink = `https://www.google.com/maps?q=${lat},${lng}`;
      }

      let photoLink = '';
      if (record.clockInPhoto) {
        // Assuming server URL is needed, but relative path works if served correctly or admin views it
        // Ideally prepend API_URL
        photoLink = record.clockInPhoto;
      }

      return [
        record.date.toISOString().split('T')[0],
        record.user.employeeId || '',
        record.user.fullName,
        record.clockIn.toTimeString().slice(0, 5),
        record.clockOut ? record.clockOut.toTimeString().slice(0, 5) : '',
        formatStatus(record.status),
        record.clockOut ? calculateTotalHours(record.clockIn, record.clockOut) : '',
        mapLink,
        photoLink
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    return {
      content: csvContent,
      filename: `attendance_${startDate}_to_${endDate}.csv`,
    };
  }

  /**
   * Admin: Delete attendance record
   */
  async deleteAttendance(id) {
    const record = await attendanceRepository.findById(id);

    if (!record) {
      throw ErrorCodes.ATTENDANCE_ERRORS.ATTENDANCE_NOT_FOUND;
    }

    await attendanceRepository.delete(id);
    return true;
  }

  /**
   * Admin: Delete ALL attendance records (for testing/reset)
   */
  async deleteAllAttendance() {
    const result = await attendanceRepository.deleteAll();
    return { deleted: result.count };
  }
}


module.exports = new AttendanceService();
