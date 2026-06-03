const bcrypt = require('bcrypt');
const pool = require('../db');

async function getAdmins(_req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT id, full_name, email, phone, address_line, zone_id, role, account_status, created_at
       FROM users
       WHERE role IN ('admin', 'super_admin')
       ORDER BY full_name ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function createAdmin(req, res, next) {
  const { full_name, email, phone, password, address_line } = req.body;
  const actorUserId = req.user?.user_id || null;

  if (!full_name || !email || !phone || !password || !address_line) {
    return res.status(400).json({
      message: 'full_name, email, phone, password, and address_line are required.',
    });
  }

  if (String(password).length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedPhone = String(phone).trim();

    const [existing] = await conn.execute(
      'SELECT id FROM users WHERE email = ? OR phone = ?',
      [normalizedEmail, normalizedPhone]
    );
    if (existing.length > 0) {
      await conn.rollback();
      return res.status(409).json({ message: 'Email or phone already exists.' });
    }

    const password_hash = await bcrypt.hash(String(password), 10);
    const [result] = await conn.execute(
      `INSERT INTO users (full_name, email, phone, password_hash, role, address_line)
       VALUES (?, ?, ?, ?, 'admin', ?)`,
      [
        String(full_name).trim(),
        normalizedEmail,
        normalizedPhone,
        password_hash,
        String(address_line).trim(),
      ]
    );

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, activity_type, details, ip_address)
       VALUES (?, 'status_update', ?, ?)`,
      [actorUserId, `Super admin created new admin account: ${normalizedEmail}`, req.ip || null]
    );

    await conn.commit();
    res.status(201).json({ message: 'Admin created successfully.', user_id: result.insertId });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

async function updateAdmin(req, res, next) {
  const adminUserId = Number(req.params.adminUserId);
  const { full_name, email, phone, address_line } = req.body;
  const actorUserId = req.user?.user_id || null;

  if (!full_name || !email || !phone || !address_line) {
    return res.status(400).json({
      message: 'full_name, email, phone, and address_line are required.',
    });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedPhone = String(phone).trim();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [target] = await conn.execute(
      "SELECT id FROM users WHERE id = ? AND role = 'admin'",
      [adminUserId]
    );
    if (target.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Admin not found.' });
    }

    const [conflict] = await conn.execute(
      'SELECT id FROM users WHERE (email = ? OR phone = ?) AND id != ?',
      [normalizedEmail, normalizedPhone, adminUserId]
    );
    if (conflict.length > 0) {
      await conn.rollback();
      return res.status(409).json({ message: 'Email or phone already used by another account.' });
    }

    await conn.execute(
      `UPDATE users SET full_name = ?, email = ?, phone = ?, address_line = ?
       WHERE id = ?`,
      [
        String(full_name).trim(),
        normalizedEmail,
        normalizedPhone,
        String(address_line).trim(),
        adminUserId,
      ]
    );

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, activity_type, details, ip_address)
       VALUES (?, 'status_update', ?, ?)`,
      [actorUserId, `Super admin updated admin account: ${normalizedEmail}`, req.ip || null]
    );

    await conn.commit();
    res.json({ message: 'Admin updated successfully.' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

async function setAdminStatus(req, res, next) {
  const adminUserId = Number(req.params.adminUserId);
  const { account_status } = req.body;
  const actorUserId = req.user?.user_id || null;

  const validStatuses = ['active', 'suspended'];
  if (!validStatuses.includes(account_status)) {
    return res.status(400).json({ message: 'account_status must be active or suspended.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [target] = await conn.execute(
      "SELECT id, email FROM users WHERE id = ? AND role = 'admin'",
      [adminUserId]
    );
    if (target.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Admin not found.' });
    }

    await conn.execute(
      'UPDATE users SET account_status = ? WHERE id = ?',
      [account_status, adminUserId]
    );

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, activity_type, details, ip_address)
       VALUES (?, 'status_update', ?, ?)`,
      [
        actorUserId,
        `Super admin set admin ${target[0].email} status to ${account_status}`,
        req.ip || null,
      ]
    );

    await conn.commit();
    res.json({
      message: `Admin account ${account_status === 'active' ? 'activated' : 'suspended'} successfully.`,
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

async function resetAdminPassword(req, res, next) {
  const adminUserId = Number(req.params.adminUserId);
  const { new_password } = req.body;
  const actorUserId = req.user?.user_id || null;

  if (!new_password || String(new_password).length < 8) {
    return res.status(400).json({ message: 'new_password must be at least 8 characters.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [target] = await conn.execute(
      "SELECT id, email FROM users WHERE id = ? AND role = 'admin'",
      [adminUserId]
    );
    if (target.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Admin not found.' });
    }

    const password_hash = await bcrypt.hash(String(new_password), 10);
    await conn.execute(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [password_hash, adminUserId]
    );

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, activity_type, details, ip_address)
       VALUES (?, 'status_update', ?, ?)`,
      [actorUserId, `Super admin reset password for admin: ${target[0].email}`, req.ip || null]
    );

    await conn.commit();
    res.json({ message: 'Admin password reset successfully.' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

async function deleteAdmin(req, res, next) {
  const adminUserId = Number(req.params.adminUserId);
  const actorUserId = req.user?.user_id || null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [target] = await conn.execute(
      "SELECT id, email FROM users WHERE id = ? AND role = 'admin'",
      [adminUserId]
    );
    if (target.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Admin not found.' });
    }

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, activity_type, details, ip_address)
       VALUES (?, 'status_update', ?, ?)`,
      [actorUserId, `Super admin deleted admin account: ${target[0].email}`, req.ip || null]
    );

    // Null out FK references in activity_logs before deleting the user
    await conn.execute(
      'UPDATE activity_logs SET actor_user_id = NULL WHERE actor_user_id = ?',
      [adminUserId]
    );

    await conn.execute('DELETE FROM users WHERE id = ?', [adminUserId]);

    await conn.commit();
    res.json({ message: 'Admin deleted successfully.' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

module.exports = {
  getAdmins,
  createAdmin,
  updateAdmin,
  setAdminStatus,
  resetAdminPassword,
  deleteAdmin,
};
