const express = require('express');
const router = express.Router();
const shiftController = require('../controllers/shiftController');
const { authenticate, authorize } = require('../middleware/auth');

// All routes require Admin access
router.use(authenticate, authorize('ADMIN'));

router.get('/', shiftController.getAll);
router.post('/', shiftController.create);
router.put('/:id', shiftController.update);
router.delete('/:id', shiftController.delete);

module.exports = router;
