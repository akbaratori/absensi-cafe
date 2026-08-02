const express = require('express');
const router = express.Router();
const glmController = require('../controllers/glmController');
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/auth');

/**
 * @route   POST /api/v1/glm/chat
 * @desc    Chat with AI assistant
 * @access  Private
 */
router.post(
  '/chat',
  authenticate,
  [
    body('message')
      .trim()
      .notEmpty()
      .withMessage('Message is required')
      .isLength({ min: 1, max: 1000 })
      .withMessage('Message must be between 1 and 1000 characters'),
  ],
  glmController.chat
);

/**
 * @route   POST /api/v1/glm/analyze
 * @desc    Analyze attendance patterns using AI
 * @access  Private (Admin only)
 */
router.post(
  '/analyze',
  authenticate,
  authorize(['admin']),
  [
    body('attendanceData')
      .notEmpty()
      .withMessage('Attendance data is required')
      .isObject()
      .withMessage('Attendance data must be an object'),
  ],
  glmController.analyze
);

/**
 * @route   POST /api/v1/glm/report
 * @desc    Generate attendance report using AI
 * @access  Private (Admin only)
 */
router.post(
  '/report',
  authenticate,
  authorize(['admin']),
  [
    body('reportData')
      .notEmpty()
      .withMessage('Report data is required')
      .isObject()
      .withMessage('Report data must be an object'),
    body('reportType')
      .optional()
      .isIn(['daily', 'weekly', 'monthly'])
      .withMessage('Report type must be daily, weekly, or monthly'),
  ],
  glmController.generateReport
);

/**
 * @route   GET /api/v1/glm/health
 * @desc    Check GLM API health
 * @access  Private
 */
router.get('/health', authenticate, glmController.healthCheck);

module.exports = router;
