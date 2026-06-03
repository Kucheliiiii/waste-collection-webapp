const pool = require('../db');

async function getActivities(req, res, next) {
  const limit = Math.min(Number(req.query.limit || 100), 500);

  try {
    const [rows] = await pool.execute(
      `SELECT al.id,
              al.activity_type,
              al.details,
              al.created_at,
              al.ip_address,
              au.full_name AS actor_name,
              pr.request_code,
              pa.id AS assignment_id
       FROM activity_logs al
       LEFT JOIN users au ON au.id = al.actor_user_id
       LEFT JOIN pickup_requests pr ON pr.id = al.request_id
       LEFT JOIN pickup_assignments pa ON pa.id = al.assignment_id
       ORDER BY al.id DESC
       LIMIT ?`,
      [limit]
    );

    res.json(rows);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getActivities,
};
