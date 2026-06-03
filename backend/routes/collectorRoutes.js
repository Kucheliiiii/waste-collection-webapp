const express = require('express');
const {
  getCollectors,
  createCollector,
  updateCollector,
  deleteCollector,
  updateCollectorAvailability,
} = require('../controllers/collectorController');

const router = express.Router();

router.get('/', getCollectors);
router.post('/', createCollector);
router.patch('/:collectorUserId', updateCollector);
router.patch('/:collectorUserId/availability', updateCollectorAvailability);
router.delete('/:collectorUserId', deleteCollector);

module.exports = router;
