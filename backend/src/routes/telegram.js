const express = require('express');
const router = express.Router();
const telegramController = require('../controllers/telegramController');
const { authenticate, authorize } = require('../middleware/auth');

// Initialize bot
router.post('/init', telegramController.initTelegram);

// Send test notification (admin only)
router.post('/test', authorize('ADMIN', 'OWNER'), telegramController.sendTestNotification);

// Send report (admin only)
router.post('/report', authorize('ADMIN', 'OWNER'), telegramController.sendAttendanceReport);

// Send reminders (admin only)
router.post('/reminders', authorize('ADMIN', 'OWNER'), telegramController.sendReminders);

module.exports = router;
