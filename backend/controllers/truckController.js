const pool = require('../db');

async function getTrucks(_req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT t.id, t.truck_code, t.plate_number, t.model_name,
              t.capacity_kg, t.average_speed_kmh, t.truck_status,
              t.current_zone_id, z.zone_name AS current_zone,
              t.created_at, t.updated_at
       FROM trucks t
       JOIN zones z ON z.id = t.current_zone_id
       ORDER BY t.truck_code ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function createTruck(req, res, next) {
  const { truck_code, plate_number, model_name, capacity_kg, average_speed_kmh, current_zone_id, truck_status } = req.body;
  const actorUserId = req.user?.user_id || null;

  if (!truck_code || !plate_number || !model_name || !capacity_kg || !current_zone_id) {
    return res.status(400).json({
      message: 'truck_code, plate_number, model_name, capacity_kg, and current_zone_id are required.',
    });
  }

  const capacityNum = Number(capacity_kg);
  if (!Number.isInteger(capacityNum) || capacityNum <= 0) {
    return res.status(400).json({ message: 'capacity_kg must be a positive integer.' });
  }

  const speedNum = average_speed_kmh !== undefined ? Number(average_speed_kmh) : 28.0;
  if (!Number.isFinite(speedNum) || speedNum <= 0) {
    return res.status(400).json({ message: 'average_speed_kmh must be a positive number.' });
  }

  const validStatuses = ['available', 'assigned', 'maintenance', 'inactive'];
  const status = truck_status || 'available';
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: `truck_status must be one of: ${validStatuses.join(', ')}` });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [zoneRows] = await conn.execute('SELECT id FROM zones WHERE id = ? AND is_active = 1', [Number(current_zone_id)]);
    if (zoneRows.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'Invalid or inactive zone.' });
    }

    const [conflict] = await conn.execute(
      'SELECT id FROM trucks WHERE truck_code = ? OR plate_number = ?',
      [String(truck_code).trim().toUpperCase(), String(plate_number).trim().toUpperCase()]
    );
    if (conflict.length > 0) {
      await conn.rollback();
      return res.status(409).json({ message: 'Truck code or plate number already exists.' });
    }

    const [result] = await conn.execute(
      `INSERT INTO trucks (truck_code, plate_number, model_name, capacity_kg, average_speed_kmh, current_zone_id, truck_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        String(truck_code).trim().toUpperCase(),
        String(plate_number).trim().toUpperCase(),
        String(model_name).trim(),
        capacityNum,
        speedNum,
        Number(current_zone_id),
        status,
      ]
    );

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, activity_type, details, ip_address)
       VALUES (?, 'status_update', ?, ?)`,
      [actorUserId, `Admin added truck: ${String(truck_code).trim().toUpperCase()}`, req.ip || null]
    );

    await conn.commit();
    res.status(201).json({ message: 'Truck created successfully.', truck_id: result.insertId });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

async function updateTruck(req, res, next) {
  const truckId = Number(req.params.truckId);
  const { truck_code, plate_number, model_name, capacity_kg, average_speed_kmh, current_zone_id, truck_status } = req.body;
  const actorUserId = req.user?.user_id || null;

  if (!truck_code || !plate_number || !model_name || !capacity_kg || !current_zone_id) {
    return res.status(400).json({
      message: 'truck_code, plate_number, model_name, capacity_kg, and current_zone_id are required.',
    });
  }

  const capacityNum = Number(capacity_kg);
  if (!Number.isInteger(capacityNum) || capacityNum <= 0) {
    return res.status(400).json({ message: 'capacity_kg must be a positive integer.' });
  }

  const speedNum = average_speed_kmh !== undefined ? Number(average_speed_kmh) : 28.0;
  if (!Number.isFinite(speedNum) || speedNum <= 0) {
    return res.status(400).json({ message: 'average_speed_kmh must be a positive number.' });
  }

  const validStatuses = ['available', 'assigned', 'maintenance', 'inactive'];
  const status = truck_status || 'available';
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: `truck_status must be one of: ${validStatuses.join(', ')}` });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [target] = await conn.execute('SELECT id FROM trucks WHERE id = ?', [truckId]);
    if (target.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Truck not found.' });
    }

    const [zoneRows] = await conn.execute('SELECT id FROM zones WHERE id = ? AND is_active = 1', [Number(current_zone_id)]);
    if (zoneRows.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'Invalid or inactive zone.' });
    }

    const [conflict] = await conn.execute(
      'SELECT id FROM trucks WHERE (truck_code = ? OR plate_number = ?) AND id != ?',
      [String(truck_code).trim().toUpperCase(), String(plate_number).trim().toUpperCase(), truckId]
    );
    if (conflict.length > 0) {
      await conn.rollback();
      return res.status(409).json({ message: 'Truck code or plate number already used by another truck.' });
    }

    await conn.execute(
      `UPDATE trucks SET truck_code = ?, plate_number = ?, model_name = ?,
              capacity_kg = ?, average_speed_kmh = ?, current_zone_id = ?, truck_status = ?
       WHERE id = ?`,
      [
        String(truck_code).trim().toUpperCase(),
        String(plate_number).trim().toUpperCase(),
        String(model_name).trim(),
        capacityNum,
        speedNum,
        Number(current_zone_id),
        status,
        truckId,
      ]
    );

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, activity_type, details, ip_address)
       VALUES (?, 'status_update', ?, ?)`,
      [actorUserId, `Admin updated truck id=${truckId}: ${String(truck_code).trim().toUpperCase()}`, req.ip || null]
    );

    await conn.commit();
    res.json({ message: 'Truck updated successfully.' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

async function updateTruckStatus(req, res, next) {
  const truckId = Number(req.params.truckId);
  const { truck_status } = req.body;
  const actorUserId = req.user?.user_id || null;

  const validStatuses = ['available', 'assigned', 'maintenance', 'inactive'];
  if (!validStatuses.includes(truck_status)) {
    return res.status(400).json({ message: `truck_status must be one of: ${validStatuses.join(', ')}` });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [target] = await conn.execute('SELECT id, truck_code FROM trucks WHERE id = ?', [truckId]);
    if (target.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Truck not found.' });
    }

    await conn.execute('UPDATE trucks SET truck_status = ? WHERE id = ?', [truck_status, truckId]);

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, activity_type, details, ip_address)
       VALUES (?, 'status_update', ?, ?)`,
      [actorUserId, `Admin set truck ${target[0].truck_code} status to ${truck_status}`, req.ip || null]
    );

    await conn.commit();
    res.json({ message: `Truck status updated to ${truck_status}.` });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

async function deleteTruck(req, res, next) {
  const truckId = Number(req.params.truckId);
  const actorUserId = req.user?.user_id || null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [target] = await conn.execute('SELECT id, truck_code, truck_status FROM trucks WHERE id = ?', [truckId]);
    if (target.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Truck not found.' });
    }

    // Block deletion if currently assigned
    if (target[0].truck_status === 'assigned') {
      await conn.rollback();
      return res.status(409).json({ message: 'Cannot delete a truck that is currently assigned. Change its status first.' });
    }

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, activity_type, details, ip_address)
       VALUES (?, 'status_update', ?, ?)`,
      [actorUserId, `Admin deleted truck: ${target[0].truck_code}`, req.ip || null]
    );

    await conn.execute('DELETE FROM trucks WHERE id = ?', [truckId]);

    await conn.commit();
    res.json({ message: 'Truck deleted successfully.' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

module.exports = { getTrucks, createTruck, updateTruck, updateTruckStatus, deleteTruck };
