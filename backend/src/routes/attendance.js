const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { authenticate, authorize } = require('../middleware/auth');
const { validate, validateQuery } = require('../utils/validator');
const {
  clockInSchema,
  clockOutSchema,
  attendanceHistorySchema,
} = require('../utils/validator');
const { asyncHandler, successResponse } = require('../utils/response');
const prisma = require('../utils/database');
const upload = require('../middleware/upload');

router.post('/clock-in', authenticate, authorize('EMPLOYEE', 'ADMIN'), upload.single('photo'), validate(clockInSchema), attendanceController.clockIn);
router.post('/clock-out', authenticate, authorize('EMPLOYEE', 'ADMIN'), upload.single('photo'), validate(clockOutSchema), attendanceController.clockOut);
router.get('/today', authenticate, authorize('EMPLOYEE', 'ADMIN'), attendanceController.getToday);
router.get('/history', authenticate, authorize('EMPLOYEE', 'ADMIN'), validateQuery(attendanceHistorySchema), attendanceController.getHistory);
router.get('/monthly-summary', authenticate, authorize('EMPLOYEE', 'ADMIN'), attendanceController.getMonthlySummary);

/**
 * GET /api/v1/attendance/my-penalty?month=YYYY-MM
 * Rekap denda keterlambatan bertingkat:
 *   - Terlambat 15–30 mnt → latePenaltyAmount    (default Rp 7.500)
 *   - Terlambat > 30 mnt  → latePenaltyAmountHigh (default Rp 15.000)
 */
router.get('/my-penalty', authenticate, authorize('EMPLOYEE', 'ADMIN'), asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const now = new Date();
  const monthStr = req.query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [year, month] = monthStr.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  // Ambil semua config sekaligus
  const configs = await prisma.systemConfig.findMany({
    where: { key: { in: ['latePenaltyAmount', 'latePenaltyAmountHigh', 'workStartTime', 'lateGraceMinutes'] } }
  });
  const cfgMap = Object.fromEntries(configs.map(c => [c.key, c.value]));

  const penaltyLow = parseInt(cfgMap.latePenaltyAmount ?? '7500');   // 15–30 mnt
  const penaltyHigh = parseInt(cfgMap.latePenaltyAmountHigh ?? '15000'); // >30 mnt
  const workStart = cfgMap.workStartTime ?? '08:00';
  const graceMin = parseInt(cfgMap.lateGraceMinutes ?? '15');

  // Parse workStartTime ke menit sejak tengah malam
  const [wsH, wsM] = workStart.split(':').map(Number);
  const workStartMins = wsH * 60 + wsM;

  // Ambil semua absensi LATE bulan ini milik user
  const lateRecords = await prisma.attendance.findMany({
    where: { userId, status: 'LATE', date: { gte: startDate, lte: endDate } },
    orderBy: { date: 'asc' },
    select: { id: true, date: true, clockIn: true },
  });

  // Hitung denda per record
  const records = lateRecords.map(r => {
    const ci = new Date(r.clockIn);
    const clockInMins = ci.getHours() * 60 + ci.getMinutes();
    const minutesLate = Math.max(0, clockInMins - workStartMins - graceMin);
    const penalty = minutesLate > 30 ? penaltyHigh : penaltyLow;
    return {
      id: r.id,
      date: r.date.toLocaleDateString('en-CA'),
      clockIn: r.clockIn,
      minutesLate,
      penalty,
      tier: minutesLate > 30 ? 'high' : 'low',
    };
  });

  const totalDeduction = records.reduce((sum, r) => sum + r.penalty, 0);

  return successResponse(res, 200, {
    month: monthStr,
    lateCount: records.length,
    penaltyLow,
    penaltyHigh,
    totalDeduction,
    records,
  });
}));

router.get('/:id', authenticate, authorize('EMPLOYEE', 'ADMIN'), attendanceController.getById);

module.exports = router;
