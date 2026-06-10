const express = require('express');
const router = express.Router();
const scheduleController = require('../controllers/scheduleController');
const { authenticate, authorize } = require('../middleware/auth');
const prisma = require('../utils/database');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../utils/response');

// All routes require authentication
router.use(authenticate);

// Generate schedule (Admin only)
router.post('/generate', authorize('ADMIN'), scheduleController.generateSchedule);

// Bulk generate schedule - all staff same shift (Admin only)
router.post('/bulk-generate', authorize('ADMIN'), scheduleController.bulkGenerateSchedule);

// Check conflicts (Admin only)
router.post('/check-conflicts', authorize('ADMIN'), scheduleController.checkConflicts);

// Distribute Kitchen Shifts (Admin only)
router.post('/distribute-kitchen', authorize('ADMIN'), scheduleController.distributeKitchenShifts);

// Redistribute Stations (Admin only) - Single Day
router.post('/redistribute-stations', authorize('ADMIN'), scheduleController.redistributeStations);

// Assign Station Rotation (Admin only) - Monthly Loop
router.post('/assign-stations', authorize('ADMIN'), scheduleController.assignStationsRotation);

// Add single schedule (Admin only)
router.post('/single', authorize('ADMIN'), scheduleController.upsertSingleSchedule);

// POST closing-config (Admin only) — must be before /:id
router.post('/closing-config', authorize('ADMIN'), asyncHandler(async (req, res) => {
    const value = JSON.stringify(req.body);
    await prisma.systemConfig.upsert({
        where: { key: 'closing_jobdesk_config' },
        update: { value, description: 'Konfigurasi Jobdesk Closing Ramadhan' },
        create: { key: 'closing_jobdesk_config', value, description: 'Konfigurasi Jobdesk Closing Ramadhan' },
    });
    return successResponse(res, 200, { config: req.body }, 'Konfigurasi closing berhasil disimpan');
}));

// Manual update schedule (Admin only)
router.put('/:id', authorize('ADMIN'), scheduleController.updateSchedule);

// Delete single schedule (Admin only)
router.delete('/:id', authorize('ADMIN'), scheduleController.deleteSchedule);

// ─── Static GET routes MUST be before /:userId ────────────────────────────

// Get station summary for a month (Admin only) - MUST be before /:userId
router.get('/station-summary', authorize('ADMIN'), scheduleController.getStationSummary);

// GET closing-config — must be before /:userId
router.get('/closing-config', asyncHandler(async (req, res) => {
    const cfg = await prisma.systemConfig.findUnique({ where: { key: 'closing_jobdesk_config' } });
    const data = cfg ? JSON.parse(cfg.value) : null;
    return successResponse(res, 200, { config: data });
}));

// Get all schedules (for calendar) - MUST be before /:userId
router.get('/', authorize('ADMIN', 'EMPLOYEE'), scheduleController.getAllSchedules);

// Get schedule by userId - dynamic param LAST
router.get('/:userId', authorize('ADMIN', 'EMPLOYEE'), scheduleController.getUserSchedule);

module.exports = router;

