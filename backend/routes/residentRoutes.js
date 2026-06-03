const express = require('express');
const {
  getDashboardSummary,
  getRecentActivities,
  getMonthlyStats,
} = require('../controllers/residentController');

const router = express.Router();

router.get('/dashboard-summary', getDashboardSummary);
router.get('/recent-activities', getRecentActivities);
router.get('/monthly-stats', getMonthlyStats);

module.exports = router;
