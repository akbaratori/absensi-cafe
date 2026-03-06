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
 * Rekap denda keterlambatan bulan ini untuk user yang login
 */
router.get('/my-penalty', authenticate, authorize('EMPLOYEE', 'ADMIN'), asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const now = new Date();
  const monthStr = req.query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [year, month] = monthStr.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  // Ambil config denda (default Rp 10.000 per kejadian)
  const penaltyCfg = await prisma.systemConfig.findUnique({ where: { key: 'latePenaltyAmount' } });
  const penaltyAmount = penaltyCfg ? parseInt(penaltyCfg.value) : 10000;

  // Ambil semua absensi LATE bulan ini milik user ini
  const lateRecords = await prisma.attendance.findMany({
    where: { userId, status: 'LATE', date: { gte: startDate, lte: endDate } },
    orderBy: { date: 'asc' },
    select: { id: true, date: true, clockIn: true },
  });

  const totalDeduction = lateRecords.length * penaltyAmount;

  return successResponse(res, 200, {
    month: monthStr,
    lateCount: lateRecords.length,
    penaltyPerOccurrence: penaltyAmount,
    totalDeduction,
    records: lateRecords.map(r => ({
      id: r.id,
      date: r.date.toLocaleDateString('en-CA'),
      clockIn: r.clockIn,
    })),
  });
}));

router.get('/:id', authenticate, authorize('EMPLOYEE', 'ADMIN'), attendanceController.getById);

module.exports = router;
