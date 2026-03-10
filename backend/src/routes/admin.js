const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const offDayController = require('../controllers/offDayController');
const { authenticate, authorize } = require('../middleware/auth');
const { validate, validateQuery } = require('../utils/validator');
const {
  createUserSchema,
  updateUserSchema,
  adminAttendanceQuerySchema,
  updateAttendanceSchema,
  updateConfigSchema,
  usersQuerySchema,
  reportQuerySchema,
} = require('../utils/validator');

// All routes require authentication and admin role
router.use(authenticate, authorize('ADMIN'));

// Dashboard stats
router.get('/dashboard-stats', adminController.getDashboardStats);

// User Management Routes

/**
 * @route   GET /api/v1/admin/users
 * @desc    List all users
 * @access  Private (Admin)
 */
router.get('/users', validateQuery(usersQuerySchema), adminController.listUsers);

/**
 * @route   POST /api/v1/admin/users
 * @desc    Create new user
 * @access  Private (Admin)
 */
router.post('/users', validate(createUserSchema), adminController.createUser);

/**
 * @route   GET /api/v1/admin/users/next-id
 * @desc    Get next available Employee ID
 * @access  Private (Admin)
 */
router.get('/users/next-id', adminController.getNextEmployeeId);

/**
 * @route   GET /api/v1/admin/users/:id
 * @desc    Get user by ID
 * @access  Private (Admin)
 */
router.get('/users/:id', adminController.getUserById);

/**
 * @route   PUT /api/v1/admin/users/:id
 * @desc    Update user
 * @access  Private (Admin)
 */
router.put('/users/:id', validate(updateUserSchema), adminController.updateUser);

/**
 * @route   DELETE /api/v1/admin/users/:id
 * @desc    Deactivate user
 * @access  Private (Admin)
 */
router.delete('/users/:id', adminController.deleteUser);

// Attendance Management Routes

/**
 * @route   GET /api/v1/admin/attendance
 * @desc    Get all attendance records
 * @access  Private (Admin)
 */
router.get(
  '/attendance',
  validateQuery(adminAttendanceQuerySchema),
  adminController.getAllAttendance
);

/**
 * @route   PUT /api/v1/admin/attendance/:id
 * @desc    Update attendance record
 * @access  Private (Admin)
 */
router.put(
  '/attendance/:id',
  validate(updateAttendanceSchema),
  adminController.updateAttendance
);

/**
 * @route   DELETE /api/v1/admin/attendance/:id
 * @desc    Delete attendance record
 * @access  Private (Admin)
 */
router.delete(
  '/attendance/:id',
  adminController.deleteAttendance
);

// Report Routes

/**
 * @route   GET /api/v1/admin/reports/daily
 * @desc    Get daily attendance report
 * @access  Private (Admin)
 */
router.get('/reports/daily', validateQuery(reportQuerySchema), adminController.getDailyReport);

/**
 * @route   GET /api/v1/admin/reports/monthly
 * @desc    Get monthly attendance report
 * @access  Private (Admin)
 */
router.get('/reports/monthly', validateQuery(reportQuerySchema), adminController.getMonthlyReport);

/**
 * @route   GET /api/v1/admin/reports/export
 * @desc    Export attendance as CSV
 * @access  Private (Admin)
 */
router.get('/reports/export', validateQuery(reportQuerySchema), adminController.exportReport);

// Configuration Routes

/**
 * @route   GET /api/v1/admin/config
 * @desc    Get system configuration
 * @access  Private (Admin)
 */
router.get('/config', adminController.getConfig);

/**
 * @route   PUT /api/v1/admin/config
 * @desc    Update system configuration
 * @access  Private (Admin)
 */
router.put('/config', validate(updateConfigSchema), adminController.updateConfig);

// Off-Days Management Routes

/**
 * @route   GET /api/v1/admin/off-days
 * @desc    Get all off-day requests (Admin view)
 * @access  Private (Admin)
 */
router.get('/off-days', offDayController.getRequests);

/**
 * @route   PATCH /api/v1/admin/off-days/:id/approve
 * @desc    Approve off-day request
 * @access  Private (Admin)
 */
router.patch('/off-days/:id/approve', offDayController.approveRequest);

/**
 * @route   PATCH /api/v1/admin/off-days/:id/reject
 * @desc    Reject off-day request
 * @access  Private (Admin)
 */
router.patch('/off-days/:id/reject', offDayController.rejectRequest);

// Push Notification Broadcast Route

/**
 * @route   POST /api/v1/admin/notifications/broadcast
 * @desc    Broadcast a push notification to all active users
 * @access  Private (Admin)
 */
router.post('/notifications/broadcast', adminController.broadcastNotification);

module.exports = router;
