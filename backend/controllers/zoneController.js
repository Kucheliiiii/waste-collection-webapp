const pool = require('../db');

async function getZones(_req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT id, zone_name, latitude, longitude, is_active, created_at, updated_at
       FROM zones
       ORDER BY zone_name ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function createZone(req, res, next) {
  const { zone_name, latitude, longitude } = req.body;
  const actorUserId = req.user?.user_id || null;

  if (!zone_name || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ message: 'zone_name, latitude, and longitude are required.' });
  }

  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return res.status(400).json({ message: 'latitude must be a number between -90 and 90.' });
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({ message: 'longitude must be a number between -180 and 180.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [conflict] = await conn.execute(
      'SELECT id FROM zones WHERE zone_name = ?',
      [String(zone_name).trim()]
    );
    if (conflict.length > 0) {
      await conn.rollback();
      return res.status(409).json({ message: 'A zone with this name already exists.' });
    }

    const [result] = await conn.execute(
      'INSERT INTO zones (zone_name, latitude, longitude) VALUES (?, ?, ?)',
      [String(zone_name).trim(), lat, lng]
    );

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, activity_type, details, ip_address)
       VALUES (?, 'status_update', ?, ?)`,
      [actorUserId, `Admin created zone: ${String(zone_name).trim()}`, req.ip || null]
    );

    await conn.commit();
    res.status(201).json({ message: 'Zone created successfully.', zone_id: result.insertId });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

async function updateZone(req, res, next) {
  const zoneId = Number(req.params.zoneId);
  const { zone_name, latitude, longitude, is_active } = req.body;
  const actorUserId = req.user?.user_id || null;

  if (!zone_name || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ message: 'zone_name, latitude, and longitude are required.' });
  }

  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return res.status(400).json({ message: 'latitude must be a number between -90 and 90.' });
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({ message: 'longitude must be a number between -180 and 180.' });
  }

  const activeValue = is_active === undefined ? 1 : (is_active ? 1 : 0);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [target] = await conn.execute('SELECT id FROM zones WHERE id = ?', [zoneId]);
    if (target.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Zone not found.' });
    }

    const [conflict] = await conn.execute(
      'SELECT id FROM zones WHERE zone_name = ? AND id != ?',
      [String(zone_name).trim(), zoneId]
    );
    if (conflict.length > 0) {
      await conn.rollback();
      return res.status(409).json({ message: 'Another zone with this name already exists.' });
    }

    await conn.execute(
      'UPDATE zones SET zone_name = ?, latitude = ?, longitude = ?, is_active = ? WHERE id = ?',
      [String(zone_name).trim(), lat, lng, activeValue, zoneId]
    );

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, activity_type, details, ip_address)
       VALUES (?, 'status_update', ?, ?)`,
      [actorUserId, `Admin updated zone id=${zoneId}: ${String(zone_name).trim()}`, req.ip || null]
    );

    await conn.commit();
    res.json({ message: 'Zone updated successfully.' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

async function toggleZoneStatus(req, res, next) {
  const zoneId = Number(req.params.zoneId);
  const { is_active } = req.body;
  const actorUserId = req.user?.user_id || null;

  if (is_active === undefined) {
    return res.status(400).json({ message: 'is_active is required.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [target] = await conn.execute('SELECT id, zone_name FROM zones WHERE id = ?', [zoneId]);
    if (target.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Zone not found.' });
    }

    await conn.execute('UPDATE zones SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, zoneId]);

    const statusLabel = is_active ? 'activated' : 'deactivated';
    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, activity_type, details, ip_address)
       VALUES (?, 'status_update', ?, ?)`,
      [actorUserId, `Admin ${statusLabel} zone: ${target[0].zone_name}`, req.ip || null]
    );

    await conn.commit();
    res.json({ message: `Zone ${statusLabel} successfully.` });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

async function deleteZone(req, res, next) {
  const zoneId = Number(req.params.zoneId);
  const actorUserId = req.user?.user_id || null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [target] = await conn.execute('SELECT id, zone_name FROM zones WHERE id = ?', [zoneId]);
    if (target.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Zone not found.' });
    }

    // Check if any active users, collectors, trucks or requests reference this zone
    const [[{ cnt: userCount }]] = await conn.execute(
      "SELECT COUNT(*) AS cnt FROM users WHERE zone_id = ? AND account_status = 'active'",
      [zoneId]
    );
    const [[{ cnt: truckCount }]] = await conn.execute(
      "SELECT COUNT(*) AS cnt FROM trucks WHERE current_zone_id = ? AND truck_status != 'inactive'",
      [zoneId]
    );
    const [[{ cnt: requestCount }]] = await conn.execute(
      "SELECT COUNT(*) AS cnt FROM pickup_requests WHERE zone_id = ? AND request_status NOT IN ('completed','cancelled')",
      [zoneId]
    );

    if (Number(userCount) > 0 || Number(truckCount) > 0 || Number(requestCount) > 0) {
      await conn.rollback();
      return res.status(409).json({
        message: `Cannot delete zone "${target[0].zone_name}": it has active users, trucks, or open pickup requests. Deactivate it instead.`,
      });
    }

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, activity_type, details, ip_address)
       VALUES (?, 'status_update', ?, ?)`,
      [actorUserId, `Admin deleted zone: ${target[0].zone_name}`, req.ip || null]
    );

    await conn.execute('DELETE FROM zones WHERE id = ?', [zoneId]);

    await conn.commit();
    res.json({ message: 'Zone deleted successfully.' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

module.exports = { getZones, createZone, updateZone, toggleZoneStatus, deleteZone };
