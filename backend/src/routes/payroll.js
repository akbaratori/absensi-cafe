const express = require('express');
const router = express.Router();
const payrollController = require('../controllers/payrollController');
const { authenticate, authorize } = require('../middleware/auth');

// All routes require authentication and admin role
router.use(authenticate, authorize('ADMIN'));

/**
 * @route   GET /api/v1/payroll
 * @desc    Get payroll calculations
 * @access  Private (Admin)
 */
router.get('/', payrollController.getPayrollReport);

module.exports = router;
