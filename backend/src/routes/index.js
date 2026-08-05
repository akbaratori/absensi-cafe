const express = require('express');
const router = express.Router();
const authRoutes = require('./auth');
const attendanceRoutes = require('./attendance');
const adminRoutes = require('./admin');
const glmRoutes = require('./glm');
const leaveRoutes = require('./leaves');
const publicRoutes = require('./public');
const overtimeRoutes = require('./overtime');

// Mount route modules
router.use('/auth', authRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/admin', adminRoutes);
router.use('/glm', glmRoutes);
router.use('/leaves', leaveRoutes);
router.use('/public', publicRoutes);
router.use('/overtime', overtimeRoutes);

router.use('/shifts', require('./shifts'));
router.use('/swaps', require('./swaps'));
router.use('/off-days', require('./offDays'));
router.use('/notifications', require('./notificationRoutes'));
router.use('/schedules', require('./schedules'));
router.use('/payroll', require('./payroll'));

module.exports = router;