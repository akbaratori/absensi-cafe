const express = require('express');
const router = express.Router();
const scheduleController = require('../controllers/scheduleController');

// Public Schedule Endpoint (No Authentication Required)
router.get('/schedule', scheduleController.getPublicSchedule);

module.exports = router;
