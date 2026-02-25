const express = require('express');
const router = express.Router();
const scheduleController = require('../controllers/scheduleController');
const { authenticate, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Generate schedule (Admin only)
router.post('/generate', authorize('ADMIN'), scheduleController.generateSchedule);

// Check conflicts (Admin only)
router.post('/check-conflicts', authorize('ADMIN'), scheduleController.checkConflicts);

// Distribute Kitchen Shifts (Admin only)
router.post('/distribute-kitchen', authorize('ADMIN'), scheduleController.distributeKitchenShifts);

// Redistribute Stations (Admin only) - Single Day
router.post('/redistribute-stations', authorize('ADMIN'), scheduleController.redistributeStations);

// Assign Station Rotation (Admin only) - Monthly Loop
router.post('/assign-stations', authorize('ADMIN'), scheduleController.assignStationsRotation);


// Manual update schedule (Admin only)
router.put('/:id', authorize('ADMIN'), scheduleController.updateSchedule);

router.get('/:userId', authorize('ADMIN', 'EMPLOYEE'), scheduleController.getUserSchedule);

// Get all schedules (for calendar) - must be before userId if path was ambiguous, but here it's fine if separate
router.get('/', authorize('ADMIN', 'EMPLOYEE'), scheduleController.getAllSchedules);

module.exports = router;
