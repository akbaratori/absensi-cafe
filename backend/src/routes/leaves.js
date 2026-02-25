const express = require('express');
const router = express.Router();
const leaveController = require('../controllers/leaveController');
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Base route: /leaves (configured in app.js)

// Employee Routes
router.post('/', authenticate, upload.single('proof'), leaveController.createLeave);
router.get('/my-leaves', authenticate, leaveController.getMyLeaves);
router.get('/quota', authenticate, leaveController.getLeaveQuota);

// Admin Routes
router.get('/', authenticate, authorize('ADMIN', 'OWNER'), leaveController.getAllLeaves);
router.patch('/:id/status', authenticate, authorize('ADMIN', 'OWNER'), leaveController.updateLeaveStatus);
router.delete('/:id', authenticate, authorize('ADMIN', 'OWNER'), leaveController.deleteLeave);

module.exports = router;
