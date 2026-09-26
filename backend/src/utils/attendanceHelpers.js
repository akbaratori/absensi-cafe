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
 * @returns {Object} { status: String, lateMinutes: Number }
 */
const calculateAttendanceStatus = (clockIn, attendanceConfig) => {
  const [hours, minutes] = attendanceConfig.workStartTime.split(':').map(Number);

  // Convert clock-in time to WITA to get correct local hour/minute
  const clockInWITA = toWITA(clockIn);

  // Build a reference date at the shift start time in WITA:
  const witaDateStr = clockInWITA.toISOString().slice(0, 10); // "YYYY-MM-DD" in virtual WITA day
  const shiftStartUTC = new Date(`${witaDateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00+08:00`);

  // Gunakan grace period dari config untuk semua shift (termasuk Ramadhan)
  const graceTimeUTC = new Date(shiftStartUTC.getTime() + attendanceConfig.lateGraceMinutes * 60 * 1000);
  if (clockIn > graceTimeUTC) {
    const lateMinutes = Math.ceil((clockIn.getTime() - shiftStartUTC.getTime()) / (60 * 1000));
    return { status: 'LATE', lateMinutes };
  }

  return { status: 'PRESENT', lateMinutes: 0 };
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

/** Batas maksimum rentang laporan (dipakai semua rekap period-based). */
const MAX_REPORT_RANGE_DAYS = 366;

/**
 * Normalisasi periode rekap absensi dari query string.
 *
 * Semua rekap ("hari ini", "bulan ini", "rentang bebas") akhirnya jadi rentang
 * tanggal WITA: inklusif, jam 00:00:00.000 s/d 23:59:59.999, dan setiap tepi
 * dianker ke `T00:00:00.000Z` seperti `date` di tabel attendance disimpan.
 *
 * @param {Object} params
 * @param {String} [params.start] - "YYYY-MM-DD"
 * @param {String} [params.end]   - "YYYY-MM-DD"
 * @param {String} [params.month] - "YYYY-MM"
 * @param {String} [params.date]  - "YYYY-MM-DD" (satu hari)
 * @returns {{startDate: Date, endDate: Date, days: Number, start: String, end: String}}
 * @throws {Error} statusCode 400 kalau format tanggal salah / rentang terlalu panjang /
 *                 start > end
 */
const getPeriodRange = ({ start, end, month, date } = {}) => {
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    const MONTH_RE = /^\d{4}-\d{2}$/;

    const invalid = (msg) => {
        const err = new Error(msg);
        err.statusCode = 400;
        err.code = 'INVALID_DATE_RANGE';
        // WAJIB: tanpa flag ini errorHandler memperlakukannya sebagai error tak
        // terduga dan membalas 500, padahal ini murni kesalahan input.
        err.isOperational = true;
        return err;
    };

    const iso = (s) => String(s || '').slice(0, 10);

    // 1. Preset "satu hari" menang atas yang lain (dipakai /reports/daily).
    if (!start && !end && !month && date) {
        const day = iso(date);
        if (!DATE_RE.test(day)) throw invalid(`Format tanggal tidak valid: "${date}". Gunakan YYYY-MM-DD.`);
        return { start: day, end: day, startDate: new Date(`${day}T00:00:00.000Z`), endDate: new Date(`${day}T23:59:59.999Z`), days: 1 };
    }

    // 2. Preset bulan penuh (dipakai panel bulanan).
    if (!start && !end && month) {
        if (!MONTH_RE.test(String(month))) throw invalid(`Format bulan tidak valid: "${month}". Gunakan YYYY-MM.`);
        const [y, m] = String(month).split('-').map(Number);
        if (m < 1 || m > 12) throw invalid(`Bulan tidak valid: "${month}".`);
        const first = `${month}-01`;
        const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // hari terakhir bulan itu
        const last = `${month}-${String(lastDay).padStart(2, '0')}`;
        return { start: first, end: last, startDate: new Date(`${first}T00:00:00.000Z`), endDate: new Date(`${last}T23:59:59.999Z`), days: lastDay };
    }

    // 3. Rentang bebas start..end. Default: end = hari ini WITA, start = awal bulan.
    const today = toWITA(new Date()).toISOString().slice(0, 10);
    const rawStart = start ? iso(start) : `${(end ? iso(end) : today).slice(0, 7)}-01`;
    const rawEnd = end ? iso(end) : today;

    if (!DATE_RE.test(rawStart)) throw invalid(`Tanggal mulai tidak valid: "${start}". Gunakan YYYY-MM-DD.`);
    if (!DATE_RE.test(rawEnd)) throw invalid(`Tanggal akhir tidak valid: "${end}". Gunakan YYYY-MM-DD.`);

    const startDate = new Date(`${rawStart}T00:00:00.000Z`);
    const endDate = new Date(`${rawEnd}T23:59:59.999Z`);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        throw invalid('Tanggal tidak dikenali.');
    }
    if (startDate > endDate) {
        throw invalid(`Tanggal mulai (${rawStart}) melewati tanggal akhir (${rawEnd}).`);
    }

    const days = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
    if (days > MAX_REPORT_RANGE_DAYS) {
        throw invalid(`Rentang maksimum ${MAX_REPORT_RANGE_DAYS} hari, diminta ${days} hari.`);
    }

    return { start: rawStart, end: rawEnd, startDate, endDate, days };
};

/**
 * Semua tanggal "YYYY-MM-DD" dalam sebuah rentang (inklusif).
 * @param {String} start - "YYYY-MM-DD"
 * @param {String} end   - "YYYY-MM-DD"
 * @returns {String[]}
 */
const enumerateDateStrings = (start, end) => {
    const out = [];
    let cursor = new Date(`${String(start).slice(0, 10)}T00:00:00.000Z`);
    const last = new Date(`${String(end).slice(0, 10)}T00:00:00.000Z`);
    // Guard ekstra supaya tidak ada kemungkinan loop tak berujung.
    for (let i = 0; cursor <= last && i <= MAX_REPORT_RANGE_DAYS; i++) {
        out.push(cursor.toISOString().slice(0, 10));
        cursor = new Date(cursor.getTime() + 86400000);
    }
    return out;
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
 * Durasi shift dalam menit dari string "HH:MM".
 * Mendukung shift yang lewat tengah malam (mis. 21:40 -> 00:19 = 159 menit).
 * @param {String} startTime - "HH:MM"
 * @param {String} endTime - "HH:MM"
 * @returns {Number} durasi menit
 */
const shiftDurationMinutes = (startTime, endTime) => {
  const [sh, sm] = String(startTime).split(':').map(Number);
  const [eh, em] = String(endTime).split(':').map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60;
  return minutes;
};

/**
 * Ambang batas setengah hari = setengah durasi shift.
 * Shift 1 08:15-20:00 (705 mnt) -> 352 mnt. Shift 2 11:00-22:30 (690 mnt) -> 345 mnt.
 */
const getHalfDayThresholdMinutes = (startTime, endTime) =>
  Math.floor(shiftDurationMinutes(startTime, endTime) / 2);

/**
 * Tambah menit ke "HH:MM", dibungkus dalam 24 jam.
 * "22:30" + 60 -> "23:30"
 */
const addMinutesToTime = (time, minutes) => {
  const [h, m] = String(time).split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Instant UTC untuk jam berakhirnya shift pada tanggal WITA tertentu.
 * dateStr = "YYYY-MM-DD" (tanggal WITA). Shift lewat tengah malam otomatis +1 hari.
 */
const getShiftEndInstant = (dateStr, startTime, endTime) => {
  const start = new Date(`${dateStr}T${startTime}:00+08:00`);
  const end = new Date(`${dateStr}T${endTime}:00+08:00`);
  if (end <= start) end.setTime(end.getTime() + 24 * 60 * 60 * 1000);
  return end;
};

/** Format menit menjadi "11j30m" untuk catatan absensi. */
const formatDurationMinutes = (minutes) => {
  const total = Math.max(0, Math.round(minutes));
  return `${Math.floor(total / 60)}j${String(total % 60).padStart(2, '0')}m`;
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
  shiftDurationMinutes,
  getHalfDayThresholdMinutes,
  addMinutesToTime,
  getShiftEndInstant,
  formatDurationMinutes,
  getPeriodRange,
  enumerateDateStrings,
  MAX_REPORT_RANGE_DAYS,
};
