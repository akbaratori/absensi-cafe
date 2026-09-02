const express = require('express');
const router = express.Router();
const swapController = require('../controllers/swapController');
const { authenticate, authorize } = require('../middleware/auth');

// Base: /api/v1/swaps (mounted in routes/index.js)

// All routes require authentication
router.use(authenticate);

// Employee creates a new swap request
router.post('/', swapController.createRequest);

// Employee gets their own swaps
router.get('/my', swapController.getMySwaps);

// Employee gets swaps needing their response (inbox)
router.get('/inbox', swapController.getInbox);

// Target employee responds (accept/reject) to a swap
router.post('/:id/respond', swapController.respondToRequest);

// Requester cancels their own request
router.post('/:id/cancel', swapController.cancelRequest);

// Admin routes
router.get('/', authorize('ADMIN', 'OWNER'), swapController.getAllSwaps);
router.get('/pending-admin-approval', authorize('ADMIN', 'OWNER'), swapController.getPendingAdminApproval);
router.post('/:id/approve', authorize('ADMIN', 'OWNER'), swapController.approveByAdmin);
router.post('/:id/revert', authorize('ADMIN', 'OWNER'), swapController.revertByAdmin);

module.exports = router;