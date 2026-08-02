const express = require('express');
const router = express.Router();
const swapController = require('../controllers/swapController');
const { authenticate, authorize } = require('../middleware/auth');

// Base: /shifts/swaps (or just /swaps, let's decice in index.js)
// Let's use /api/v1/swaps

// Public (Authenticated)
router.post('/', authenticate, swapController.createRequest);
router.get('/my-swaps', authenticate, swapController.getMySwaps);
router.patch('/:id/approve', authenticate, swapController.approveByUser); // Target user approval
router.patch('/:id/reject', authenticate, swapController.rejectRequest); // Cancel/Reject

// Admin
router.get('/', authenticate, authorize('ADMIN', 'OWNER'), swapController.getAllSwaps);
router.patch('/:id/admin-approve', authenticate, authorize('ADMIN', 'OWNER'), swapController.approveByAdmin);

module.exports = router;
