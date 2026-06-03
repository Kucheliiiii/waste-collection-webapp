const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { getTrucks, createTruck, updateTruck, updateTruckStatus, deleteTruck } = require('../controllers/truckController');

const router = express.Router();

router.get('/', getTrucks);
router.post('/', authenticate, requireRole('admin', 'super_admin'), createTruck);
router.patch('/:truckId', authenticate, requireRole('admin', 'super_admin'), updateTruck);
router.patch('/:truckId/status', authenticate, requireRole('admin', 'super_admin'), updateTruckStatus);
router.delete('/:truckId', authenticate, requireRole('admin', 'super_admin'), deleteTruck);

module.exports = router;
