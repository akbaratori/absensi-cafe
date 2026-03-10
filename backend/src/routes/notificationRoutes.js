const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate); // All notification routes require auth

// In-app notifications
router.get('/', notificationController.getUserNotifications);
router.put('/:id/read', notificationController.markAsRead);
router.put('/read-all', notificationController.markAllAsRead);

// Web Push subscription management
router.get('/vapid-key', notificationController.getVapidPublicKey);
router.post('/subscribe', notificationController.subscribe);
router.delete('/unsubscribe', notificationController.unsubscribe);

module.exports = router;
