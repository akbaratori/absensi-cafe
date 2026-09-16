const { ErrorCodes } = require('../utils/AppError');
const attendanceRepository = require('../repositories/attendanceRepository');
const prisma = require('../utils/database');
const { getAttendanceConfig, calculateAttendanceStatus, calculateTotalHours, formatLocation, getTodayStart, getTodayEnd, formatStatus, parseStatus, calculateDistance, toWITA, shiftDurationMinutes, getHalfDayThresholdMinutes, addMinutesToTime, getShiftEndInstant, formatDurationMinutes } = require('../utils/attendanceHelpers');
const swapService = require('./swapService'); // Import SwapService
const offDayService = require('./offDayService'); // Import OffDayService
const auditService = require('./auditService');

const shifts = require('../config/shifts');

// Format kolom `date` (WITA-midnight yang disimpan sebagai UTC instant)
// menjadi string tanggal kalender WITA. Tanpa +8 jam, tanggal 1 Sep
// (disimpan 31 Agu 16:00Z) akan tampil sebagai "31 Agustus" di riwayat.
const toWITADateString = (date) => toWITA(date).toISOString().split('T')[0];

/**
 * Toleransi jam pulang (menit). Staff yang clock-out beberapa menit sebelum
 * shift berakhir TIDAK dihitung setengah hari — mis. pulang 22:27 untuk shift
 * yang berakhir 22:30 tetap hadir penuh. Tanpa toleransi ini, hampir semua
 * orang yang pulang tepat waktu akan terkena potong jatah libur.
 */
const ATTENDANCE_END_GRACE_MINUTES = 60;

/** Tambahkan keterangan ke notes tanpa menghapus isi sebelumnya. */
const appendNote = (existing, extra) => {
  const base = (existing || '').trim();
  return base ? `${base} | ${extra}` : extra;
};

class AttendanceService {
  /**
   * Resolve shift efektif seorang user pada satu tanggal WITA.
   *
   * Prioritas (sama dengan rotationService.getMySchedule):
   *   1. BackupAssignment.shiftNumber — user merangkap posisi lain hari itu
   *   2. ShiftSwap APPROVED           — tukar shift
   *   3. UserSchedule.shift           — jadwal hasil rotasi
   *   4. User.shift                   — shift default
   *
   * PENTING: tanpa langkah 1, user yang merangkap dengan shift 2 akan dinilai
   * memakai jam shift 1 (mis. masuk 11:00 dihitung telat 2j45m).
   *
   * @param {Number} userId
   * @param {String} dateStr - tanggal WITA "YYYY-MM-DD"
   * @returns {Object} { shift, source } — shift bernilai null bila tidak ada acuan
   */
  async resolveEffectiveShift(userId, dateStr) {
    // Pakai boundary WITA — aman untuk kedua konvensi penyimpanan tanggal
    // (UTC-midnight maupun WITA-midnight), karena rentangnya mencakup keduanya.
    const dayStart = new Date(`${dateStr}T00:00:00+08:00`);
    const dayEnd = new Date(`${dateStr}T23:59:59+08:00`);

    // 1. Backup assignment — shiftNumber mengikuti urutan id tabel shifts
    const backup = await prisma.backupAssignment.findFirst({
      where: { backupUserId: userId, date: { gte: dayStart, lte: dayEnd } },
      select: { shiftNumber: true },
    });

    if (backup?.shiftNumber != null) {
      const allShifts = await prisma.shift.findMany({ orderBy: { id: 'asc' } });
      const shift = allShifts[backup.shiftNumber - 1] || null;
      if (shift) return { shift, source: `backup shift ${backup.shiftNumber}` };
    }

    // 2. Swap shift yang sudah disetujui
    const swapShift = await swapService.getActiveSwap(userId, dayStart);
    if (swapShift) return { shift: swapShift, source: 'swap' };

    // 3. Jadwal hasil rotasi
    const userSchedule = await prisma.userSchedule.findFirst({
      where: { userId, date: { gte: dayStart, lte: dayEnd } },
      include: { shift: true },
    });
    if (userSchedule?.shift) return { shift: userSchedule.shift, source: 'jadwal' };

    // 4. Shift default user
    const user = await attendanceRepository.findUserById(userId);
    if (user?.shift) return { shift: user.shift, source: 'default user' };

    return { shift: null, source: null };
  }

  /**
   * Tentukan status absensi dari durasi kerja terhadap shift efektif.
   *
   * Aturan (kebijakan September 2026 — TIDAK ada potongan 0.5):
   *   - durasi < setengah shift          -> ABSENT   (potong jatah libur 1 hari)
   *   - setengah <= durasi < penuh       -> HALF_DAY (potong jatah libur 1 hari)
   *   - durasi >= penuh - toleransi      -> hadir penuh, status LATE/PRESENT tetap
   *
   * Toleransi jam pulang mencegah orang yang pulang beberapa menit lebih awal
   * (mis. 22:27 untuk shift berakhir 22:30) ikut terhitung setengah hari.
   *
   * @param {Number} workedMinutes - durasi kerja aktual (menit)
   * @param {Object} shift - { startTime, endTime }
   * @returns {Object|null} { status, reason } atau null bila hadir penuh
   */
  classifyByDuration(workedMinutes, shift) {
    const fullMinutes = shiftDurationMinutes(shift.startTime, shift.endTime);
    const halfMinutes = getHalfDayThresholdMinutes(shift.startTime, shift.endTime);
    const fullWithGrace = fullMinutes - ATTENDANCE_END_GRACE_MINUTES;

    if (workedMinutes < halfMinutes) {
      return {
        status: 'ABSENT',
        reason: `durasi ${formatDurationMinutes(workedMinutes)} kurang dari setengah shift (${formatDurationMinutes(halfMinutes)} dari ${formatDurationMinutes(fullMinutes)})`,
      };
    }

    if (workedMinutes < fullWithGrace) {
      return {
        status: 'HALF_DAY',
        reason: `durasi ${formatDurationMinutes(workedMinutes)} dari ${formatDurationMinutes(fullMinutes)} — belum penuh`,
      };
    }

    return null;
  }

  /**
   * Clock in user
   */
  async clockIn(userId, location, notes, photo, ipAddress) {
    // Use UTC midnight boundaries of today's WITA date to match how dates are stored (T00:00:00Z)
    const now = new Date();
    const todayWITAStr = toWITADateString(now);
    const todayUTCStart = new Date(`${todayWITAStr}T00:00:00.000Z`);
    const todayUTCEnd   = new Date(`${todayWITAStr}T23:59:59.999Z`);

    // Check backup assignment first — backup duty overrides any schedule off-day
    const backupTodayClockIn = await prisma.backupAssignment.findFirst({
      where: { backupUserId: userId, date: { gte: todayUTCStart, lte: todayUTCEnd } },
    });

    // Declare todaySchedule at function scope so it's accessible for shift resolution below
    let todaySchedule = null;

    if (!backupTodayClockIn) {
      const scheduleService = require('./scheduleService');
      todaySchedule = await scheduleService.getTodaySchedule(userId);

      const manualOffTodayClockIn = await prisma.manualOffDay.findFirst({
        where: { userId, date: { gte: todayUTCStart, lte: todayUTCEnd } },
      });

      // Check Leave APPROVED covering today — fallback only
      const leaveTodayClockIn = await prisma.leave.findFirst({
        where: {
          userId,
          status: 'APPROVED',
          startDate: { lte: todayUTCEnd },
          endDate:   { gte: todayUTCStart },
        },
      });

      // Check OffDayRequest APPROVED covering today — swap-aware, fallback only
      const offReqTodayClockIn = await prisma.offDayRequest.findFirst({
        where: {
          status: 'APPROVED',
          OR: [
            { userId, workDate: { gte: todayUTCStart, lte: todayUTCEnd } },
            { userId, offDate: { gte: todayUTCStart, lte: todayUTCEnd }, targetUserId: null },
            { targetUserId: userId, offDate: { gte: todayUTCStart, lte: todayUTCEnd } },
          ],
        },
      });

      const hasOffSourceClockIn = !!(manualOffTodayClockIn || leaveTodayClockIn || offReqTodayClockIn);

      let isClockInOffDay = false;
      if (todaySchedule) {
        // UserSchedule is source of truth — do not union with stale ManualOffDay/OffDayRequest
        isClockInOffDay = todaySchedule.isOffDay;
      } else if (hasOffSourceClockIn) {
        isClockInOffDay = true;
      } else {
        // No schedule exists — block clock-in entirely
        throw ErrorCodes.ATTENDANCE_ERRORS.NO_SCHEDULE;
      }

      if (isClockInOffDay) {
        throw ErrorCodes.ATTENDANCE_ERRORS.OFF_DAY_WORK;
      }
    }
    // If backup exists, or no ManualOffDay and todaySchedule.isOffDay=false → working day, proceed


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
      // MANDATORY: Reject if no location provided
      const error = new Error('Izin lokasi diperlukan untuk absensi masuk. Aktifkan GPS dan izinkan akses lokasi.');
      error.statusCode = 400;
      error.code = 'LOCATION_REQUIRED';
      error.isOperational = true;
      throw error;
    }

    const existingRecord = await attendanceRepository.findTodayByUserId(userId);

    if (existingRecord) {
      const error = ErrorCodes.ATTENDANCE_ERRORS.ALREADY_CLOCKED_IN;
      error.message = `You have already clocked in today at ${existingRecord.clockIn.toTimeString().slice(0, 5)}`;
      throw error;
    }

    // config is already defined above

    // Shift efektif: backup shift > swap disetujui > jadwal > shift default user.
    // Backup WAJIB didahulukan — kalau tidak, staff yang merangkap posisi shift 2
    // (mis. masuk 11:00) akan dihitung terlambat 2j45m terhadap jam Shift 1.
    const { shift: effectiveShift, source: shiftSource } = await this.resolveEffectiveShift(userId, todayWITAStr);

    if (effectiveShift) {
      config.workStartTime = effectiveShift.startTime;
      config.workEndTime = effectiveShift.endTime;
    }

    // Create attendance record
    const clockInTime = new Date();
    const { status, lateMinutes } = calculateAttendanceStatus(clockInTime, config);

    // Use WITA midnight for the date field to ensure consistent day boundaries
    const todayMidnightWITA = getTodayStart(); // Returns UTC equivalent of 00:00:00+08:00

    // Lock shift info: append shift used for this clock-in to notes for audit
    const shiftInfo = `[Shift: ${config.workStartTime}-${config.workEndTime}${shiftSource ? `, ${shiftSource}` : ''}]`;
    // Terlambat tetap dihitung hadir penuh, tapi keterangannya wajib jelas.
    const lateInfo = status === 'LATE'
      ? `[Terlambat ${lateMinutes} menit — tetap dihitung hadir penuh]`
      : null;
    const finalNotes = [notes, shiftInfo, lateInfo].filter(Boolean).join(' ');

    const record = await attendanceRepository.create({
      userId,
      date: todayMidnightWITA,
      clockIn: clockInTime,
      clockInLocation: formatLocation(location),
      clockInPhoto: photo, // Store photo path
      clockInIp: ipAddress, // Store IP
      status,
      lateMinutes,
      notes: finalNotes,
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

    // Validate Location (Geofencing) for clock-out
    const config = await getAttendanceConfig(prisma);
    const cafeLocation = {
      latitude: config.cafeLatitude || -6.2088,
      longitude: config.cafeLongitude || 106.8456,
    };
    const maxDistance = config.radiusMeters || 100;

    if (location && location.latitude && location.longitude) {
      const distance = calculateDistance(location, cafeLocation);
      if (distance > maxDistance) {
        const error = new Error(`Terlalu jauh untuk clock-out! Jarak: ${Math.round(distance)}m. Maks: ${maxDistance}m.`);
        error.statusCode = 400;
        error.code = 'INVALID_LOCATION';
        error.isOperational = true;
        throw error;
      }
    } else {
      // MANDATORY: Reject if no location provided
      const error = new Error('Izin lokasi diperlukan untuk absensi pulang. Aktifkan GPS dan izinkan akses lokasi.');
      error.statusCode = 400;
      error.code = 'LOCATION_REQUIRED';
      error.isOperational = true;
      throw error;
    }

    // Update record with clock out time
    const clockOutTime = new Date();
    const totalHours = calculateTotalHours(existingRecord.clockIn, clockOutTime);

    // Validate duration: minimum 30 minutes, maximum 16 hours
    if (totalHours < 0.5) {
      const error = new Error(`Durasi kerja terlalu singkat (${Math.round(totalHours * 60)} menit). Minimum 30 menit.`);
      error.statusCode = 400;
      error.code = 'DURATION_TOO_SHORT';
      error.isOperational = true;
      throw error;
    }
    if (totalHours > 16) {
      const error = new Error(`Durasi kerja terlalu lama (${totalHours.toFixed(1)} jam). Jika lupa clock-out kemarin, hubungi admin.`);
      error.statusCode = 400;
      error.code = 'DURATION_TOO_LONG';
      error.isOperational = true;
      throw error;
    }

    // Klasifikasi durasi terhadap shift efektif hari itu.
    //   durasi < setengah shift      -> ABSENT   (potong jatah libur 1 hari)
    //   setengah..penuh-toleransi    -> HALF_DAY (potong jatah libur 1 hari)
    //   hadir penuh                  -> status dari clock-in tidak diubah
    const recordDateStr = toWITADateString(existingRecord.date);
    const { shift: effectiveShift, source: shiftSource } = await this.resolveEffectiveShift(userId, recordDateStr);

    const workedMinutes = Math.round((clockOutTime.getTime() - existingRecord.clockIn.getTime()) / 60000);
    const classification = effectiveShift ? this.classifyByDuration(workedMinutes, effectiveShift) : null;

    const updateData = {
      clockOut: clockOutTime,
      clockOutLocation: formatLocation(location),
      clockOutPhoto: photo, // Store photo path
      clockOutIp: ipAddress, // Store IP
    };

    if (classification) {
      const label = classification.status === 'ABSENT' ? 'Tidak Hadir' : 'Setengah Hari';
      const shiftWindow = `${effectiveShift.startTime}-${effectiveShift.endTime}${shiftSource ? `, ${shiftSource}` : ''}`;
      updateData.status = classification.status;
      updateData.notes = appendNote(
        existingRecord.notes,
        `[${label}: ${classification.reason} | shift ${shiftWindow} | potong jatah libur 1 hari]`
      );
    }

    const updatedRecord = await attendanceRepository.update(existingRecord.id, updateData);

    return {
      ...updatedRecord,
      totalHours,
      durationMinutes: workedMinutes,
      shift: effectiveShift || null,
      attendanceNote: classification ? classification.reason : null,
    };
  }

  /**
   * Get today's attendance for user
   */
  async getToday(userId) {
    const record = await attendanceRepository.findTodayByUserId(userId);

    // Single backup query reused for isOffDay, isBackup, and backupPositionName.
    // Use UTC midnight boundaries of today's WITA date to match how dates are stored (T00:00:00Z).
    const now = new Date();
    const todayWITAStr = toWITADateString(now);
    const todayUTCStart = new Date(`${todayWITAStr}T00:00:00.000Z`);
    const todayUTCEnd   = new Date(`${todayWITAStr}T23:59:59.999Z`);
    const backupToday = await prisma.backupAssignment.findFirst({
      where: { backupUserId: userId, date: { gte: todayUTCStart, lte: todayUTCEnd } },
    });

    // Resolve the position name the backup user is covering (separate query — no relation in schema)
    let backupPositionName = null;
    if (backupToday?.absentPositionId) {
      const pos = await prisma.position.findUnique({
        where: { id: backupToday.absentPositionId },
        select: { name: true },
      });
      backupPositionName = pos?.name ?? null;
    }

    // Single getTodaySchedule call — reused for both isOffDay and shift resolution
    const scheduleService = require('./scheduleService');
    const todaySchedule = await scheduleService.getTodaySchedule(userId);

    // Check ManualOffDay — fallback only when no UserSchedule row exists
    const manualOffToday = await prisma.manualOffDay.findFirst({
      where: { userId, date: { gte: todayUTCStart, lte: todayUTCEnd } },
    });

    // Check Leave APPROVED covering today — fallback only
    const leaveToday = await prisma.leave.findFirst({
      where: {
        userId,
        status: 'APPROVED',
        startDate: { lte: todayUTCEnd },
        endDate:   { gte: todayUTCStart },
      },
    });

    // Check OffDayRequest APPROVED covering today — swap-aware, fallback only
    // For swap: pemohon libur di workDate, target libur di offDate.
    // Legacy (targetUserId null): pemohon libur di offDate.
    const offReqToday = await prisma.offDayRequest.findFirst({
      where: {
        status: 'APPROVED',
        OR: [
          { userId, workDate: { gte: todayUTCStart, lte: todayUTCEnd } },
          { userId, offDate: { gte: todayUTCStart, lte: todayUTCEnd }, targetUserId: null },
          { targetUserId: userId, offDate: { gte: todayUTCStart, lte: todayUTCEnd } },
        ],
      },
    });

    const hasOffSource = !!(manualOffToday || leaveToday || offReqToday);

    // Determine off-day status — backup duty always overrides any off-day source
    let isOffDay = false;
    if (!backupToday) {
      if (todaySchedule) {
        // UserSchedule is source of truth — already reflects swap/override/regen.
        // Do NOT union with ManualOffDay/Leave/OffDayRequest: those may be stale
        // (e.g. ManualOffDay created before swap approval, OffDayRequest whose
        // offDate is the day the requester actually WORKS after swap).
        isOffDay = todaySchedule.isOffDay;
      } else if (hasOffSource) {
        // No UserSchedule row — fall back to other off-day sources
        isOffDay = true;
      }
      // If no schedule and no record → noSchedule flag handles this below
    }

    // Resolve shift for display: use schedule shift when available and not off-day.
    // When noSchedule === true, shift is null and canClockIn is false.
    const noSchedule = !backupToday && !todaySchedule && !record;
    let shift = null;
    if (!isOffDay && !noSchedule) {
      // Shift efektif WAJIB menghormati BackupAssignment.shiftNumber. Tanpa ini,
      // staff yang merangkap posisi dengan shift 2 tetap tampil Shift 1 di
      // dashboard padahal jadwal (rotationService.getMySchedule) menampilkan Shift 2.
      const resolved = await this.resolveEffectiveShift(userId, todayWITAStr);
      shift = resolved.shift ?? record?.user?.shift ?? null;
    }

    const response = {
      id: record?.id || null,
      userId,
      date: toWITADateString(now),
      clockIn: record?.clockIn || null,
      clockOut: record?.clockOut || null,
      status: record ? formatStatus(record.status) : null,
      shift: shift,
      canClockIn: !record && !isOffDay && !noSchedule,
      canClockOut: !!(record && !record.clockOut),
      isOffDay,
      noSchedule,
      isBackup: !!backupToday,
      // Position name the backup user is covering, e.g. "Kasir" or "Barista"
      backupPositionName,
      schedule: shift,
    };

    return response;
  }

  /**
   * Get attendance history for user
   */
  async getHistory(userId, options) {
    const result = await attendanceRepository.getUserHistory(userId, options);

    // Format records for API response
    // PENTING: tampilkan tanggal sesuai WITA (UTC+8), bukan UTC.
    // Record lama menyimpan date sebagai UTC-midnight dari tanggal WITA
    // (mis. 2026-08-31T16:00Z = 1 Sep 00:00 WITA) — jika diformat UTC akan
    // tampil sebagai hari sebelumnya di riwayat staff.
    const formattedRecords = result.records.map((record) => {
      return {
        id: record.id,
        date: toWITADateString(record.date),
        clockIn: record.clockIn.toISOString(),
        clockOut: record.clockOut ? record.clockOut.toISOString() : null,
        status: formatStatus(record.status),
        totalHours: record.clockOut
          ? calculateTotalHours(record.clockIn, record.clockOut)
          : null,
      };
    });

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
      date: toWITADateString(record.date),
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
  async updateAdmin(id, updates, adminId = null) {
    const record = await attendanceRepository.findById(id);

    if (!record) {
      throw ErrorCodes.ATTENDANCE_ERRORS.ATTENDANCE_NOT_FOUND;
    }

    // Validate updates: ensure clockOut is always after clockIn
    const effectiveClockIn = updates.clockIn || record.clockIn;
    const effectiveClockOut = updates.clockOut || record.clockOut;

    if (effectiveClockIn && effectiveClockOut) {
      const clockInTime = new Date(effectiveClockIn);
      const clockOutTime = new Date(effectiveClockOut);

      if (clockOutTime < clockInTime) {
        const clockInDate = clockInTime.toISOString().split('T')[0];
        const clockOutDate = clockOutTime.toISOString().split('T')[0];

        // Allow cross-midnight if dates are different
        if (clockInDate === clockOutDate) {
          const error = new Error('Jam keluar harus setelah jam masuk');
          error.statusCode = 400;
          error.code = 'VALIDATION_ERROR';
          error.isOperational = true;
          throw error;
        }
      }
    }

    // Parse status to DB enum if provided
    const status = updates.status ? parseStatus(updates.status) : undefined;

    const updatedRecord = await attendanceRepository.update(id, {
      ...updates,
      ...(status && { status }),
    });

    // Audit trail: log admin edit
    await auditService.logAttendanceUpdate(adminId, id, {
      before: { clockIn: record.clockIn, clockOut: record.clockOut, status: record.status },
      after: updates,
    });

    return {
      id: updatedRecord.id,
      userId: updatedRecord.userId,
      date: toWITADateString(updatedRecord.date),
      clockIn: updatedRecord.clockIn.toISOString(),
      clockOut: updatedRecord.clockOut ? updatedRecord.clockOut.toISOString() : null,
      status: formatStatus(updatedRecord.status),
      notes: updatedRecord.notes,
    };
  }

  /**
   * Admin: Isi jam pulang untuk record yang lupa clock-out.
   *
   * Jam pulang = akhir shift efektif hari itu + 1 jam
   * (Shift 1 08:15-20:00 -> 21:00, Shift 2 11:00-22:30 -> 23:30).
   * Setelah jam pulang terisi, durasi tetap dinilai dengan aturan setengah hari:
   *   - masuk tepat waktu  -> hadir penuh, jatah libur aman
   *   - masuk telat > toleransi -> HALF_DAY / ABSENT, potong jatah 1 hari
   *
   * Selalu jalankan dengan dryRun: true dulu untuk melihat dampaknya.
   *
   * @param {Object} params - { from, to, userId, dryRun }
   *   from/to = tanggal WITA "YYYY-MM-DD" inklusif. Default: awal bulan s/d kemarin.
   * @param {Number} adminId
   */
  async fillMissingClockOut({ from, to, userId, dryRun = true } = {}, adminId) {
    const nowWITA = toWITA(new Date());
    const todayStr = nowWITA.toISOString().slice(0, 10);

    // Default rentang: awal bulan ini s/d kemarin (hari ini shiftnya bisa masih jalan)
    const monthStartStr = `${todayStr.slice(0, 7)}-01`;
    const yesterdayWITA = new Date(nowWITA);
    yesterdayWITA.setUTCDate(yesterdayWITA.getUTCDate() - 1);
    const defaultTo = yesterdayWITA.toISOString().slice(0, 10);

    const fromStr = from || monthStartStr;
    const toStr = to || defaultTo;

    const rangeStart = new Date(`${fromStr}T00:00:00+08:00`);
    const rangeEnd = new Date(`${toStr}T23:59:59+08:00`);

    if (rangeEnd < rangeStart) {
      const error = new Error('Tanggal akhir harus setelah tanggal awal.');
      error.statusCode = 400;
      error.isOperational = true;
      throw error;
    }

    const dangling = await prisma.attendance.findMany({
      where: {
        clockOut: null,
        date: { gte: rangeStart, lte: rangeEnd },
        ...(userId ? { userId: parseInt(userId) } : {}),
      },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: [{ date: 'asc' }, { userId: 'asc' }],
    });

    const results = [];

    for (const record of dangling) {
      const dateStr = toWITADateString(record.date);
      const { shift, source } = await this.resolveEffectiveShift(record.userId, dateStr);

      if (!shift) {
        results.push({
          id: record.id,
          userId: record.userId,
          name: record.user?.fullName || null,
          date: dateStr,
          action: 'SKIPPED',
          reason: 'tidak ada acuan shift (backup/swap/jadwal/default)',
        });
        continue;
      }

      // Jam pulang otomatis = akhir shift + 1 jam
      const shiftEnd = getShiftEndInstant(dateStr, shift.startTime, shift.endTime);
      const autoClockOut = new Date(shiftEnd.getTime() + 60 * 60 * 1000);

      if (autoClockOut <= record.clockIn) {
        results.push({
          id: record.id,
          userId: record.userId,
          name: record.user?.fullName || null,
          date: dateStr,
          action: 'SKIPPED',
          reason: 'jam pulang otomatis jatuh sebelum jam masuk — periksa manual',
        });
        continue;
      }

      const workedMinutes = Math.round((autoClockOut.getTime() - record.clockIn.getTime()) / 60000);
      const classification = this.classifyByDuration(workedMinutes, shift);
      const autoTimeLabel = toWITA(autoClockOut).toISOString().slice(11, 16);

      let note = `[Auto clock-out oleh admin: shift ${shift.startTime}-${shift.endTime}${source ? `, ${source}` : ''} berakhir + 1 jam (${autoTimeLabel})]`;
      if (classification) {
        const label = classification.status === 'ABSENT' ? 'Tidak Hadir' : 'Setengah Hari';
        note += ` [${label}: ${classification.reason} | potong jatah libur 1 hari]`;
      }

      if (!dryRun) {
        await attendanceRepository.update(record.id, {
          clockOut: autoClockOut,
          status: classification ? classification.status : record.status,
          notes: appendNote(record.notes, note),
        });
        await auditService.logAutoClockout(record.id, record.userId, autoClockOut);
      }

      results.push({
        id: record.id,
        userId: record.userId,
        name: record.user?.fullName || null,
        date: dateStr,
        action: classification ? 'POTONG JATAH 1 HARI' : 'HADIR PENUH',
        clockIn: toWITA(record.clockIn).toISOString().slice(11, 16),
        clockOut: autoTimeLabel,
        shift: `${shift.startTime}-${shift.endTime}`,
        shiftSource: source,
        workedMinutes,
        workedLabel: formatDurationMinutes(workedMinutes),
        previousStatus: record.status,
        newStatus: classification ? classification.status : record.status,
        reason: classification ? classification.reason : 'durasi memenuhi shift penuh',
      });
    }

    const applied = results.filter((r) => r.action !== 'SKIPPED');
    const cut = applied.filter((r) => r.action === 'POTONG JATAH 1 HARI');

    return {
      dryRun,
      from: fromStr,
      to: toStr,
      found: dangling.length,
      updated: dryRun ? 0 : applied.length,
      fullDay: applied.length - cut.length,
      cutDays: cut.length,
      skipped: results.length - applied.length,
      records: results,
      message: dryRun
        ? `Pratinjau: ${dangling.length} record tanpa jam pulang, ${cut.length} akan potong jatah libur 1 hari.`
        : `Selesai: ${applied.length} record diisi jam pulangnya, ${cut.length} potong jatah libur 1 hari.`,
    };
  }

  /**
   * Admin: Catat pegawai pulang cepat karena sakit & opsi kompensasi libur
   */
  async processSickEarlyLeave(data, adminId) {
    const { userId, date, clockOut, reason, convertOffDayDate } = data;

    // Boundary pencarian hari (WITA +08:00 & UTC)
    const startDate = new Date(`${date}T00:00:00+08:00`);
    const endDate = new Date(`${date}T23:59:59+08:00`);

    // 1. Cari record Attendance hari tersebut
    let record = await prisma.attendance.findFirst({
      where: {
        userId: parseInt(userId),
        date: {
          gte: new Date(`${date}T00:00:00.000Z`),
          lte: new Date(`${date}T23:59:59.999Z`),
        },
      },
    });

    // Fallback jika disimpan dengan boundary WITA
    if (!record) {
      record = await prisma.attendance.findFirst({
        where: {
          userId: parseInt(userId),
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
      });
    }

    const clockOutDate = clockOut ? new Date(clockOut) : new Date();

    // Ambang setengah hari = setengah durasi shift efektif hari itu
    // (bukan lagi angka tetap 240 menit). Shift 1 08:15-20:00 -> 352 menit,
    // Shift 2 11:00-22:30 -> 345 menit.
    const { shift: sickShift, source: sickShiftSource } = await this.resolveEffectiveShift(parseInt(userId), date);
    const halfThresholdMinutes = sickShift
      ? getHalfDayThresholdMinutes(sickShift.startTime, sickShift.endTime)
      : 240; // fallback bila tidak ada acuan shift sama sekali

    // Hitung apakah pegawai sudah bekerja minimal setengah durasi shift
    let finalStatus = 'PRESENT';
    if (record && record.clockIn) {
      const workDurationMinutes = (clockOutDate.getTime() - new Date(record.clockIn).getTime()) / (1000 * 60);
      if (workDurationMinutes < halfThresholdMinutes) {
        finalStatus = 'HALF_DAY';
      }
    } else {
      // Belum ada clock-in sama sekali saat admin input pulang sakit
      finalStatus = 'HALF_DAY';
    }

    const shiftLabel = sickShift ? `${sickShift.startTime}-${sickShift.endTime}${sickShiftSource ? `, ${sickShiftSource}` : ''}` : 'tanpa acuan shift';
    const statusLabel = finalStatus === 'HALF_DAY'
      ? `SETENGAH HARI - kurang dari ${formatDurationMinutes(halfThresholdMinutes)} dari shift ${shiftLabel} - potong jatah libur 1 hari`
      : 'HADIR FULL';
    const noteText = `[PULANG SAKIT - ${statusLabel}] ${reason || 'Izin pulang awal karena sakit'}`;

    if (record) {
      // Update record absensi yang sudah ada
      record = await attendanceRepository.update(record.id, {
        clockOut: clockOutDate,
        status: finalStatus,
        notes: record.notes ? `${record.notes} | ${noteText}` : noteText,
      });
    } else {
      // Jika pegawai belum absen sama sekali hari ini, buat record baru setengah hari
      record = await prisma.attendance.create({
        data: {
          userId: parseInt(userId),
          date: startDate,
          clockIn: new Date(`${date}T08:00:00+08:00`),
          clockOut: clockOutDate,
          status: finalStatus,
          notes: noteText,
        },
      });
    }

    // Update atau buat UserSchedule tanggal izin pulang sakit agar ada keterangan SAKIT di jadwal
    const sickDateStart = new Date(`${date}T00:00:00.000Z`);
    const sickDateEnd = new Date(`${date}T23:59:59.999Z`);
    const todaySchedule = await prisma.userSchedule.findFirst({
      where: {
        userId: parseInt(userId),
        date: { gte: sickDateStart, lte: sickDateEnd },
      },
    });
    if (todaySchedule) {
      await prisma.userSchedule.update({
        where: { id: todaySchedule.id },
        data: {
          temporaryDepartment: `PULANG SAKIT (${statusLabel})`,
        },
      });
    } else {
      await prisma.userSchedule.create({
        data: {
          userId: parseInt(userId),
          date: sickDateStart,
          temporaryDepartment: `PULANG SAKIT (${statusLabel})`,
          isManualOverride: true,
        },
      });
    }

    let convertedSchedule = null;

    // 2. Jika admin memilih tanggal libur untuk dikompensasi (dijadikan hari kerja)
    if (convertOffDayDate) {
      const compDateStart = new Date(`${convertOffDayDate}T00:00:00.000Z`);
      const compDateEnd = new Date(`${convertOffDayDate}T23:59:59.999Z`);

      const existingSchedule = await prisma.userSchedule.findFirst({
        where: {
          userId: parseInt(userId),
          date: { gte: compDateStart, lte: compDateEnd },
        },
      });

      if (existingSchedule) {
        convertedSchedule = await prisma.userSchedule.update({
          where: { id: existingSchedule.id },
          data: {
            isOffDay: false,
            isManualOverride: true,
            temporaryDepartment: `KOMPENSASI SAKIT (${date})`,
          },
        });
      } else {
        // Tidak ada UserSchedule existing — buat baru.
        // Coba ambil shiftId dari WeeklySchedule minggu ini agar shift terisi.
        let compShiftId = null;
        try {
          const compMonday = (() => {
            const d = new Date(compDateStart);
            const day = d.getUTCDay();
            const diff = (day === 0 ? -6 : 1 - day);
            d.setUTCDate(d.getUTCDate() + diff);
            d.setUTCHours(0, 0, 0, 0);
            return d;
          })();
          const ws = await prisma.weeklySchedule.findFirst({
            where: { userId: parseInt(userId), weekStart: compMonday },
            select: { shiftNumber: true },
          });
          if (ws?.shiftNumber) {
            const shifts = await prisma.shift.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
            const shiftEntry = shifts[ws.shiftNumber - 1];
            if (shiftEntry) compShiftId = shiftEntry.id;
          }
        } catch (_) { /* tidak kritis, lanjut tanpa shiftId */ }

        convertedSchedule = await prisma.userSchedule.create({
          data: {
            userId: parseInt(userId),
            date: compDateStart,
            isOffDay: false,
            isManualOverride: true,
            temporaryDepartment: `KOMPENSASI SAKIT (${date})`,
            ...(compShiftId ? { shiftId: compShiftId } : {}),
          },
        });
      }

      // Hapus ManualOffDay untuk tanggal kompensasi agar sumber libur union
      // (getMySchedule/syncSchedulesForUserDates) tidak lagi menandai hari
      // tersebut sebagai libur setelah dijadikan hari kerja pengganti.
      await prisma.manualOffDay.deleteMany({
        where: {
          userId: parseInt(userId),
          date: { gte: compDateStart, lte: new Date(`${convertOffDayDate}T23:59:59.999Z`) },
        },
      });

      // Kirim notifikasi ke pegawai tentang kompensasi libur
      const notificationService = require('./notificationService');
      await notificationService.create(
        parseInt(userId),
        'Penyesuaian Jadwal Libur',
        `Jadwal libur Anda pada ${convertOffDayDate} diubah menjadi HARI KERJA sebagai kompensasi izin pulang sakit (${date}).`,
        'SCHEDULE_CHANGE'
      );
    }

    // 3. Log Audit
    await auditService.log({
      userId: adminId,
      action: 'SICK_EARLY_LEAVE',
      entityType: 'ATTENDANCE',
      entityId: record.id,
      details: {
        userId,
        date,
        clockOut: clockOutDate,
        reason,
        convertOffDayDate: convertOffDayDate || null,
      },
    });

    return {
      attendance: record,
      convertedSchedule,
      isHalfDay: finalStatus === 'HALF_DAY',
      status: finalStatus,
      message: `Absensi diset Pulang Sakit (${statusLabel}).${
        convertOffDayDate
          ? ` Hari libur ${convertOffDayDate} berhasil diubah menjadi hari kerja (Kompensasi Sakit ${date}).`
          : ''
      }`,
    };
  }

  /**
   * Admin: Get all attendance records with filters
   */
  async getAll(options) {
    const result = await attendanceRepository.findAll(options);

    // Format records — replace Base64 photos with API endpoint URLs to avoid large payloads
    const apiBase = process.env.API_BASE_URL || '';
    const formattedRecords = result.records.map((record) => ({
      id: record.id,
      user: record.user,
      date: toWITADateString(record.date),
      clockIn: record.clockIn.toISOString(),
      clockOut: record.clockOut ? record.clockOut.toISOString() : null,
      clockInPhoto: record.clockInPhoto ? `${apiBase}/api/v1/attendance/photo/${record.id}/in` : null,
      clockOutPhoto: record.clockOutPhoto ? `${apiBase}/api/v1/attendance/photo/${record.id}/out` : null,
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
   * Admin: Create attendance record manual untuk tanggal lampau
   * Input: userId, date (YYYY-MM-DD), clockIn (HH:mm), clockOut (HH:mm opsional), status, notes
   */
  async createManual(data, adminId = null) {
    const { userId, date, clockIn, clockOut, status, notes } = data;

    // Pastikan user ada
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      const error = new Error('Karyawan tidak ditemukan');
      error.statusCode = 404;
      error.code = 'USER_NOT_FOUND';
      error.isOperational = true;
      throw error;
    }

    // Bangun DateTime WITA dari date + waktu (simpan sebagai UTC di DB)
    // date = "2026-09-01", clockIn = "08:00" → 2026-09-01T08:00:00+08:00
    const clockInISO = new Date(`${date}T${clockIn}:00+08:00`);
    if (isNaN(clockInISO.getTime())) {
      const error = new Error('Format jam masuk tidak valid');
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      error.isOperational = true;
      throw error;
    }

    let clockOutISO = null;
    if (clockOut && clockOut.trim() !== '') {
      clockOutISO = new Date(`${date}T${clockOut}:00+08:00`);
      if (isNaN(clockOutISO.getTime())) {
        const error = new Error('Format jam keluar tidak valid');
        error.statusCode = 400;
        error.code = 'VALIDATION_ERROR';
        error.isOperational = true;
        throw error;
      }
      // Izinkan lintas tengah malam (mis. shift malam), tapi cegah kalau hari sama dan keluar < masuk
      if (clockOutISO <= clockInISO) {
        // Coba anggap clock-out hari berikutnya
        clockOutISO = new Date(`${date}T${clockOut}:00+08:00`);
        clockOutISO.setDate(clockOutISO.getDate() + 1);
      }
    }

    // date kolom = WITA midnight disimpan sebagai UTC instant
    const dateUTC = new Date(`${date}T00:00:00+08:00`);

    // Cek duplikat: sudah ada record untuk userId + date ini?
    const existing = await prisma.attendance.findFirst({
      where: {
        userId,
        date: { gte: new Date(`${date}T00:00:00+08:00`), lte: new Date(`${date}T23:59:59+08:00`) },
      },
    });
    if (existing) {
      const error = new Error(`Absensi untuk karyawan ini pada tanggal ${date} sudah ada (ID: ${existing.id}). Edit data yang sudah ada.`);
      error.statusCode = 409;
      error.code = 'DUPLICATE_ATTENDANCE';
      error.isOperational = true;
      throw error;
    }

    // Hitung lateMinutes (opsional, pakai 0 jika tidak bisa cek shift)
    let lateMinutes = 0;

    // Hitung status otomatis kalau tidak disupply
    const dbStatus = status ? parseStatus(status) : 'PRESENT';

    const record = await prisma.attendance.create({
      data: {
        userId,
        date: dateUTC,
        clockIn: clockInISO,
        clockOut: clockOutISO,
        status: dbStatus,
        lateMinutes,
        notes: notes || `Ditambahkan manual oleh admin (ID: ${adminId})`,
        clockInLocation: 'Manual oleh admin',
        clockOutLocation: clockOutISO ? 'Manual oleh admin' : null,
      },
    });

    // Audit trail
    await auditService.logAttendanceUpdate(adminId, record.id, {
      before: null,
      after: { userId, date, clockIn, clockOut, status: dbStatus },
      action: 'MANUAL_CREATE',
    });

    return {
      id: record.id,
      userId: record.userId,
      date: toWITADateString(record.date),
      clockIn: record.clockIn.toISOString(),
      clockOut: record.clockOut ? record.clockOut.toISOString() : null,
      status: formatStatus(record.status),
      notes: record.notes,
    };
  }

  /**
   * Admin: Delete attendance record
   */
  async deleteAttendance(id, adminId = null) {
    const record = await attendanceRepository.findById(id);

    if (!record) {
      throw ErrorCodes.ATTENDANCE_ERRORS.ATTENDANCE_NOT_FOUND;
    }

    await attendanceRepository.delete(id);

    // Audit trail: log admin delete
    await auditService.logAttendanceDelete(adminId, id, {
      userId: record.userId,
      date: record.date,
      clockIn: record.clockIn,
      clockOut: record.clockOut,
      status: record.status,
    });

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
