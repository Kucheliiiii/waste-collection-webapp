const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { getZones, createZone, updateZone, toggleZoneStatus, deleteZone } = require('../controllers/zoneController');

const router = express.Router();

// Public read — any logged-in user (or even unauthenticated calls for dropdown data)
router.get('/', getZones);

// Write operations require admin or super_admin
router.post('/', authenticate, requireRole('admin', 'super_admin'), createZone);
router.patch('/:zoneId', authenticate, requireRole('admin', 'super_admin'), updateZone);
router.patch('/:zoneId/status', authenticate, requireRole('admin', 'super_admin'), toggleZoneStatus);
router.delete('/:zoneId', authenticate, requireRole('admin', 'super_admin'), deleteZone);

module.exports = router;
