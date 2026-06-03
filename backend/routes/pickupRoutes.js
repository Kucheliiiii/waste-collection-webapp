const express = require('express');
const {
  createPickupRequest,
  assignNearestCollectorAndTruck,
  assignDirectTruckAndCollector,
  getNearbyAvailableTrucks,
  markCollectorArrived,
  confirmPickup,
  cancelPickupRequest,
  getPickupRequests,
  getPickupRequestById,
} = require('../controllers/pickupController');

const router = express.Router();

router.get('/', getPickupRequests);
router.get('/nearby-trucks', getNearbyAvailableTrucks);
router.get('/:id', getPickupRequestById);
router.post('/', createPickupRequest);
router.post('/:id/assign-nearest', assignNearestCollectorAndTruck);
router.post('/:id/assign-direct', assignDirectTruckAndCollector);
router.patch('/:id/arrived', markCollectorArrived);
router.patch('/:id/confirm', confirmPickup);
router.patch('/:id/cancel', cancelPickupRequest);

module.exports = router;
