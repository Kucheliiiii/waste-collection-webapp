const pool = require('../db');

function requestCode() {
  const now = new Date();
  const year = now.getFullYear();
  const random = Math.floor(1000 + Math.random() * 9000);
  return `REQ-${year}-${random}`;
}

async function createPickupRequest(req, res, next) {
  const {
    resident_user_id,
    zone_id,
    pickup_address,
    pickup_latitude,
    pickup_longitude,
    waste_type,
    estimated_weight_kg,
    preferred_pickup_date,
    notes,
  } = req.body;

  if (!resident_user_id || !zone_id || !pickup_address || !waste_type) {
    return res.status(400).json({
      message: 'resident_user_id, zone_id, pickup_address, and waste_type are required.',
    });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [userRows] = await conn.execute(
      `SELECT id FROM users WHERE id = ? AND role = 'resident' AND account_status = 'active'`,
      [resident_user_id]
    );
    if (userRows.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'Invalid resident_user_id.' });
    }

    const [zoneRows] = await conn.execute('SELECT id FROM zones WHERE id = ? AND is_active = 1', [zone_id]);
    if (zoneRows.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'Invalid zone_id.' });
    }

    const code = requestCode();
    const [result] = await conn.execute(
      `INSERT INTO pickup_requests
      (request_code, resident_user_id, zone_id, pickup_address, pickup_latitude, pickup_longitude, waste_type, estimated_weight_kg, preferred_pickup_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        resident_user_id,
        zone_id,
        pickup_address,
        pickup_latitude !== undefined && pickup_latitude !== null ? Number(pickup_latitude) : null,
        pickup_longitude !== undefined && pickup_longitude !== null ? Number(pickup_longitude) : null,
        waste_type,
        estimated_weight_kg || null,
        preferred_pickup_date || null,
        notes || null,
      ]
    );

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, request_id, activity_type, details, ip_address)
       VALUES (?, ?, 'request_created', ?, ?)`,
      [resident_user_id, result.insertId, `Pickup request created: ${code}`, req.ip || null]
    );

    await conn.commit();
    res.status(201).json({ message: 'Pickup request created.', request_id: result.insertId, request_code: code });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
}

async function assignNearestCollectorAndTruck(req, res, next) {
  const requestId = Number(req.params.id);
  const { assigned_by_user_id, note } = req.body;

  if (!requestId) {
    return res.status(400).json({ message: 'Valid request id is required.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [requestRows] = await conn.execute(
      `SELECT id, request_code, zone_id, request_status
       FROM pickup_requests
       WHERE id = ? FOR UPDATE`,
      [requestId]
    );

    if (requestRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Pickup request not found.' });
    }

    const request = requestRows[0];
    if (request.request_status === 'completed' || request.request_status === 'cancelled') {
      await conn.rollback();
      return res.status(409).json({ message: `Cannot assign a ${request.request_status} request.` });
    }

    const [collectorRows] = await conn.execute(
      `SELECT u.id AS collector_user_id, cp.id AS profile_id, cp.total_assigned
       FROM collector_profiles cp
       JOIN users u ON u.id = cp.user_id
       JOIN zones cz ON cz.id = cp.current_zone_id
       JOIN zones rz ON rz.id = ?
       WHERE cp.availability_status = 'available'
         AND u.role = 'collector'
         AND u.account_status = 'active'
       ORDER BY
         (POW(cz.latitude - rz.latitude, 2) + POW(cz.longitude - rz.longitude, 2)) ASC,
         cp.total_assigned ASC
       LIMIT 1`,
      [request.zone_id]
    );

    if (collectorRows.length === 0) {
      await conn.rollback();
      return res.status(409).json({ message: 'No available collector found for assignment.' });
    }

    const collector = collectorRows[0];

    const [truckRows] = await conn.execute(
      `SELECT t.id, t.truck_code
       FROM trucks t
       JOIN zones tz ON tz.id = t.current_zone_id
       JOIN zones rz ON rz.id = ?
       WHERE t.truck_status = 'available'
       ORDER BY
         (POW(tz.latitude - rz.latitude, 2) + POW(tz.longitude - rz.longitude, 2)) ASC,
         t.capacity_kg DESC
       LIMIT 1`,
      [request.zone_id]
    );

    if (truckRows.length === 0) {
      await conn.rollback();
      return res.status(409).json({ message: 'No available truck found for assignment.' });
    }

    const truck = truckRows[0];

    const [assignmentResult] = await conn.execute(
      `INSERT INTO pickup_assignments
      (request_id, collector_user_id, truck_id, assigned_by_user_id, assignment_status, notes)
      VALUES (?, ?, ?, ?, 'assigned', ?)`,
      [request.id, collector.collector_user_id, truck.id, assigned_by_user_id || null, note || 'Auto-assigned by nearest zone logic.']
    );

    await conn.execute(
      `UPDATE pickup_requests
       SET request_status = 'assigned'
       WHERE id = ?`,
      [request.id]
    );

    await conn.execute(
      `UPDATE collector_profiles
       SET availability_status = 'busy',
           total_assigned = total_assigned + 1,
           current_zone_id = ?
       WHERE user_id = ?`,
      [request.zone_id, collector.collector_user_id]
    );

    await conn.execute(
      `UPDATE trucks
       SET truck_status = 'assigned',
           current_zone_id = ?
       WHERE id = ?`,
      [request.zone_id, truck.id]
    );

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, request_id, assignment_id, activity_type, details, ip_address)
       VALUES (?, ?, ?, 'request_assigned', ?, ?)`,
      [
        assigned_by_user_id || null,
        request.id,
        assignmentResult.insertId,
        `Assigned collector ${collector.collector_user_id} and truck ${truck.truck_code} to ${request.request_code}.`,
        req.ip || null,
      ]
    );

    await conn.commit();
    res.json({
      message: 'Nearest collector and truck assigned successfully.',
      assignment_id: assignmentResult.insertId,
      collector_user_id: collector.collector_user_id,
      truck_id: truck.id,
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
}

async function getNearbyAvailableTrucks(req, res, next) {
  const zoneId = Number(req.query.zone_id);
  const destinationLat = Number(req.query.lat);
  const destinationLng = Number(req.query.lng);
  const limit = Math.min(20, Math.max(1, Number(req.query.limit || 6)));

  if (!zoneId || Number.isNaN(destinationLat) || Number.isNaN(destinationLng)) {
    return res.status(400).json({ message: 'zone_id, lat, and lng query parameters are required.' });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT t.id AS truck_id,
              t.truck_code,
              t.plate_number,
              t.model_name,
              t.capacity_kg,
              t.truck_status,
              t.average_speed_kmh,
              z.zone_name AS current_zone,
              z.latitude AS lat,
              z.longitude AS lng,
              ROUND(
                6371 * 2 * ASIN(
                  SQRT(
                    POW(SIN(RADIANS((? - z.latitude) / 2)), 2)
                    + COS(RADIANS(z.latitude)) * COS(RADIANS(?))
                    * POW(SIN(RADIANS((? - z.longitude) / 2)), 2)
                  )
                ),
                2
              ) AS distance_km,
              GREATEST(
                4,
                ROUND(
                  (
                    (
                      6371 * 2 * ASIN(
                        SQRT(
                          POW(SIN(RADIANS((? - z.latitude) / 2)), 2)
                          + COS(RADIANS(z.latitude)) * COS(RADIANS(?))
                          * POW(SIN(RADIANS((? - z.longitude) / 2)), 2)
                        )
                      )
                    ) / GREATEST(t.average_speed_kmh, 1)
                  ) * 60
                )
              ) AS eta_minutes,
              u.full_name AS collector_name,
              u.phone AS collector_phone,
              cp.employee_code,
              cp.total_completed,
              cp.average_rating
       FROM trucks t
       JOIN zones z ON z.id = t.current_zone_id
       LEFT JOIN collector_profiles cp ON cp.current_zone_id = t.current_zone_id
         AND cp.availability_status = 'available'
       LEFT JOIN users u ON u.id = cp.user_id
         AND u.role = 'collector'
         AND u.account_status = 'active'
       WHERE t.truck_status = 'available'
       ORDER BY
         CASE WHEN t.current_zone_id = ? THEN 0 ELSE 1 END ASC,
         distance_km ASC,
         t.capacity_kg DESC
       LIMIT ?`,
      [
        destinationLat,
        destinationLat,
        destinationLng,
        destinationLat,
        destinationLat,
        destinationLng,
        zoneId,
        limit,
      ]
    );

    const uniqueRows = [];
    const seenTruckIds = new Set();
    rows.forEach((row) => {
      if (seenTruckIds.has(row.truck_id)) return;
      seenTruckIds.add(row.truck_id);
      uniqueRows.push(row);
    });

    res.json(uniqueRows);
  } catch (error) {
    next(error);
  }
}

async function confirmPickup(req, res, next) {
  const requestId = Number(req.params.id);
  const {
    collector_user_id,
    completion_note,
    actual_weight_kg,
    charged_amount,
    charge_currency,
  } = req.body;

  if (!requestId || !collector_user_id) {
    return res.status(400).json({ message: 'request id and collector_user_id are required.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [assignmentRows] = await conn.execute(
      `SELECT id, request_id, collector_user_id, truck_id, assignment_status
       FROM pickup_assignments
       WHERE request_id = ?
       ORDER BY id DESC
       LIMIT 1 FOR UPDATE`,
      [requestId]
    );

    if (assignmentRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'No assignment exists for this request.' });
    }

    const assignment = assignmentRows[0];
    if (Number(assignment.collector_user_id) !== Number(collector_user_id)) {
      await conn.rollback();
      return res.status(403).json({ message: 'Collector is not assigned to this request.' });
    }

    await conn.execute(
      `UPDATE pickup_assignments
       SET assignment_status = 'completed',
           completed_at = NOW(),
           notes = COALESCE(?, notes)
       WHERE id = ?`,
      [completion_note || null, assignment.id]
    );

    await conn.execute(
      `UPDATE pickup_requests
       SET request_status = 'completed',
           completed_at = NOW(),
           actual_weight_kg = COALESCE(?, actual_weight_kg),
           charged_amount = COALESCE(?, charged_amount),
           charge_currency = COALESCE(?, charge_currency)
       WHERE id = ?`,
      [
        actual_weight_kg !== undefined && actual_weight_kg !== null ? Number(actual_weight_kg) : null,
        charged_amount !== undefined && charged_amount !== null ? Number(charged_amount) : null,
        charge_currency ? String(charge_currency).toUpperCase() : null,
        requestId,
      ]
    );

    await conn.execute(
      `UPDATE collector_profiles
       SET availability_status = 'available',
           total_completed = total_completed + 1
       WHERE user_id = ?`,
      [collector_user_id]
    );

    await conn.execute(
      `UPDATE trucks
       SET truck_status = 'available'
       WHERE id = ?`,
      [assignment.truck_id]
    );

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, request_id, assignment_id, activity_type, details, ip_address)
       VALUES (?, ?, ?, 'pickup_confirmed', ?, ?)`,
      [collector_user_id, requestId, assignment.id, `Pickup completed for request id ${requestId}.`, req.ip || null]
    );

    await conn.commit();
    res.json({ message: 'Pickup confirmed successfully.' });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
}

async function markCollectorArrived(req, res, next) {
  const requestId = Number(req.params.id);
  const { collector_user_id, arrival_note } = req.body;

  if (!requestId || !collector_user_id) {
    return res.status(400).json({ message: 'request id and collector_user_id are required.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [assignmentRows] = await conn.execute(
      `SELECT id, request_id, collector_user_id, assignment_status
       FROM pickup_assignments
       WHERE request_id = ?
       ORDER BY id DESC
       LIMIT 1 FOR UPDATE`,
      [requestId]
    );

    if (assignmentRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'No assignment exists for this request.' });
    }

    const assignment = assignmentRows[0];
    if (Number(assignment.collector_user_id) !== Number(collector_user_id)) {
      await conn.rollback();
      return res.status(403).json({ message: 'Collector is not assigned to this request.' });
    }

    if (assignment.assignment_status === 'completed') {
      await conn.rollback();
      return res.status(409).json({ message: 'Cannot mark arrival for a completed assignment.' });
    }

    await conn.execute(
      `UPDATE pickup_assignments
       SET assignment_status = 'in_progress',
           started_at = COALESCE(started_at, NOW()),
           notes = COALESCE(?, notes)
       WHERE id = ?`,
      [arrival_note || null, assignment.id]
    );

    await conn.execute(
      `UPDATE pickup_requests
       SET request_status = 'in_progress'
       WHERE id = ?`,
      [requestId]
    );

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, request_id, assignment_id, activity_type, details, ip_address)
       VALUES (?, ?, ?, 'pickup_started', ?, ?)`,
      [collector_user_id, requestId, assignment.id, `Collector arrived for request id ${requestId}.`, req.ip || null]
    );

    await conn.commit();
    res.json({ message: 'Arrival status updated successfully.' });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
}

async function getPickupRequests(_req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT pr.id, pr.request_code, pr.request_status, pr.waste_type, pr.pickup_address,
              pr.pickup_latitude, pr.pickup_longitude,
              pr.estimated_weight_kg, pr.actual_weight_kg, pr.charged_amount, pr.charge_currency,
              pr.preferred_pickup_date, pr.requested_at, pr.completed_at,
              u.full_name AS resident_name, z.zone_name,
              pa.id AS latest_assignment_id,
              pa.assignment_status AS latest_assignment_status,
              pa.collector_user_id AS assigned_collector_user_id,
              t.id AS assigned_truck_id,
              t.truck_code AS assigned_truck_code,
              t.average_speed_kmh AS assigned_truck_speed_kmh,
              tz.latitude AS assigned_truck_latitude,
              tz.longitude AS assigned_truck_longitude
       FROM pickup_requests pr
       JOIN users u ON u.id = pr.resident_user_id
       JOIN zones z ON z.id = pr.zone_id
       LEFT JOIN (
         SELECT pa1.*
         FROM pickup_assignments pa1
         JOIN (
           SELECT request_id, MAX(id) AS latest_id
           FROM pickup_assignments
           GROUP BY request_id
         ) latest ON latest.latest_id = pa1.id
       ) pa ON pa.request_id = pr.id
       LEFT JOIN trucks t ON t.id = pa.truck_id
       LEFT JOIN zones tz ON tz.id = t.current_zone_id
       ORDER BY pr.id DESC`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
}

async function getPickupRequestById(req, res, next) {
  const requestId = Number(req.params.id);
  try {
    const [rows] = await pool.execute(
      `SELECT pr.*, u.full_name AS resident_name, z.zone_name,
              pa.id AS latest_assignment_id,
              pa.assignment_status AS latest_assignment_status,
              pa.collector_user_id AS assigned_collector_user_id,
              t.id AS assigned_truck_id,
              t.truck_code AS assigned_truck_code,
              t.average_speed_kmh AS assigned_truck_speed_kmh,
              tz.latitude AS assigned_truck_latitude,
              tz.longitude AS assigned_truck_longitude
       FROM pickup_requests pr
       JOIN users u ON u.id = pr.resident_user_id
       JOIN zones z ON z.id = pr.zone_id
       LEFT JOIN (
         SELECT pa1.*
         FROM pickup_assignments pa1
         JOIN (
           SELECT request_id, MAX(id) AS latest_id
           FROM pickup_assignments
           GROUP BY request_id
         ) latest ON latest.latest_id = pa1.id
       ) pa ON pa.request_id = pr.id
       LEFT JOIN trucks t ON t.id = pa.truck_id
       LEFT JOIN zones tz ON tz.id = t.current_zone_id
       WHERE pr.id = ?`,
      [requestId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Pickup request not found.' });
    }

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /pickups/:id/assign-direct
 * Assigns a specific truck (by truck_id) and its linked collector, falling back
 * to any available collector/truck in the zone if the preferred ones are busy.
 * Body: { truck_id, collector_user_id, assigned_by_user_id, note }
 */
async function assignDirectTruckAndCollector(req, res, next) {
  const requestId = Number(req.params.id);
  const {
    truck_id: preferredTruckId,
    collector_user_id: preferredCollectorId,
    assigned_by_user_id,
    note,
  } = req.body;

  if (!requestId) {
    return res.status(400).json({ message: 'Valid request id is required.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [requestRows] = await conn.execute(
      `SELECT id, request_code, zone_id, request_status FROM pickup_requests WHERE id = ? FOR UPDATE`,
      [requestId]
    );

    if (requestRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Pickup request not found.' });
    }

    const request = requestRows[0];
    if (request.request_status === 'completed' || request.request_status === 'cancelled') {
      await conn.rollback();
      return res.status(409).json({ message: `Cannot assign a ${request.request_status} request.` });
    }

    // ── Resolve truck ──────────────────────────────────────────────────────────
    let truck = null;

    // 1. Try the preferred (resident-selected) truck if it is a real DB id
    if (preferredTruckId && !String(preferredTruckId).startsWith('SIM-') && !String(preferredTruckId).startsWith('COL-')) {
      const [rows] = await conn.execute(
        `SELECT id, truck_code, truck_status FROM trucks WHERE id = ? LIMIT 1`,
        [Number(preferredTruckId)]
      );
      if (rows.length > 0) truck = rows[0];
    }

    // 2. Any available truck in the request zone
    if (!truck) {
      const [rows] = await conn.execute(
        `SELECT t.id, t.truck_code, t.truck_status
         FROM trucks t
         JOIN zones tz ON tz.id = t.current_zone_id
         JOIN zones rz ON rz.id = ?
         WHERE t.truck_status = 'available'
         ORDER BY (POW(tz.latitude - rz.latitude,2) + POW(tz.longitude - rz.longitude,2)) ASC, t.capacity_kg DESC
         LIMIT 1`,
        [request.zone_id]
      );
      if (rows.length > 0) truck = rows[0];
    }

    // 3. Any truck in any status except inactive/maintenance (last resort)
    if (!truck) {
      const [rows] = await conn.execute(
        `SELECT id, truck_code, truck_status FROM trucks
         WHERE truck_status NOT IN ('inactive','maintenance')
         ORDER BY id ASC LIMIT 1`
      );
      if (rows.length > 0) truck = rows[0];
    }

    if (!truck) {
      await conn.rollback();
      return res.status(409).json({ message: 'No truck is currently available for assignment.' });
    }

    // ── Resolve collector ──────────────────────────────────────────────────────
    let collector = null;

    // 1. Try the preferred collector from the selected truck (real DB id)
    if (preferredCollectorId && !String(preferredCollectorId).startsWith('SIM-')) {
      const [rows] = await conn.execute(
        `SELECT u.id AS collector_user_id, cp.id AS profile_id, cp.total_assigned
         FROM collector_profiles cp
         JOIN users u ON u.id = cp.user_id
         WHERE cp.user_id = ? AND u.role = 'collector' AND u.account_status = 'active'
         LIMIT 1`,
        [Number(preferredCollectorId)]
      );
      if (rows.length > 0) collector = rows[0];
    }

    // 2. Any available collector closest to the zone
    if (!collector) {
      const [rows] = await conn.execute(
        `SELECT u.id AS collector_user_id, cp.id AS profile_id, cp.total_assigned
         FROM collector_profiles cp
         JOIN users u ON u.id = cp.user_id
         JOIN zones cz ON cz.id = cp.current_zone_id
         JOIN zones rz ON rz.id = ?
         WHERE cp.availability_status = 'available'
           AND u.role = 'collector'
           AND u.account_status = 'active'
         ORDER BY (POW(cz.latitude - rz.latitude,2) + POW(cz.longitude - rz.longitude,2)) ASC, cp.total_assigned ASC
         LIMIT 1`,
        [request.zone_id]
      );
      if (rows.length > 0) collector = rows[0];
    }

    // 3. Any active collector regardless of availability_status (last resort)
    if (!collector) {
      const [rows] = await conn.execute(
        `SELECT u.id AS collector_user_id, cp.id AS profile_id, cp.total_assigned
         FROM collector_profiles cp
         JOIN users u ON u.id = cp.user_id
         WHERE u.role = 'collector' AND u.account_status = 'active'
         ORDER BY cp.total_assigned ASC LIMIT 1`
      );
      if (rows.length > 0) collector = rows[0];
    }

    if (!collector) {
      await conn.rollback();
      return res.status(409).json({ message: 'No collector is currently available for assignment. Please contact support.' });
    }

    // ── Create assignment ──────────────────────────────────────────────────────
    const assignNote = note || `Resident-selected truck ${truck.truck_code}; auto-assigned collector.`;
    const [assignmentResult] = await conn.execute(
      `INSERT INTO pickup_assignments
       (request_id, collector_user_id, truck_id, assigned_by_user_id, assignment_status, notes)
       VALUES (?, ?, ?, ?, 'assigned', ?)`,
      [request.id, collector.collector_user_id, truck.id, assigned_by_user_id || null, assignNote]
    );

    await conn.execute(
      `UPDATE pickup_requests SET request_status = 'assigned' WHERE id = ?`,
      [request.id]
    );

    await conn.execute(
      `UPDATE collector_profiles
       SET availability_status = 'busy', total_assigned = total_assigned + 1, current_zone_id = ?
       WHERE user_id = ?`,
      [request.zone_id, collector.collector_user_id]
    );

    await conn.execute(
      `UPDATE trucks SET truck_status = 'assigned', current_zone_id = ? WHERE id = ?`,
      [request.zone_id, truck.id]
    );

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, request_id, assignment_id, activity_type, details, ip_address)
       VALUES (?, ?, ?, 'request_assigned', ?, ?)`,
      [
        assigned_by_user_id || null,
        request.id,
        assignmentResult.insertId,
        `Assigned collector ${collector.collector_user_id} and truck ${truck.truck_code} to ${request.request_code}.`,
        req.ip || null,
      ]
    );

    await conn.commit();
    res.json({
      message: 'Collector and truck assigned successfully.',
      assignment_id: assignmentResult.insertId,
      collector_user_id: collector.collector_user_id,
      truck_id: truck.id,
      truck_code: truck.truck_code,
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
}

async function cancelPickupRequest(req, res, next) {
  const requestId = Number(req.params.id);
  const { cancelled_by_user_id, cancellation_note } = req.body;

  if (!requestId) {
    return res.status(400).json({ message: 'Valid request id is required.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [requestRows] = await conn.execute(
      `SELECT id, request_code, request_status FROM pickup_requests WHERE id = ? FOR UPDATE`,
      [requestId]
    );

    if (requestRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Pickup request not found.' });
    }

    const request = requestRows[0];
    if (request.request_status === 'completed' || request.request_status === 'cancelled') {
      await conn.rollback();
      return res.status(409).json({ message: `Cannot cancel a ${request.request_status} request.` });
    }

    // If assigned or in_progress, free up the collector and truck
    if (request.request_status === 'assigned' || request.request_status === 'in_progress') {
      const [assignmentRows] = await conn.execute(
        `SELECT id, collector_user_id, truck_id FROM pickup_assignments
         WHERE request_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE`,
        [requestId]
      );

      if (assignmentRows.length > 0) {
        const assignment = assignmentRows[0];
        await conn.execute(
          `UPDATE collector_profiles SET availability_status = 'available' WHERE user_id = ?`,
          [assignment.collector_user_id]
        );
        await conn.execute(
          `UPDATE trucks SET truck_status = 'available' WHERE id = ?`,
          [assignment.truck_id]
        );
        await conn.execute(
          `UPDATE pickup_assignments SET assignment_status = 'cancelled' WHERE id = ?`,
          [assignment.id]
        );
      }
    }

    await conn.execute(
      `UPDATE pickup_requests SET request_status = 'cancelled' WHERE id = ?`,
      [requestId]
    );

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, request_id, activity_type, details, ip_address)
       VALUES (?, ?, 'request_cancelled', ?, ?)`,
      [
        cancelled_by_user_id || null,
        requestId,
        cancellation_note || `Request ${request.request_code} cancelled by admin.`,
        req.ip || null,
      ]
    );

    await conn.commit();
    res.json({ message: 'Pickup request cancelled successfully.' });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
}

module.exports = {
  createPickupRequest,
  assignNearestCollectorAndTruck,
  assignDirectTruckAndCollector,
  getNearbyAvailableTrucks,
  markCollectorArrived,
  confirmPickup,
  cancelPickupRequest,
  getPickupRequests,
  getPickupRequestById,
};
