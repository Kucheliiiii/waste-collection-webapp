const pool = require('../db');

const DEFAULT_REWARD_GOAL = Number(process.env.RESIDENT_REWARD_GOAL || 1000);

function getPointsForWasteType(wasteType) {
  switch (String(wasteType || '').toLowerCase()) {
    case 'organic':
      return 15;
    case 'recyclable':
      return 70;
    case 'e_waste':
      return 35;
    case 'bulk':
      return 25;
    case 'household':
    default:
      return 20;
  }
}

function resolveActivityStatus(row) {
  const rawStatus = String(row.request_status || '').toLowerCase();
  if (rawStatus === 'completed' || rawStatus === 'cancelled') {
    return rawStatus;
  }

  if (row.preferred_pickup_date) {
    const preferred = new Date(row.preferred_pickup_date);
    const now = new Date();
    if (!Number.isNaN(preferred.getTime()) && preferred >= new Date(now.toDateString())) {
      return 'scheduled';
    }
  }

  return 'pending';
}

function rewardBadgeForPoints(points) {
  if (points >= 70) return 'Recycling Bonus';
  if (points >= 35) return 'Eco Champion';
  if (points >= 20) return 'Green Starter';
  return null;
}

async function getDashboardSummary(req, res, next) {
  const residentUserId = Number(req.query.resident_user_id);

  if (!residentUserId) {
    return res.status(400).json({ message: 'resident_user_id query parameter is required.' });
  }

  try {
    const [summaryRows] = await pool.execute(
      `SELECT
          SUM(CASE WHEN pr.request_status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
          SUM(CASE
                WHEN pr.request_status NOT IN ('completed', 'cancelled')
                  AND pr.preferred_pickup_date IS NOT NULL
                  AND pr.preferred_pickup_date >= CURDATE()
                THEN 1 ELSE 0 END) AS scheduled_count,
          SUM(CASE
                WHEN pr.request_status NOT IN ('completed', 'cancelled')
                  AND (pr.preferred_pickup_date IS NULL OR pr.preferred_pickup_date < CURDATE())
                THEN 1 ELSE 0 END) AS pending_count,
          SUM(CASE
                WHEN pr.request_status = 'completed' THEN
                  CASE pr.waste_type
                    WHEN 'organic' THEN 15
                    WHEN 'recyclable' THEN 70
                    WHEN 'e_waste' THEN 35
                    WHEN 'bulk' THEN 25
                    ELSE 20
                  END
                ELSE 0
              END) AS eco_points
       FROM pickup_requests pr
       WHERE pr.resident_user_id = ?`,
      [residentUserId]
    );

    const [currentWindowRows] = await pool.execute(
      `SELECT
          COUNT(*) AS pickup_count,
          SUM(CASE
                WHEN pr.request_status = 'completed' THEN
                  CASE pr.waste_type
                    WHEN 'organic' THEN 15
                    WHEN 'recyclable' THEN 70
                    WHEN 'e_waste' THEN 35
                    WHEN 'bulk' THEN 25
                    ELSE 20
                  END
                ELSE 0
              END) AS eco_points
       FROM pickup_requests pr
       WHERE pr.resident_user_id = ?
         AND pr.requested_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [residentUserId]
    );

    const [previousWindowRows] = await pool.execute(
      `SELECT
          COUNT(*) AS pickup_count,
          SUM(CASE
                WHEN pr.request_status = 'completed' THEN
                  CASE pr.waste_type
                    WHEN 'organic' THEN 15
                    WHEN 'recyclable' THEN 70
                    WHEN 'e_waste' THEN 35
                    WHEN 'bulk' THEN 25
                    ELSE 20
                  END
                ELSE 0
              END) AS eco_points
       FROM pickup_requests pr
       WHERE pr.resident_user_id = ?
         AND pr.requested_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
         AND pr.requested_at < DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [residentUserId]
    );

    const summary = summaryRows[0] || {};
    const completed = Number(summary.completed_count || 0);
    const scheduled = Number(summary.scheduled_count || 0);
    const pending = Number(summary.pending_count || 0);
    const ecoPoints = Number(summary.eco_points || 0);

    const totalPickups = completed + scheduled + pending;

    const currentWindow = currentWindowRows[0] || {};
    const previousWindow = previousWindowRows[0] || {};
    const pickupDelta = Number(currentWindow.pickup_count || 0) - Number(previousWindow.pickup_count || 0);
    const pointDelta = Number(currentWindow.eco_points || 0) - Number(previousWindow.eco_points || 0);

    res.json({
      totalPickups,
      completed,
      scheduled,
      pending,
      ecoPoints,
      rewardGoal: DEFAULT_REWARD_GOAL,
      trends: {
        pickupsDelta: pickupDelta,
        ecoPointsDelta: pointDelta,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getRecentActivities(req, res, next) {
  const residentUserId = Number(req.query.resident_user_id);
  const limit = Math.min(20, Math.max(1, Number(req.query.limit || 6)));

  if (!residentUserId) {
    return res.status(400).json({ message: 'resident_user_id query parameter is required.' });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT pr.id,
              pr.request_code,
              pr.waste_type,
              pr.request_status,
              pr.preferred_pickup_date,
              pr.requested_at,
              pr.completed_at
       FROM pickup_requests pr
       WHERE pr.resident_user_id = ?
       ORDER BY COALESCE(pr.completed_at, pr.requested_at) DESC
       LIMIT ?`,
      [residentUserId, limit]
    );

    const data = rows.map((row) => {
      const status = resolveActivityStatus(row);
      const earnedPoints = status === 'completed' ? getPointsForWasteType(row.waste_type) : 0;
      return {
        requestId: row.id,
        requestCode: row.request_code,
        wasteType: row.waste_type,
        status,
        pickupDate: row.completed_at || row.preferred_pickup_date || row.requested_at,
        earnedPoints,
        rewardBadge: earnedPoints > 0 ? rewardBadgeForPoints(earnedPoints) : null,
      };
    });

    res.json(data);
  } catch (error) {
    next(error);
  }
}

async function getMonthlyStats(req, res, next) {
  const residentUserId = Number(req.query.resident_user_id);
  const months = Math.min(12, Math.max(3, Number(req.query.months || 6)));

  if (!residentUserId) {
    return res.status(400).json({ message: 'resident_user_id query parameter is required.' });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT DATE_FORMAT(pr.requested_at, '%Y-%m') AS month_key,
              COUNT(*) AS pickup_count,
              SUM(CASE
                    WHEN pr.request_status = 'completed' THEN
                      CASE pr.waste_type
                        WHEN 'organic' THEN 15
                        WHEN 'recyclable' THEN 70
                        WHEN 'e_waste' THEN 35
                        WHEN 'bulk' THEN 25
                        ELSE 20
                      END
                    ELSE 0
                  END) AS eco_points
       FROM pickup_requests pr
       WHERE pr.resident_user_id = ?
         AND pr.requested_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL ? MONTH)
       GROUP BY month_key
       ORDER BY month_key ASC`,
      [residentUserId, months - 1]
    );

    const rowsByMonth = new Map(rows.map((row) => [row.month_key, row]));
    const now = new Date();
    const data = [];

    for (let offset = months - 1; offset >= 0; offset -= 1) {
      const bucketDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const year = bucketDate.getFullYear();
      const month = `${bucketDate.getMonth() + 1}`.padStart(2, '0');
      const key = `${year}-${month}`;
      const found = rowsByMonth.get(key);

      data.push({
        month: bucketDate.toLocaleString('en-US', { month: 'short' }),
        monthKey: key,
        pickups: Number(found?.pickup_count || 0),
        ecoPoints: Number(found?.eco_points || 0),
      });
    }

    res.json(data);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDashboardSummary,
  getRecentActivities,
  getMonthlyStats,
};
