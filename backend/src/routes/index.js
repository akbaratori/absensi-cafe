const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const attendanceRoutes = require('./attendance');
const adminRoutes = require('./admin');
const glmRoutes = require('./glm');
const leaveRoutes = require('./leaves'); // Import leave routes
const publicRoutes = require('./public'); // Import public routes


/**
 * @route   GET /api/v1/health
 * @desc    Health check endpoint
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * @route   GET /api/v1/version
 * @desc    API version info
 * @access  Public
 */
router.get('/version', (req, res) => {
  res.status(200).json({
    success: true,
    version: '1.0.0',
    name: 'Attendance System API',
  });
});

// Mount route modules
router.use('/auth', authRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/admin', adminRoutes);
router.use('/glm', glmRoutes);
router.use('/leaves', leaveRoutes);
router.use('/public', publicRoutes);


router.use('/shifts', require('./shifts'));
router.use('/swaps', require('./swaps'));
router.use('/off-days', require('./offDays'));
router.use('/notifications', require('./notificationRoutes'));
router.use('/schedules', require('./schedules'));
router.use('/payroll', require('./payroll'));

module.exports = router;
