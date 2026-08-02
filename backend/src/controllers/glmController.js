const glmService = require('../services/glmService');
const { validationResult } = require('express-validator');

/**
 * GLM Controller
 * Handles all GLM AI endpoints
 */

/**
 * @route   POST /api/v1/glm/chat
 * @desc    Chat with AI assistant about attendance system
 * @access  Private
 */
exports.chat = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        },
      });
    }

    const { message, history = [] } = req.body;

    const response = await glmService.chatbot(message, history);

    res.status(200).json({
      success: true,
      data: {
        response,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Chat Error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CHAT_ERROR',
        message: error.message || 'Failed to process chat request',
      },
    });
  }
};

/**
 * @route   POST /api/v1/glm/analyze
 * @desc    Analyze attendance patterns using AI
 * @access  Private (Admin)
 */
exports.analyze = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        },
      });
    }

    const { attendanceData } = req.body;

    const analysis = await glmService.analyzeAttendance(attendanceData);

    res.status(200).json({
      success: true,
      data: {
        analysis,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Analysis Error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ANALYSIS_ERROR',
        message: error.message || 'Failed to analyze attendance data',
      },
    });
  }
};

/**
 * @route   POST /api/v1/glm/report
 * @desc    Generate attendance report using AI
 * @access  Private (Admin)
 */
exports.generateReport = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        },
      });
    }

    const { reportData, reportType = 'monthly' } = req.body;

    const report = await glmService.generateReport(reportData, reportType);

    res.status(200).json({
      success: true,
      data: {
        report,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Report Generation Error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REPORT_ERROR',
        message: error.message || 'Failed to generate report',
      },
    });
  }
};

/**
 * @route   GET /api/v1/glm/health
 * @desc    Check GLM API health status
 * @access  Private
 */
exports.healthCheck = async (req, res) => {
  try {
    // Simple test call to GLM API
    await glmService.chat([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
    ], { temperature: 0.7, max_tokens: 10 });

    res.status(200).json({
      success: true,
      data: {
        status: 'healthy',
        model: process.env.GLM_MODEL || 'glm-4-flash',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'GLM API is not accessible',
        details: error.message,
      },
    });
  }
};
