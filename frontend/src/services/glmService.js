import api from './api';

/**
 * GLM AI Service
 * Handles all AI-powered features using GLM API
 */

/**
 * Chat with AI assistant
 * @param {string} message - User message
 * @param {Array} history - Chat history
 * @returns {Promise<Object>} - AI response
 */
export const chatWithAI = async (message, history = []) => {
  const response = await api.post('/glm/chat', {
    message,
    history,
  });
  return response.data;
};

/**
 * Analyze attendance data using AI
 * @param {Object} attendanceData - Attendance data to analyze
 * @returns {Promise<Object>} - Analysis results
 */
export const analyzeAttendance = async (attendanceData) => {
  const response = await api.post('/glm/analyze', {
    attendanceData,
  });
  return response.data;
};

/**
 * Generate AI-powered report
 * @param {Object} reportData - Data for the report
 * @param {string} reportType - Type of report (daily, weekly, monthly)
 * @returns {Promise<Object>} - Generated report
 */
export const generateReport = async (reportData, reportType = 'monthly') => {
  const response = await api.post('/glm/report', {
    reportData,
    reportType,
  });
  return response.data;
};

/**
 * Check GLM API health status
 * @returns {Promise<Object>} - Health status
 */
export const checkHealth = async () => {
  const response = await api.get('/glm/health');
  return response.data;
};

export default {
  chatWithAI,
  analyzeAttendance,
  generateReport,
  checkHealth,
};
