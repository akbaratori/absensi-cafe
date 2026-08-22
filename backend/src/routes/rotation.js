const express = require('express');
const router = express.Router();
const rotationController = require('../controllers/rotationController');
const backupController = require('../controllers/backupController');
const { authenticate, authorize } = require('../middleware/auth');

// All rotation routes require authentication
router.use(authenticate);

// Employee's own schedule (new rotation scheme)
router.get('/my-schedule', authorize('ADMIN', 'EMPLOYEE'), rotationController.getMySchedule);

// Backward-compatible alias: legacy frontend calls /rotation/positions
router.get('/positions', authorize('ADMIN'), rotationController.listPositions);

// All positions schedule for a given week
router.get('/all-schedules', authorize('ADMIN'), rotationController.getAllSchedules);

// Manual Off-days
router.get('/manual-off-days', rotationController.getManualOffDays);
router.post('/manual-off-days', rotationController.saveManualOffDays);

// Backup assignments
router.get('/backups', authorize('ADMIN'), backupController.listBackups.bind(backupController));
router.get('/backup-candidates', authorize('ADMIN'), backupController.getBackupCandidates.bind(backupController));
router.post('/backups', authorize('ADMIN'), backupController.createBackup.bind(backupController));
router.delete('/backups/:id', authorize('ADMIN'), backupController.deleteBackup.bind(backupController));

// Position management (ADMIN only)
router.get('/', authorize('ADMIN'), rotationController.listPositions);
router.post('/', authorize('ADMIN'), rotationController.createPosition);
router.get('/:id', authorize('ADMIN'), rotationController.getPosition);
router.put('/:id', authorize('ADMIN'), rotationController.updatePosition);
router.delete('/:id', authorize('ADMIN'), rotationController.deletePosition);

// Roster management (ADMIN only)
router.post('/:id/roster', authorize('ADMIN'), rotationController.setRoster);
router.post('/:id/roster/insert', authorize('ADMIN'), rotationController.insertRosterMember);
router.post('/:id/roster/remove', authorize('ADMIN'), rotationController.removeRosterMember);

// Schedule generation & viewing (ADMIN + EMPLOYEE can view)
router.post('/:id/generate-week', authorize('ADMIN'), rotationController.generateWeek);
router.post('/:id/generate-month', authorize('ADMIN'), rotationController.generateMonth);
router.get('/:id/schedule', authorize('ADMIN', 'EMPLOYEE'), rotationController.getSchedule);
router.get('/:id/schedules', authorize('ADMIN', 'EMPLOYEE'), rotationController.listSchedules);

module.exports = router;