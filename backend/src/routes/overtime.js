const express = require('express');
const router = express.Router();
const overtimeController = require('../controllers/overtimeController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/v1/overtime
 * @desc    Create overtime request (employee)
 * @access  Private
 */
router.post('/', overtimeController.createOvertime);

/**
 * @route   GET /api/v1/overtime/my
 * @desc    Get my overtime history
 * @access  Private
 */
router.get('/my', overtimeController.getMyOvertime);

/**
 * @route   GET /api/v1/overtime/my/summary
 * @desc    Get my overtime summary for a month
 * @access  Private
 */
router.get('/my/summary', overtimeController.getMySummary);

module.exports = router;