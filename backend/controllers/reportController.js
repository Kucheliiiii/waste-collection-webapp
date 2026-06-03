const pool = require('../db');

async function pickupsPerZone(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT z.zone_name,
              COUNT(pr.id) AS total_requests,
              SUM(pr.request_status = 'completed') AS completed_requests,
              SUM(pr.request_status = 'assigned') AS assigned_requests,
              SUM(pr.request_status = 'pending') AS pending_requests,
              SUM(pr.request_status = 'in_progress') AS in_progress_requests,
              SUM(pr.request_status = 'cancelled') AS cancelled_requests
       FROM zones z
       LEFT JOIN pickup_requests pr ON pr.zone_id = z.id
       GROUP BY z.id, z.zone_name
       ORDER BY total_requests DESC, z.zone_name ASC`
    );

    await pool.execute(
      `INSERT INTO activity_logs (activity_type, details)
       VALUES ('report_view', 'Viewed pickups per zone report.')`
    );

    res.json(rows);
  } catch (error) {
    next(error);
  }
}

async function completionRates(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT
        COUNT(*) AS total_requests,
        SUM(request_status = 'completed') AS completed_requests,
        SUM(request_status = 'cancelled') AS cancelled_requests,
        ROUND((SUM(request_status = 'completed') / NULLIF(COUNT(*), 0)) * 100, 2) AS completion_rate_percent
       FROM pickup_requests`
    );

    await pool.execute(
      `INSERT INTO activity_logs (activity_type, details)
       VALUES ('report_view', 'Viewed completion rate report.')`
    );

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
}

async function collectorPerformance(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT u.id AS collector_user_id,
              u.full_name,
              z.zone_name AS current_zone,
              cp.total_assigned,
              cp.total_completed,
              ROUND((cp.total_completed / NULLIF(cp.total_assigned, 0)) * 100, 2) AS completion_percent,
              cp.average_rating,
              cp.availability_status
       FROM collector_profiles cp
       JOIN users u ON u.id = cp.user_id
       JOIN zones z ON z.id = cp.current_zone_id
       ORDER BY cp.total_completed DESC, cp.average_rating DESC`
    );

    await pool.execute(
      `INSERT INTO activity_logs (activity_type, details)
       VALUES ('report_view', 'Viewed collector performance report.')`
    );

    res.json(rows);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  pickupsPerZone,
  completionRates,
  collectorPerformance,
};
