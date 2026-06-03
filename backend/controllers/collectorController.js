const bcrypt = require('bcrypt');
const pool = require('../db');

function normalizeCollectorPayload(payload = {}) {
  return {
    full_name: String(payload.full_name || '').trim(),
    email: String(payload.email || '').trim().toLowerCase(),
    phone: String(payload.phone || '').trim(),
    password: String(payload.password || ''),
    address_line: String(payload.address_line || '').trim(),
    employee_code: String(payload.employee_code || '').trim().toUpperCase(),
    home_zone_id: Number(payload.home_zone_id),
    current_zone_id: Number(payload.current_zone_id || payload.home_zone_id),
    availability_status: String(payload.availability_status || 'available').trim(),
  };
}

async function validateZone(conn, zoneId) {
  const [zoneRows] = await conn.execute(
    'SELECT id FROM zones WHERE id = ? AND is_active = 1',
    [zoneId]
  );
  return zoneRows.length > 0;
}

async function generateEmployeeCode(conn) {
  const [rows] = await conn.execute(
    `SELECT employee_code
     FROM collector_profiles
     ORDER BY id DESC
     LIMIT 1`
  );

  const lastCode = rows[0]?.employee_code || 'COL-ABJ-1000';
  const numericPart = Number(String(lastCode).match(/(\d+)$/)?.[1] || 1000);
  return `COL-ABJ-${String(numericPart + 1).padStart(4, '0')}`;
}

async function getCollectors(_req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT cp.id AS collector_profile_id,
              u.id AS collector_user_id,
              u.full_name,
              u.email,
              u.phone,
              u.address_line,
              cp.employee_code,
              hz.zone_name AS home_zone,
              cz.zone_name AS current_zone,
              cp.availability_status,
              cp.total_assigned,
              cp.total_completed,
              cp.average_rating,
              u.account_status
       FROM collector_profiles cp
       JOIN users u ON u.id = cp.user_id
       JOIN zones hz ON hz.id = cp.home_zone_id
       JOIN zones cz ON cz.id = cp.current_zone_id
       WHERE u.account_status = 'active'
       ORDER BY u.full_name ASC`
    );

    res.json(rows);
  } catch (error) {
    next(error);
  }
}

async function createCollector(req, res, next) {
  const payload = normalizeCollectorPayload(req.body);
  const actorUserId = req.body?.actor_user_id || null;
  const validStatus = ['available', 'busy', 'off_duty'];

  if (!payload.full_name || !payload.email || !payload.phone || !payload.password || !payload.address_line || !payload.home_zone_id) {
    return res.status(400).json({
      message: 'full_name, email, phone, password, address_line, and home_zone_id are required.',
    });
  }

  if (payload.password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }

  if (!validStatus.includes(payload.availability_status)) {
    return res.status(400).json({ message: `availability_status must be one of: ${validStatus.join(', ')}` });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (!(await validateZone(conn, payload.home_zone_id)) || !(await validateZone(conn, payload.current_zone_id))) {
      await conn.rollback();
      return res.status(400).json({ message: 'Invalid zone selection.' });
    }

    const [existingUsers] = await conn.execute(
      'SELECT id FROM users WHERE email = ? OR phone = ?',
      [payload.email, payload.phone]
    );
    if (existingUsers.length > 0) {
      await conn.rollback();
      return res.status(409).json({ message: 'Email or phone already exists.' });
    }

    const employeeCode = payload.employee_code || await generateEmployeeCode(conn);
    const [existingCodes] = await conn.execute(
      'SELECT id FROM collector_profiles WHERE employee_code = ?',
      [employeeCode]
    );
    if (existingCodes.length > 0) {
      await conn.rollback();
      return res.status(409).json({ message: 'Employee code already exists.' });
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);
    const [userResult] = await conn.execute(
      `INSERT INTO users (full_name, email, phone, password_hash, role, address_line, zone_id)
       VALUES (?, ?, ?, ?, 'collector', ?, ?)`,
      [
        payload.full_name,
        payload.email,
        payload.phone,
        passwordHash,
        payload.address_line,
        payload.current_zone_id,
      ]
    );

    await conn.execute(
      `INSERT INTO collector_profiles (user_id, employee_code, home_zone_id, current_zone_id, availability_status)
       VALUES (?, ?, ?, ?, ?)`,
      [
        userResult.insertId,
        employeeCode,
        payload.home_zone_id,
        payload.current_zone_id,
        payload.availability_status,
      ]
    );

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, activity_type, details, ip_address)
       VALUES (?, 'collector_update', ?, ?)`,
      [
        actorUserId,
        `Collector created: ${payload.email} (${employeeCode}).`,
        req.ip || null,
      ]
    );

    await conn.commit();
    res.status(201).json({
      message: 'Collector created successfully.',
      collector_user_id: userResult.insertId,
      employee_code: employeeCode,
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
}

async function updateCollector(req, res, next) {
  const collectorUserId = Number(req.params.collectorUserId);
  const payload = normalizeCollectorPayload(req.body);
  const actorUserId = req.body?.actor_user_id || null;
  const validStatus = ['available', 'busy', 'off_duty'];

  if (!collectorUserId) {
    return res.status(400).json({ message: 'collectorUserId is required.' });
  }

  if (!payload.full_name || !payload.email || !payload.phone || !payload.address_line || !payload.home_zone_id) {
    return res.status(400).json({
      message: 'full_name, email, phone, address_line, and home_zone_id are required.',
    });
  }

  if (payload.password && payload.password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }

  if (!validStatus.includes(payload.availability_status)) {
    return res.status(400).json({ message: `availability_status must be one of: ${validStatus.join(', ')}` });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [collectorRows] = await conn.execute(
      `SELECT cp.id AS collector_profile_id, cp.employee_code
       FROM collector_profiles cp
       JOIN users u ON u.id = cp.user_id
       WHERE cp.user_id = ? AND u.role = 'collector'
       LIMIT 1`,
      [collectorUserId]
    );

    if (collectorRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Collector not found.' });
    }

    if (!(await validateZone(conn, payload.home_zone_id)) || !(await validateZone(conn, payload.current_zone_id))) {
      await conn.rollback();
      return res.status(400).json({ message: 'Invalid zone selection.' });
    }

    const [existingUsers] = await conn.execute(
      'SELECT id FROM users WHERE (email = ? OR phone = ?) AND id <> ?',
      [payload.email, payload.phone, collectorUserId]
    );
    if (existingUsers.length > 0) {
      await conn.rollback();
      return res.status(409).json({ message: 'Email or phone already exists.' });
    }

    if (payload.employee_code) {
      const [existingCodes] = await conn.execute(
        'SELECT id FROM collector_profiles WHERE employee_code = ? AND user_id <> ?',
        [payload.employee_code, collectorUserId]
      );
      if (existingCodes.length > 0) {
        await conn.rollback();
        return res.status(409).json({ message: 'Employee code already exists.' });
      }
    }

    await conn.execute(
      `UPDATE users
       SET full_name = ?,
           email = ?,
           phone = ?,
           address_line = ?,
           zone_id = ?
       WHERE id = ?`,
      [
        payload.full_name,
        payload.email,
        payload.phone,
        payload.address_line,
        payload.current_zone_id,
        collectorUserId,
      ]
    );

    if (payload.password) {
      const passwordHash = await bcrypt.hash(payload.password, 10);
      await conn.execute(
        'UPDATE users SET password_hash = ? WHERE id = ?',
        [passwordHash, collectorUserId]
      );
    }

    await conn.execute(
      `UPDATE collector_profiles
       SET employee_code = ?,
           home_zone_id = ?,
           current_zone_id = ?,
           availability_status = ?
       WHERE user_id = ?`,
      [
        payload.employee_code || collectorRows[0].employee_code,
        payload.home_zone_id,
        payload.current_zone_id,
        payload.availability_status,
        collectorUserId,
      ]
    );

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, activity_type, details, ip_address)
       VALUES (?, 'collector_update', ?, ?)`,
      [
        actorUserId,
        `Collector updated: ${payload.email} (${payload.employee_code || collectorRows[0].employee_code}).`,
        req.ip || null,
      ]
    );

    await conn.commit();
    res.json({ message: 'Collector updated successfully.' });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
}

async function updateCollectorAvailability(req, res, next) {
  const collectorUserId = Number(req.params.collectorUserId);
  const { availability_status, actor_user_id } = req.body;

  if (!collectorUserId || !availability_status) {
    return res.status(400).json({ message: 'collectorUserId and availability_status are required.' });
  }

  const validStatus = ['available', 'busy', 'off_duty'];
  if (!validStatus.includes(availability_status)) {
    return res.status(400).json({ message: `availability_status must be one of: ${validStatus.join(', ')}` });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.execute(
      `UPDATE collector_profiles
       SET availability_status = ?
       WHERE user_id = ?`,
      [availability_status, collectorUserId]
    );

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Collector profile not found.' });
    }

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, activity_type, details, ip_address)
       VALUES (?, 'collector_update', ?, ?)`,
      [
        actor_user_id || null,
        `Collector ${collectorUserId} availability changed to ${availability_status}.`,
        req.ip || null,
      ]
    );

    await conn.commit();
    res.json({ message: 'Collector availability updated successfully.' });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
}

async function deleteCollector(req, res, next) {
  const collectorUserId = Number(req.params.collectorUserId);
  const actorUserId = req.body?.actor_user_id || null;

  if (!collectorUserId) {
    return res.status(400).json({ message: 'collectorUserId is required.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [collectorRows] = await conn.execute(
      `SELECT u.id, u.email, cp.employee_code
       FROM users u
       JOIN collector_profiles cp ON cp.user_id = u.id
       WHERE u.id = ? AND u.role = 'collector'
       LIMIT 1`,
      [collectorUserId]
    );

    if (collectorRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Collector not found.' });
    }

    const collector = collectorRows[0];

    const [assignmentRows] = await conn.execute(
      'SELECT COUNT(*) AS total FROM pickup_assignments WHERE collector_user_id = ?',
      [collectorUserId]
    );
    const totalAssignments = Number(assignmentRows[0]?.total || 0);

    let message = 'Collector deleted successfully.';
    let mode = 'deleted';

    if (totalAssignments > 0) {
      await conn.execute(
        `UPDATE users
         SET account_status = 'suspended'
         WHERE id = ?`,
        [collectorUserId]
      );
      await conn.execute(
        `UPDATE collector_profiles
         SET availability_status = 'off_duty'
         WHERE user_id = ?`,
        [collectorUserId]
      );
      message = 'Collector archived successfully because assignment history exists.';
      mode = 'archived';
    } else {
      await conn.execute('DELETE FROM collector_profiles WHERE user_id = ?', [collectorUserId]);
      await conn.execute('DELETE FROM users WHERE id = ?', [collectorUserId]);
    }

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, activity_type, details, ip_address)
       VALUES (?, 'collector_update', ?, ?)`,
      [
        actorUserId,
        `Collector ${mode}: ${collector.email} (${collector.employee_code}).`,
        req.ip || null,
      ]
    );

    await conn.commit();
    res.json({ message, mode });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
}

module.exports = {
  getCollectors,
  createCollector,
  updateCollector,
  deleteCollector,
  updateCollectorAvailability,
};
