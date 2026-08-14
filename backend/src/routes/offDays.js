const express = require('express');
const router = express.Router();
const offDayController = require('../controllers/offDayController');
const { authenticate, authorize } = require('../middleware/auth');

// Base: /api/v1/off-days (mounted in routes/index.js)

// All routes require authentication
router.use(authenticate);

// Employee creates off-day swap request
router.post('/', offDayController.createRequest);

// Employee gets their own requests
router.get('/my', offDayController.getMyRequests);

// Employee gets requests needing their response (inbox)
router.get('/inbox', offDayController.getInbox);

// Target employee responds (accept/reject)
router.post('/:id/respond', offDayController.respondToRequest);

// Requester cancels their own request
router.post('/:id/cancel', offDayController.cancelRequest);

// Admin routes
router.get('/', authorize('ADMIN', 'OWNER'), offDayController.getAllRequests);
router.get('/pending-admin-approval', authorize('ADMIN', 'OWNER'), offDayController.getPendingAdminApproval);
router.post('/:id/approve', authorize('ADMIN', 'OWNER'), offDayController.approveByAdmin);

module.exports = router;