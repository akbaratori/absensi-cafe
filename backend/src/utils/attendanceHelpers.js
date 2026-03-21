const config = require('../config');

// Offset WITA (Waktu Indonesia Tengah / Makassar) = UTC+8
const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Convert any Date to a Date object that represents the same instant
 * but whose getHours()/getMinutes() reflect WITA (UTC+8) local time.
 * i.e., toWITA(new Date()).getHours() === current hour in Makassar
 */
const toWITA = (date) => {
  // Shift the UTC epoch forward by 8 hours so that getHours() etc.
  // return the WITA local values when called on this shifted date.
  return new Date(date.getTime() + WITA_OFFSET_MS);
};

/**
 * Get attendance config from database or use defaults
 * @param {Object} prisma - Prisma client
 * @returns {Object} Configuration object
 */
const getAttendanceConfig = async (prisma) => {
  try {
    const configs = await prisma.systemConfig.findMany();

    const configMap = {};
    configs.forEach((c) => {
      configMap[c.key] = c.value;
    });

    return {
      workStartTime: configMap.workStartTime || config.attendance.workStartTime,
      workEndTime: configMap.workEndTime || config.attendance.workEndTime,
      lateGraceMinutes: parseInt(configMap.lateGraceMinutes || config.attendance.lateGraceMinutes, 10),
      autoClockoutHours: parseInt(configMap.autoClockoutHours || config.attendance.autoClockoutHours, 10),
      cafeLatitude: parseFloat(configMap.cafeLatitude || config.attendance.cafeLatitude || -5.1687398658898145),
      cafeLongitude: parseFloat(configMap.cafeLongitude || config.attendance.cafeLongitude || 119.4584722877303),
      radiusMeters: parseInt(configMap.radiusMeters || config.attendance.radiusMeters || 200, 10),
    };
  } catch (error) {
    // Return defaults if config not accessible
    return config.attendance;
  }
};

/**
 * Calculate attendance status based on clock-in time
 * Uses WITA (UTC+8) timezone for accurate comparison in Makassar.
 * @param {Date} clockIn - Clock-in timestamp
 * @param {Object} attendanceConfig - Configuration object
 * @returns {String} Attendance status
 */
const calculateAttendanceStatus = (clockIn, attendanceConfig) => {
  const [hours, minutes] = attendanceConfig.workStartTime.split(':').map(Number);

  // Convert clock-in time to WITA to get correct local hour/minute
  const clockInWITA = toWITA(clockIn);

  // Build a reference date at the shift start time in WITA:
  // We use a UTC Date that, when shifted by +8h, equals YYYY-MM-DD HH:mm in WITA.
  // Easier: build the shift start as a UTC timestamp = (clockInWITA date at 00:00 UTC) + shift hours
  // Step 1: get WITA date string (YYYY-MM-DD) for the clock-in day
  const witaDateStr = clockInWITA.toISOString().slice(0, 10); // "YYYY-MM-DD" in virtual WITA day
  // Step 2: construct shift start in UTC from WITA time
  const shiftStartUTC = new Date(`${witaDateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00+08:00`);

  // Khusus Shift Ramadhan yang masuk jam 14:00
  if (hours === 14 && minutes === 0) {
    const maxLateUTC = new Date(`${witaDateStr}T14:15:00+08:00`);
    if (clockIn > maxLateUTC) {
      return 'LATE';
    }
  } else {
    // Shift Reguler: gunakan grace period dari config
    const graceTimeUTC = new Date(shiftStartUTC.getTime() + attendanceConfig.lateGraceMinutes * 60 * 1000);
    if (clockIn > graceTimeUTC) {
      return 'LATE';
    }
  }

  return 'PRESENT';
};

/**
 * Calculate total hours worked
 * @param {Date} clockIn - Clock-in timestamp
 * @param {Date} clockOut - Clock-out timestamp
 * @returns {Number} Total hours rounded to 2 decimal places
 */
const calculateTotalHours = (clockIn, clockOut) => {
  const diffMs = clockOut - clockIn;
  const diffHours = diffMs / (1000 * 60 * 60);
  return Math.round(diffHours * 100) / 100;
};

/**
 * Format location from coordinates
 * @param {Object} location - Location object with lat/lng
 * @returns {String} Formatted location string
 */
const formatLocation = (location) => {
  if (!location || (!location.latitude && !location.longitude)) {
    return null;
  }

  if (location.latitude && location.longitude) {
    return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
  }

  return null;
};

/**
 * Get date range for a month
 * @param {String} month - Month in YYYY-MM format
 * @returns {Object} Start and end dates
 */
const getMonthDateRange = (month) => {
  const [year, monthNum] = month.split('-').map(Number);

  const startDate = new Date(year, monthNum - 1, 1);
  const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

  return { startDate, endDate };
};

/**
 * Get today's date start in WITA (UTC+8) - returns UTC timestamp
 * @returns {Date} Start of today in WITA as UTC Date
 */
const getTodayStart = () => {
  const nowWITA = toWITA(new Date());
  const dateStr = nowWITA.toISOString().slice(0, 10); // YYYY-MM-DD in WITA
  return new Date(`${dateStr}T00:00:00+08:00`);
};

/**
 * Get today's date end in WITA (UTC+8) - returns UTC timestamp
 * @returns {Date} End of today in WITA as UTC Date
 */
const getTodayEnd = () => {
  const nowWITA = toWITA(new Date());
  const dateStr = nowWITA.toISOString().slice(0, 10); // YYYY-MM-DD in WITA
  return new Date(`${dateStr}T23:59:59+08:00`);
};

/**
 * Convert database enum to API format
 * @param {String} status - Database status
 * @returns {String} API status
 */
const formatStatus = (status) => {
  const statusMap = {
    PRESENT: 'present',
    LATE: 'late',
    ABSENT: 'absent',
    HALF_DAY: 'half_day',
  };
  return statusMap[status] || status.toLowerCase();
};

/**
 * Convert API format to database enum
 * @param {String} status - API status
 * @returns {String} Database status
 */
const parseStatus = (status) => {
  const statusMap = {
    present: 'PRESENT',
    late: 'LATE',
    absent: 'ABSENT',
    half_day: 'HALF_DAY',
  };
  return statusMap[status] || status.toUpperCase();
};

/**
 * Calculate distance between two points in meters (Haversine formula)
 * @param {Object} point1 - { latitude, longitude }
 * @param {Object} point2 - { latitude, longitude }
 * @returns {Number} Distance in meters
 */
const calculateDistance = (point1, point2) => {
  if (!point1?.latitude || !point1?.longitude || !point2?.latitude || !point2?.longitude) {
    return Infinity;
  }

  const R = 6371e3; // Earth radius in meters
  const lat1 = (point1.latitude * Math.PI) / 180;
  const lat2 = (point2.latitude * Math.PI) / 180;
  const deltaLat = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const deltaLng = ((point2.longitude - point1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

module.exports = {
  toWITA,
  getAttendanceConfig,
  calculateAttendanceStatus,
  calculateTotalHours,
  formatLocation,
  getMonthDateRange,
  getTodayStart,
  getTodayEnd,
  formatStatus,
  parseStatus,
  calculateDistance,
};
