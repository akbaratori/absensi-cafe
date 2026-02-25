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

const upload = require('../middleware/upload');

/**
 * @route   POST /api/v1/attendance/clock-in
 * @desc    Clock in
 * @access  Private (Employee, Admin)
 */
router.post(
  '/clock-in',
  authenticate,
  authorize('EMPLOYEE', 'ADMIN'),
  upload.single('photo'),
  validate(clockInSchema),
  attendanceController.clockIn
);

/**
 * @route   POST /api/v1/attendance/clock-out
 * @desc    Clock out
 * @access  Private (Employee, Admin)
 */
router.post(
  '/clock-out',
  authenticate,
  authorize('EMPLOYEE', 'ADMIN'),
  upload.single('photo'),
  validate(clockOutSchema),
  attendanceController.clockOut
);

/**
 * @route   GET /api/v1/attendance/today
 * @desc    Get today's attendance
 * @access  Private (Employee, Admin)
 */
router.get(
  '/today',
  authenticate,
  authorize('EMPLOYEE', 'ADMIN'),
  attendanceController.getToday
);

/**
 * @route   GET /api/v1/attendance/history
 * @desc    Get attendance history
 * @access  Private (Employee, Admin)
 */
router.get(
  '/history',
  authenticate,
  authorize('EMPLOYEE', 'ADMIN'),
  validateQuery(attendanceHistorySchema),
  attendanceController.getHistory
);

/**
 * @route   GET /api/v1/attendance/monthly-summary
 * @desc    Get monthly summary for dashboard
 * @access  Private (Employee, Admin)
 */
router.get(
  '/monthly-summary',
  authenticate,
  authorize('EMPLOYEE', 'ADMIN'),
  attendanceController.getMonthlySummary
);

/**
 * @route   GET /api/v1/attendance/:id
 * @desc    Get specific attendance record
 * @access  Private (Employee, Admin)
 */
router.get(
  '/:id',
  authenticate,
  authorize('EMPLOYEE', 'ADMIN'),
  attendanceController.getById
);

module.exports = router;
