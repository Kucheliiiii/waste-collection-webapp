const express = require('express');
const {
  pickupsPerZone,
  completionRates,
  collectorPerformance,
} = require('../controllers/reportController');

const router = express.Router();

router.get('/pickups-per-zone', pickupsPerZone);
router.get('/completion-rates', completionRates);
router.get('/collector-performance', collectorPerformance);

module.exports = router;
