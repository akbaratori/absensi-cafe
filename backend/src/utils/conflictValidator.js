/**
 * Reusable conflict validator for schedule conflicts.
 * Used by both ShiftSwap and OffDayRequest flows.
 */

const prisma = require('./database');

/**
 * Check if an employee has a schedule conflict on a given date.
 * A conflict exists if:
 * - The employee is on leave (approved) on that date
 * - The employee already has an approved shift swap on that date
 * - The employee already has an approved off-day swap involving that date
 * 
 * @param {number} employeeId
 * @param {Date} date
 * @param {number} [excludeSwapId] - ID swap yang sedang divalidasi, agar tidak cocok dengan dirinya sendiri
 * @returns {Promise<{ hasConflict: boolean, reason: string|null }>}
 */
async function checkEmployeeScheduleConflict(employeeId, date, excludeSwapId = null) {
  const checkDate = new Date(date);
  checkDate.setUTCHours(0, 0, 0, 0);

  const endOfDay = new Date(checkDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  // Check 1: Approved leave on the same day
  const leave = await prisma.leave.findFirst({
    where: {
      userId: employeeId,
      status: 'APPROVED',
      startDate: { lte: endOfDay },
      endDate: { gte: checkDate },
    },
  });

  if (leave) {
    return {
      hasConflict: true,
      reason: `Karyawan sedang cuti pada tanggal ${checkDate.toLocaleDateString('id-ID')}.`,
    };
  }

  // Check 2: Approved shift swap on the same day (as requester or target)
  const shiftSwap = await prisma.shiftSwap.findFirst({
    where: {
      date: checkDate,
      status: 'APPROVED',
      OR: [
        { requesterId: employeeId },
        { targetUserId: employeeId },
      ],
    },
  });

  if (shiftSwap) {
    return {
      hasConflict: true,
      reason: `Karyawan sudah memiliki tukar shift yang disetujui pada tanggal ${checkDate.toLocaleDateString('id-ID')}.`,
    };
  }

  // Check 3: Approved off-day request on the same day
  const offDay = await prisma.offDayRequest.findFirst({
    where: {
      status: 'APPROVED',
      OR: [
        { userId: employeeId, offDate: checkDate },
        { userId: employeeId, workDate: checkDate },
        { targetUserId: employeeId, offDate: checkDate },
        { targetUserId: employeeId, workDate: checkDate },
      ],
    },
  });

  if (offDay) {
    return {
      hasConflict: true,
      reason: `Karyawan sudah memiliki tukar libur yang disetujui pada tanggal ${checkDate.toLocaleDateString('id-ID')}.`,
    };
  }

  // Check 4: Pending shift swap (prevents double request, but not a hard conflict)
  // Kecualikan swap yang sedang divalidasi (excludeSwapId) agar tidak cocok dengan dirinya sendiri.
  const pendingSwapWhere = {
    date: checkDate,
    status: { in: ['PENDING_VALIDATION', 'PENDING_TARGET_RESPONSE', 'PENDING_APPROVAL'] },
    OR: [
      { requesterId: employeeId },
      { targetUserId: employeeId },
    ],
  };
  if (excludeSwapId) {
    pendingSwapWhere.id = { not: excludeSwapId };
  }
  const pendingSwap = await prisma.shiftSwap.findFirst({ where: pendingSwapWhere });

  if (pendingSwap) {
    return {
      hasConflict: true,
      reason: `Masih ada pengajuan tukar shift yang menunggu pada tanggal ${checkDate.toLocaleDateString('id-ID')}. Selesaikan atau batalkan dulu.`,
    };
  }

  // Check 5: Pending off-day request
  const pendingOffDay = await prisma.offDayRequest.findFirst({
    where: {
      status: { in: ['PENDING_VALIDATION', 'PENDING_TARGET_RESPONSE', 'PENDING_APPROVAL'] },
      OR: [
        { userId: employeeId, offDate: checkDate },
        { userId: employeeId, workDate: checkDate },
        { targetUserId: employeeId, offDate: checkDate },
        { targetUserId: employeeId, workDate: checkDate },
      ],
    },
  });

  if (pendingOffDay) {
    return {
      hasConflict: true,
      reason: `Masih ada pengajuan tukar libur yang menunggu pada tanggal ${checkDate.toLocaleDateString('id-ID')}. Selesaikan atau batalkan dulu.`,
    };
  }

  return { hasConflict: false, reason: null };
}

/**
 * Check if two employees can swap shifts on a given date.
 * Validates both employees against schedule conflicts.
 * 
 * @param {number} requesterId
 * @param {number} targetUserId
 * @param {Date} date
 * @param {number} [excludeSwapId] - ID swap yang sedang divalidasi (diteruskan ke cek konflik)
 * @returns {Promise<{ valid: boolean, errors: string[] }>}
 */
async function validateSwapEligibility(requesterId, targetUserId, date, excludeSwapId = null) {
  const errors = [];

  if (requesterId === targetUserId) {
    errors.push('Tidak dapat bertukar dengan diri sendiri.');
    return { valid: false, errors };
  }

  // Validate target exists and is active
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: { shift: true },
  });

  if (!target) {
    errors.push('Karyawan tujuan tidak ditemukan.');
    return { valid: false, errors };
  }

  if (!target.isActive) {
    errors.push('Karyawan tujuan sudah tidak aktif.');
    return { valid: false, errors };
  }

  // Check requester conflicts
  const requesterConflict = await checkEmployeeScheduleConflict(requesterId, date, excludeSwapId);
  if (requesterConflict.hasConflict) {
    errors.push(`Pemohon: ${requesterConflict.reason}`);
  }

  // Check target conflicts
  const targetConflict = await checkEmployeeScheduleConflict(targetUserId, date, excludeSwapId);
  if (targetConflict.hasConflict) {
    errors.push(`Karyawan tujuan: ${targetConflict.reason}`);
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  checkEmployeeScheduleConflict,
  validateSwapEligibility,
};