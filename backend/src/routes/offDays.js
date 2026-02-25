const express = require('express');
const router = express.Router();
const offDayController = require('../controllers/offDayController');
const { authenticate, authorize } = require('../middleware/auth');

// Apply protection to all routes
router.use(authenticate);

// Routes
router.post('/', offDayController.createRequest); // Create request
router.get('/', offDayController.getRequests); // List requests (User sees own, Admin sees all)
router.patch('/:id/approve', authorize('ADMIN'), offDayController.approveRequest); // Admin approve
router.patch('/:id/reject', authorize('ADMIN'), offDayController.rejectRequest); // Admin reject

module.exports = router;
